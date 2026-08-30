import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, ArrowRight, Check, Pin, PinOff, Plus, RefreshCw, Search, TriangleAlert, X } from "lucide-react";
import { useBudgetStore } from "../../store/budgetStore";
import {
  ALL_CURRENCY_CODES,
  CURRENCY_SYMBOLS,
  canConvert,
  crossRate,
  currencyName,
  formatRate,
  searchCurrencies,
  trackedCurrencies,
  unpinBlockedReason,
} from "../../domain/currency";
import {
  applyRatesToSettings,
  fetchExchangeRates,
  noteRateFailure,
  rateFreshness,
} from "../../domain/exchangeRates";
import type { CurrencyCode } from "../../domain/types";
import { useTranslation } from "../../i18n/useTranslation";
import { Button } from "../ui/Button";
import { EditorSheet } from "../ui/EditorSheet";
import { Section } from "../ui/Section";

/**
 * The Currencies tab
 * ==================
 *
 * Everything about money-as-money in one place: which currencies this budget
 * deals in, and what they are worth against each other. Exchange rates used to
 * be a separate Settings category, which meant the two halves of one subject
 * sat on different screens and the rate you were reading had nothing on it to
 * say which currencies it applied to.
 *
 * The panel has two **modes**, and the whole design turns on keeping them
 * apart:
 *
 *  - **Manage** (default). Currencies are pinned and unpinned here. Unpinning
 *    is a double-tap *plus* a confirmation, and there is an ordinary button
 *    doing the same thing for anyone who cannot double-tap reliably.
 *  - **Exchange**. The grid takes an amber treatment, the mode says so in
 *    words as well as in colour, and tapping a currency selects it rather than
 *    unpinning it. Two taps give a rate, in the direction they were tapped.
 *
 * A double-tap can never unpin while exchange mode is on, and a tap can never
 * select while it is off. That is enforced in one place — `onCurrencyPress` —
 * rather than by two handlers that have to agree.
 */
export const CurrencyPanel: React.FC = () => {
  const { t, formatDate } = useTranslation();
  const snapshot = useBudgetStore((state) => state.snapshot);
  const update = useBudgetStore((state) => state.updateSettings);
  const settings = snapshot.settings;

  const pinned = useMemo(() => trackedCurrencies(settings), [settings]);

  const [exchangeMode, setExchangeMode] = useState(false);
  const [firstPick, setFirstPick] = useState<CurrencyCode | null>(null);
  const [pair, setPair] = useState<{ from: CurrencyCode; to: CurrencyCode } | null>(null);
  const [unpinTarget, setUnpinTarget] = useState<CurrencyCode | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  /**
   * Double-tap tracking.
   *
   * 700ms, not the 250–300ms a desktop double-click uses. A finger on a phone
   * — especially one belonging to somebody with a tremor, or wearing gloves —
   * does not hit a quarter-second window reliably, and the cost of missing it
   * is that a destructive action becomes unreachable. The generous window is
   * safe precisely because the second tap only *opens a confirmation*.
   */
  const lastTap = useRef<{ code: CurrencyCode; at: number } | null>(null);
  const DOUBLE_TAP_MS = 700;

  // Leaving exchange mode must not leave a half-made selection behind, or the
  // next visit starts with an invisible first pick already chosen.
  useEffect(() => {
    if (!exchangeMode) {
      setFirstPick(null);
      setPair(null);
    }
  }, [exchangeMode]);

  const freshness = rateFreshness(settings.exchangeRates);

  /**
   * Fetch rates.
   *
   * A failure never touches the stored rates and never moves `ratesUpdatedAt`:
   * the numbers on screen stay the last ones that genuinely arrived, and the
   * panel says so. Presenting a failed refresh as a successful one is the one
   * outcome that would make every converted figure untrustworthy.
   */
  const refresh = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await fetchExchangeRates({ force: true });
      if (result.snapshot && result.status !== "unavailable") {
        update({ exchangeRates: applyRatesToSettings(settings.exchangeRates, result.snapshot) });
        setMessage({ ok: true, text: t("currencies.ratesUpdated", { when: formatDate(result.snapshot.fetchedAt, { dateStyle: "medium", timeStyle: "short" } as Intl.DateTimeFormatOptions) }) });
      } else {
        const reason = result.message ?? t("currencies.providerUnreachable");
        update({ exchangeRates: noteRateFailure(settings.exchangeRates, reason) });
        setMessage({ ok: false, text: `${t("currencies.ratesFailed")} ${reason}` });
      }
    } finally {
      setBusy(false);
    }
  };

  /**
   * One press, two possible meanings — decided here and nowhere else.
   *
   * In exchange mode a press is a selection, full stop: the double-tap timer
   * is not even consulted, so a quick second tap on the same currency cannot
   * unpin it. Outside exchange mode a press is only meaningful as the second
   * half of a double-tap, which opens the confirmation.
   */
  const onCurrencyPress = (code: CurrencyCode) => {
    if (exchangeMode) {
      lastTap.current = null;
      if (firstPick == null) {
        setFirstPick(code);
        return;
      }
      if (firstPick === code) {
        // Tapping the same one twice is a change of mind, not a rate of 1.
        setFirstPick(null);
        return;
      }
      setPair({ from: firstPick, to: code });
      setFirstPick(null);
      return;
    }

    const now = Date.now();
    const previous = lastTap.current;
    if (previous && previous.code === code && now - previous.at <= DOUBLE_TAP_MS) {
      lastTap.current = null;
      setUnpinTarget(code);
      return;
    }
    lastTap.current = { code, at: now };
  };

  const pin = (code: CurrencyCode) => {
    if (pinned.includes(code)) return;
    update({ trackedCurrencies: [...pinned, code] });
    setMessage({ ok: true, text: `${currencyName(code)} (${code})` });
  };

  const unpin = (code: CurrencyCode) => {
    update({ trackedCurrencies: pinned.filter((entry) => entry !== code) });
    setUnpinTarget(null);
  };

  const rateAgainstBase = (code: CurrencyCode): string | null => {
    if (code === settings.baseCurrency) return null;
    const rate = crossRate(code, settings.baseCurrency, settings.exchangeRates);
    return rate == null ? null : `1 ${code} = ${formatRate(rate)} ${settings.baseCurrency}`;
  };

  const unconvertible = pinned.filter((code) => !canConvert(code, settings.baseCurrency, settings.exchangeRates));

  return (
    <div className="page-enter currency-page" data-exchange-mode={exchangeMode ? "on" : "off"} style={{ display: "grid", gap: 20 }}>
      <Section
        title={t("currencies.title")}
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
              <Plus size={14} /> {t("currencies.addCurrency")}
            </Button>
            {/* The mode switch. `aria-pressed` rather than a checkbox: it is a
                toggle button, and a screen reader should say "pressed" not
                "checked". */}
            <Button
              variant={exchangeMode ? "primary" : "secondary"}
              size="sm"
              aria-pressed={exchangeMode}
              data-action="exchange-mode"
              className={exchangeMode ? "exchange-toggle-active" : undefined}
              onClick={() => setExchangeMode((on) => !on)}
            >
              <ArrowLeftRight size={14} /> {t("currencies.exchangeMode")}
            </Button>
          </div>
        }
      >
        <p className="text-note" style={{ marginBottom: 14 }}>
          {t("currencies.pinnedHint")}
        </p>

        {/* What the mode is, in words. Colour alone cannot carry a state
            change: it is invisible to a colour-blind user and to anyone who
            simply was not looking at the moment it changed. */}
        {exchangeMode && (
          <div className="exchange-banner" role="status">
            <ArrowLeftRight size={15} aria-hidden="true" />
            <span>
              <strong>{t("currencies.exchangeModeOn")}</strong>{" "}
              {firstPick
                ? t("currencies.exchangePickSecond")
                : t("currencies.exchangePickFirst")}
            </span>
            {firstPick && (
              <span className="exchange-banner-pick">
                {CURRENCY_SYMBOLS[firstPick]} {firstPick}
              </span>
            )}
          </div>
        )}

        <div
          className={`currency-grid${exchangeMode ? " currency-grid-exchange" : ""}`}
          role="group"
          aria-label={t("a11y.currencyGrid")}
        >
          {pinned.map((code) => {
            const blocked = unpinBlockedReason(snapshot, code);
            const selected = firstPick === code;
            const rate = rateAgainstBase(code);
            const noRate = !canConvert(code, settings.baseCurrency, settings.exchangeRates);
            return (
              <div
                key={code}
                className={`currency-card${selected ? " currency-card-selected" : ""}`}
                data-blocked={blocked ?? undefined}
              >
                <button
                  type="button"
                  className="currency-card-face"
                  data-currency={code}
                  aria-pressed={exchangeMode ? selected : undefined}
                  aria-label={
                    exchangeMode
                      ? `${currencyName(code)} (${code})`
                      : `${currencyName(code)} (${code}). ${t("currencies.doubleTapHint")}`
                  }
                  onClick={() => onCurrencyPress(code)}
                  // The desktop half of the same gesture. `onDoubleClick` fires
                  // after two `onClick`s, and the manual timer above already
                  // handles that pair — so this is only a safety net for
                  // browsers that suppress the second click.
                  onDoubleClick={() => {
                    if (!exchangeMode) setUnpinTarget(code);
                  }}
                >
                  <span className="currency-card-symbol" aria-hidden="true">
                    {CURRENCY_SYMBOLS[code]}
                  </span>
                  <span className="currency-card-code">{code}</span>
                  <span className="currency-card-name">{currencyName(code)}</span>
                  <span className="currency-card-rate">
                    {code === settings.baseCurrency ? t("settings.displayCurrency") : (rate ?? "—")}
                  </span>
                  {noRate && (
                    <span className="currency-card-warning" title={t("currencies.noRateWarning", { base: settings.baseCurrency })}>
                      <TriangleAlert size={12} aria-hidden="true" />
                    </span>
                  )}
                  {selected && <span className="currency-card-tick" aria-hidden="true"><Check size={14} /></span>}
                </button>

                {/* The accessible path to the same action.

                    A gesture must never be the only way to reach something: a
                    double-tap is unavailable to a keyboard, unreliable for
                    anyone with a motor impairment, and undiscoverable for
                    everybody. Hidden while exchange mode is on, where
                    unpinning is not what a press means. */}
                {!exchangeMode && (
                  <button
                    type="button"
                    className="currency-card-unpin"
                    disabled={blocked != null}
                    title={
                      blocked === "display-currency"
                        ? t("currencies.cannotUnpinDisplay")
                        : blocked === "budget-currency"
                          ? t("currencies.cannotUnpinBudget")
                          : blocked === "in-use"
                            ? t("currencies.cannotUnpinInUse")
                            : t("currencies.unpin", { code })
                    }
                    aria-label={t("currencies.unpin", { code })}
                    onClick={() => setUnpinTarget(code)}
                  >
                    <PinOff size={13} aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* The answer, under the cards that were tapped for it. */}
        {pair && (
          <ExchangeResult
            pair={pair}
            onClose={() => setPair(null)}
            onReverse={() => setPair({ from: pair.to, to: pair.from })}
          />
        )}

        {!exchangeMode && (
          <p className="text-caption" style={{ marginTop: 10 }}>
            {t("currencies.doubleTapHint")}
          </p>
        )}

        {unconvertible.length > 0 && (
          <p className="text-caption" style={{ color: "var(--warning-text)", marginTop: 8 }}>
            {t("currencies.noRateWarning", { base: settings.baseCurrency })}
          </p>
        )}
      </Section>

      {/* Rates live here now, not in a Settings category of their own — and
          under their own name: this section was also called "Exchange rate
          mode", which is the button at the top of the page and a different
          thing entirely. */}
      <Section title={t("currencies.liveRates")}>
        <div className="card card-body" style={{ display: "grid", gap: 12, maxWidth: 640 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={busy}>
              <RefreshCw size={14} className={busy ? "spin" : undefined} /> {t("currencies.updateNow")}
            </Button>
            <span className="text-caption">
              {freshness.state === "never"
                ? t("currencies.ratesNever")
                : t("currencies.ratesUpdated", {
                    when: formatDate(freshness.updatedAt!, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    } as Intl.DateTimeFormatOptions),
                  })}
              {settings.exchangeRates.ratesSource
                ? ` · ${t("currencies.ratesSource", { source: settings.exchangeRates.ratesSource })}`
                : ""}
            </span>
          </div>

          {/* Three states, told apart. A stale set and a failed refresh look
              identical if you only print a timestamp. */}
          {freshness.state === "stale" && (
            <div className="text-caption" style={{ color: "var(--warning-text)" }}>
              {t("currencies.ratesStale")}
            </div>
          )}
          {freshness.state === "failed" && (
            /* The provider's reason is English and technical — "Provider
               returned no usable USD rate" — and printing it after a
               translated sentence produced half a sentence in each language.
               It is diagnosis, so it goes where diagnosis goes. */
            <div
              className="text-caption"
              style={{ color: "var(--warning-text)" }}
              title={settings.exchangeRates.ratesLastError}
            >
              {t("currencies.ratesFailed")}
            </div>
          )}

          {/* What actually happens, not the provider's release schedule.
              This said "Rates refresh daily at 12:00 UTC" followed by a
              timestamp — a clock nobody wants to plan around, describing an
              internal rule. Rates refresh when the app is opened; the 12:00
              boundary is one of two triggers behind that and is not a thing to
              tell anybody about. */}
          <div className="text-note">
            {t("currencies.ratesSchedule")}
            {freshness.state === "stale" ? ` · ${t("currencies.ratesStale")}` : ""}
          </div>

          {message && (
            <div
              role="status"
              className="text-caption"
              style={{ color: message.ok ? "var(--success-text)" : "var(--warning-text)" }}
            >
              {message.text}
            </div>
          )}
        </div>
      </Section>

      {unpinTarget && (
        <UnpinDialog code={unpinTarget} onCancel={() => setUnpinTarget(null)} onConfirm={() => unpin(unpinTarget)} />
      )}

      {pickerOpen && (
        <CurrencyPicker
          pinned={pinned}
          onPin={(code) => {
            pin(code);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
};

/**
 * The rate between the two currencies that were tapped, in that order.
 *
 * Direction is the whole point: tapping EUR then USD asks "what is a euro
 * worth in dollars", and tapping them the other way round asks a different
 * question with a different answer. The heading says which was which, the
 * reciprocal is shown underneath rather than instead, and a Reverse button
 * swaps them without leaving the dialog.
 */
/**
 * The answer, in place.
 *
 * This was a full-screen sheet: a title, a subtitle, a three-row definition
 * list of direction, freshness and provider, and two footer buttons — to say
 * "1 EUR = 1.17 USD". Picking two currencies is a two-tap question and it
 * deserves a two-line answer, in the page you asked it in, next to the cards
 * you tapped.
 *
 * What survives is the rate, its inverse, and one button each to swap the
 * direction and to clear the pair. The freshness appears only when it is
 * *not* current, because "these rates are current" is the state a reader
 * assumes and does not need told.
 */
const ExchangeResult: React.FC<{
  pair: { from: CurrencyCode; to: CurrencyCode };
  onClose: () => void;
  onReverse: () => void;
}> = ({ pair, onClose, onReverse }) => {
  const { t } = useTranslation();
  const settings = useBudgetStore((state) => state.snapshot.settings);
  const rates = settings.exchangeRates;
  const rate = crossRate(pair.from, pair.to, rates);
  const inverse = crossRate(pair.to, pair.from, rates);
  const freshness = rateFreshness(rates);

  // Escape clears the pair, the same as the × — a mode you cannot leave with
  // the keyboard is a mode you are stuck in.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="exchange-result" data-exchange-result={`${pair.from}-${pair.to}`} role="status">
      <div className="exchange-result-pair">
        <span aria-hidden="true">{CURRENCY_SYMBOLS[pair.from]}</span> {pair.from}
        <ArrowRight size={14} aria-hidden="true" />
        <span aria-hidden="true">{CURRENCY_SYMBOLS[pair.to]}</span> {pair.to}
      </div>

      <div className="exchange-result-rates">
        {rate == null ? (
          <p className="text-body" style={{ margin: 0 }}>
            {t("currencies.exchangeUnknown", { from: pair.from, to: pair.to })}
          </p>
        ) : (
          <>
            <p className="exchange-result-primary money">
              {t("currencies.exchangeResult", { from: pair.from, rate: formatRate(rate), to: pair.to })}
            </p>
            {inverse != null && (
              <p className="text-note exchange-result-inverse">
                {t("currencies.exchangeReverse", { to: pair.to, rate: formatRate(inverse), from: pair.from })}
              </p>
            )}
          </>
        )}
        {freshness.state === "stale" && <p className="text-caption">{t("currencies.ratesStale")}</p>}
        {freshness.state === "failed" && <p className="text-caption">{t("currencies.ratesFailed")}</p>}
      </div>

      <div className="exchange-result-actions">
        <Button type="button" variant="ghost" size="sm" icon onClick={onReverse}
          aria-label={t("currencies.exchangeDirection", { from: pair.to, to: pair.from })}>
          <ArrowLeftRight size={15} />
        </Button>
        <Button type="button" variant="ghost" size="sm" icon onClick={onClose} aria-label={t("common.dismiss")}>
          <X size={15} />
        </Button>
      </div>
    </div>
  );
};

/** Unpinning asks first, and says exactly what survives it. */
const UnpinDialog: React.FC<{ code: CurrencyCode; onCancel: () => void; onConfirm: () => void }> = ({
  code,
  onCancel,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const snapshot = useBudgetStore((state) => state.snapshot);
  const blocked = unpinBlockedReason(snapshot, code);

  return (
    <EditorSheet
      title={t("currencies.unpinConfirmTitle", { code })}
      subtitle={currencyName(code)}
      onClose={onCancel}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button type="button" variant="danger" disabled={blocked != null} onClick={onConfirm}>
            <PinOff size={14} /> {t("currencies.unpin", { code })}
          </Button>
        </>
      }
    >
      <p className="text-body">{t("currencies.unpinConfirmBody", { code, name: currencyName(code) })}</p>
      {blocked && (
        <p className="text-caption" style={{ color: "var(--warning-text)", marginTop: 10 }}>
          {blocked === "display-currency"
            ? t("currencies.cannotUnpinDisplay")
            : blocked === "budget-currency"
              ? t("currencies.cannotUnpinBudget")
              : t("currencies.cannotUnpinInUse")}
        </p>
      )}
    </EditorSheet>
  );
};

/**
 * The searchable picker over the whole dataset.
 *
 * A hundred and sixty currencies cannot be a dropdown, and they must not be
 * *only* reachable through one either: this is how an unpinned currency is
 * discovered and pinned, which is the mechanism that makes narrowing the
 * dropdowns safe in the first place.
 */
const CurrencyPicker: React.FC<{
  pinned: CurrencyCode[];
  onPin: (code: CurrencyCode) => void;
  onClose: () => void;
}> = ({ pinned, onPin, onClose }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchCurrencies(query, ALL_CURRENCY_CODES), [query]);
  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

  return (
    <EditorSheet
      title={t("currencies.addCurrency")}
      subtitle={t("currencies.searchPlaceholder")}
      onClose={onClose}
      footer={
        <Button type="button" variant="primary" onClick={onClose}>
          {t("common.done")}
        </Button>
      }
    >
      <div className="currency-picker">
        <label className="currency-picker-search">
          <Search size={15} aria-hidden="true" />
          <input
            className="input"
            type="search"
            autoFocus
            placeholder={t("currencies.searchPlaceholder")}
            aria-label={t("currencies.searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <ul className="currency-picker-list">
          {results.map((code) => {
            const already = pinnedSet.has(code);
            return (
              <li key={code}>
                <button
                  type="button"
                  className="currency-picker-row"
                  disabled={already}
                  onClick={() => onPin(code)}
                  aria-label={already ? `${currencyName(code)} (${code})` : t("currencies.pin", { code })}
                >
                  <span className="currency-picker-symbol" aria-hidden="true">
                    {CURRENCY_SYMBOLS[code]}
                  </span>
                  <span className="currency-picker-text">
                    <span className="currency-picker-code">{code}</span>
                    <span className="text-caption">{currencyName(code)}</span>
                  </span>
                  {already ? <Pin size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                </button>
              </li>
            );
          })}
          {results.length === 0 && (
            <li className="text-caption currency-picker-empty">
              <X size={13} aria-hidden="true" /> {t("activities.noMatches")}
            </li>
          )}
        </ul>
      </div>
    </EditorSheet>
  );
};
