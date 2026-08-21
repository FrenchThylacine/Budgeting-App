import React, { useState } from "react";
import { AlertTriangle, Lock, RefreshCw } from "lucide-react";
import { CURRENCY_OPTIONS, CURRENCY_SYMBOLS, canConvert, currenciesInUse, trackedCurrencies } from "../../domain/currency";
import { formatDateTime } from "../../domain/dates";
import { applyRatesToSettings, fetchExchangeRates } from "../../domain/exchangeRates";
import { useBudgetStore } from "../../store/budgetStore";
import type { CurrencyCode, CurrencyDisplayMode, RoundingRule } from "../../domain/types";
import { ACTION_LABELS, AVAILABLE_ACTIONS, gesturesFor } from "../../domain/gestures";
import { ImportControl } from "../data/ImportControl";
import { AccountSettings } from "./AccountSettings";
import { Section } from "../ui/Section";
import { SyncStatus } from "../layout/SyncStatus";

const DISPLAY_MODES: { value: CurrencyDisplayMode; label: string }[] = [
  { value: "symbol", label: "Symbol only (€1 234)" },
  { value: "code", label: "Code only (EUR 1 234)" },
  { value: "both", label: "Symbol and code (€ EUR 1 234)" },
];

const ROUNDING_RULES: { value: RoundingRule; label: string }[] = [
  { value: "none", label: "No rounding" },
  { value: "nearest-1", label: "Nearest 1" },
  { value: "nearest-5", label: "Nearest 5" },
  { value: "nearest-10", label: "Nearest 10" },
  { value: "ceil-10", label: "Round up to 10" },
];

export const SettingsPanel: React.FC = () => {
  const snapshot = useBudgetStore((s) => s.snapshot);
  const settings = snapshot.settings;
  const update = useBudgetStore((s) => s.updateSettings);
  const lastSyncedAt = useBudgetStore((s) => s.lastSyncedAt);
  const syncError = useBudgetStore((s) => s.syncError);
  const pendingLocalChanges = useBudgetStore((s) => s.pendingLocalChanges);
  const syncNow = useBudgetStore((s) => s.syncNow);
  const retrySync = useBudgetStore((s) => s.retrySync);

  const [ratesBusy, setRatesBusy] = useState(false);
  const [rateMessage, setRateMessage] = useState<{ ok: boolean; text: string } | null>(null);

  /**
   * Fetching never overwrites a manual override, and a failure leaves the
   * existing rates in place — a stale rate is far better than a missing one,
   * which would make every converted figure read as zero.
   */
  const refreshRates = async () => {
    setRatesBusy(true);
    setRateMessage(null);
    try {
      const result = await fetchExchangeRates({ force: true });
      if (result.snapshot && result.status !== "unavailable") {
        update({ exchangeRates: applyRatesToSettings(settings.exchangeRates, result.snapshot) });
        setRateMessage({ ok: true, text: "Exchange rates updated." });
      } else {
        setRateMessage({
          ok: false,
          text: `Could not reach the rate provider${result.message ? ` (${result.message})` : ""}. Your current rates are unchanged.`,
        });
      }
    } finally {
      setRatesBusy(false);
    }
  };

  /** The offered set, and what is actually in the data behind it. */
  const tracked = trackedCurrencies(settings);
  const used = currenciesInUse(snapshot);

  const fieldStyle: React.CSSProperties = { display: "grid", gap: 6 };
  const checkboxStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" };

  return (
    <div className="page-enter" style={{ display: "grid", gap: 24 }}>
      <AccountSettings />

      <Section title="Currency">
        <div className="card card-body" style={{ display: "grid", gap: 16, maxWidth: 620 }}>
          {/* Which currencies exist, before which one everything is shown in.
              Ten currencies in every dropdown is nine wrong answers for
              somebody who deals in two. */}
          <div>
            <div className="text-callout" style={{ marginBottom: 4 }}>Currencies you use</div>
            <p className="text-note" style={{ marginBottom: 10 }}>
              Only these appear in the amount fields across the app. A record always keeps the
              currency it was entered in, even if you stop tracking it.
            </p>
            <div className="currency-chips" role="group" aria-label="Tracked currencies">
              {CURRENCY_OPTIONS.map((currency) => {
                const on = tracked.includes(currency);
                const isBase = currency === settings.baseCurrency;
                const inUse = used.has(currency);
                // Removing the display currency, or one that real records are
                // denominated in, would leave figures nothing can express.
                const locked = on && (isBase || inUse);
                const reason = isBase
                  ? "This is your display currency."
                  : inUse
                    ? "Records are stored in this currency."
                    : undefined;
                const noRate = on && !canConvert(currency, settings.baseCurrency, settings.exchangeRates);
                return (
                  <button
                    key={currency}
                    type="button"
                    className={`currency-chip${on ? " active" : ""}${locked ? " locked" : ""}`}
                    aria-pressed={on}
                    disabled={locked}
                    title={reason ?? (on ? `Stop tracking ${currency}` : `Track ${currency}`)}
                    onClick={() =>
                      update({
                        trackedCurrencies: on
                          ? tracked.filter((code) => code !== currency)
                          : [...tracked, currency],
                      })
                    }
                  >
                    <span aria-hidden="true" className="currency-chip-symbol">{CURRENCY_SYMBOLS[currency]}</span>
                    {currency}
                    {locked && <Lock size={11} aria-hidden="true" />}
                    {/* A currency with no usable rate would be converted 1:1,
                        which is a number rather than an answer. Saying so is
                        the difference between a stale figure and a wrong one. */}
                    {noRate && !locked && <AlertTriangle size={11} aria-hidden="true" style={{ color: "var(--warning-text)" }} />}
                  </button>
                );
              })}
            </div>
            {tracked.some((c) => !canConvert(c, settings.baseCurrency, settings.exchangeRates)) && (
              <p className="text-caption" style={{ color: "var(--warning-text)", marginTop: 8 }}>
                Some tracked currencies have no rate against {settings.baseCurrency}. Update the rates
                below, or set one by hand, before recording amounts in them — without a rate they would
                be converted one-for-one.
              </p>
            )}
          </div>

          <label className="text-callout" style={fieldStyle}>
            Display currency
            <select
              className="select"
              value={settings.baseCurrency}
              onChange={(e) => update({ baseCurrency: e.target.value as CurrencyCode })}
            >
              {tracked.map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </select>
            <span className="text-note">Everything is converted to this currency for display only.</span>
          </label>

          <label className="text-callout" style={fieldStyle}>
            Currency format
            <select
              className="select"
              value={settings.currencyDisplayMode}
              onChange={(e) => update({ currencyDisplayMode: e.target.value as CurrencyDisplayMode })}
            >
              {DISPLAY_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-callout" style={fieldStyle}>
            Rounding for suggested budgets
            <select
              className="select"
              value={settings.roundingRule}
              onChange={(e) => update({ roundingRule: e.target.value as RoundingRule })}
            >
              {ROUNDING_RULES.map((rule) => (
                <option key={rule.value} value={rule.value}>
                  {rule.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Section>

      <Section title="Budget">
        <div className="card card-body" style={{ display: "grid", gap: 16, maxWidth: 620 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 12 }}>
            <label className="text-callout" style={fieldStyle}>
              Monthly budget
              <input
                className="input"
                type="number"
                step="any"
                min="0"
                value={settings.monthlyBudget}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (Number.isFinite(value)) update({ monthlyBudget: value });
                }}
              />
            </label>

            {/* The budget amount is stored in this currency and converted for
                display. Without this control the number was interpreted in a
                currency the user could neither see nor change. */}
            <label className="text-callout" style={fieldStyle}>
              Budget currency
              <select
                className="select"
                value={settings.monthlyBudgetCurrency}
                onChange={(e) => update({ monthlyBudgetCurrency: e.target.value as CurrencyCode })}
              >
                {tracked.map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="text-caption" style={checkboxStyle}>
            <input
              type="checkbox"
              checked={settings.pilotIncludedInBudget}
              onChange={(e) => update({ pilotIncludedInBudget: e.target.checked })}
            />
            <span>Include Piloting in the monthly budget total</span>
          </label>

          {/* This used to be a checkbox reading "Exclude non-budget payment
              sources from analytics", off by default — which meant the app's
              default behaviour charged the user for money somebody else spent.
              It is a rule about what the figures mean, not a preference, so it
              is now unconditional and stated rather than offered. */}
          <p className="text-note" style={{ margin: 0 }}>
            Transactions marked <strong>Someone else paid</strong> or <strong>Outside my budget</strong> are
            kept at full value and stay visible in your spending, but never count against your budget,
            categories, forecast or health score.
          </p>
        </div>
      </Section>

      <Section title="Year-end behaviour">
        <div className="card card-body" style={{ display: "grid", gap: 16, maxWidth: 620 }}>
          <label className="text-caption" style={checkboxStyle}>
            <input
              type="checkbox"
              checked={settings.autoWishlistFlushEnabled}
              onChange={(e) => update({ autoWishlistFlushEnabled: e.target.checked })}
            />
            <span>
              Carry only unbought wishlist items into a new year
              <span className="text-note" style={{ display: "block" }}>
                When off, the whole wishlist is copied forward.
              </span>
            </span>
          </label>

          <label className="text-caption" style={checkboxStyle}>
            <input
              type="checkbox"
              checked={settings.saveTimestampEnabled}
              onChange={(e) => update({ saveTimestampEnabled: e.target.checked })}
            />
            <span>Record a “last updated” timestamp on every change</span>
          </label>
        </div>
      </Section>

      <Section title="Appearance">
        <div className="card card-body" style={{ display: "grid", gap: 16, maxWidth: 620 }}>
          <label className="text-caption" style={checkboxStyle}>
            <input
              type="checkbox"
              checked={settings.darkMode}
              onChange={(e) => update({ darkMode: e.target.checked })}
            />
            <span>Dark mode</span>
          </label>

          <label className="text-caption" style={checkboxStyle}>
            <input
              type="checkbox"
              checked={settings.liveClockEnabled !== false}
              onChange={(e) => update({ liveClockEnabled: e.target.checked })}
            />
            <span>
              Show a live clock in the period selector
              <span className="text-note" style={{ display: "block" }}>
                The date is always shown. Off, the time is omitted and the minute timer
                behind it stops.
              </span>
            </span>
          </label>
        </div>
      </Section>

      <Section title="Synchronization">
        <div className="card card-body" style={{ display: "grid", gap: 12, maxWidth: 620 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <SyncStatus />
            <span className="text-caption">
              {lastSyncedAt ? `Last synced ${formatDateTime(lastSyncedAt)}` : "Not yet synced with the server"}
            </span>
          </div>
          {syncError && (
            <div className="text-caption" style={{ color: "var(--warning-text)" }}>{syncError}</div>
          )}
          <div className="text-note">
            The server is the source of truth. This device keeps a local copy so the app works offline, but a
            change only reaches your other devices once it has been sent.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-secondary btn-sm" onClick={() => void syncNow({ force: true })}>
              <RefreshCw size={14} /> Sync now
            </button>
            {pendingLocalChanges && (
              <button className="btn btn-primary btn-sm" onClick={() => void retrySync()}>
                Send local changes
              </button>
            )}
          </div>
        </div>
      </Section>

      <Section title="Gestures">
        <p className="text-note" style={{ margin: "0 0 14px" }}>
          Swiping a row reveals its actions — it never performs them. The revealed button is a
          second, deliberate tap, and the same actions stay on the card for a mouse or a keyboard.
        </p>
        <div className="gesture-grid">
          {(["wishlist", "activities", "spending"] as const).map((surface) => {
            const current = gesturesFor(settings, surface);
            return (
              <div key={surface} className="gesture-row">
                <span className="text-callout gesture-surface">{surface}</span>
                {(["trailing", "leading"] as const).map((direction) => (
                  <label key={direction} className="gesture-choice">
                    <span className="text-footnote">
                      {direction === "trailing" ? "Swipe left" : "Swipe right"}
                    </span>
                    <select
                      className="select"
                      value={current[direction]}
                      onChange={(event) =>
                        update({
                          gestures: {
                            ...settings.gestures,
                            [surface]: { ...current, [direction]: event.target.value },
                          },
                        })
                      }
                    >
                      {AVAILABLE_ACTIONS[surface].map((action) => (
                        <option key={action} value={action}>{ACTION_LABELS[action]}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Data">
        <p className="text-note" style={{ margin: "0 0 12px" }}>
          Importing <strong>replaces</strong> your budget rather than merging into it. The preview shows
          what changes, and offers a backup, before anything is written.
        </p>
        <ImportControl />
      </Section>

      <Section title="Exchange rates">
        <div className="card card-body" style={{ display: "grid", gap: 16, maxWidth: 620 }}>
          <div className="text-caption">
            Rates convert stored amounts for display. Stored values are never rewritten.
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-secondary btn-sm" onClick={refreshRates} disabled={ratesBusy}>
              <RefreshCw size={14} className={ratesBusy ? "spin" : undefined} /> Update rates
            </button>
            <span className="text-caption">
              {settings.exchangeRates.ratesUpdatedAt
                ? `Updated ${formatDateTime(settings.exchangeRates.ratesUpdatedAt)}${
                    settings.exchangeRates.ratesSource ? ` · ${settings.exchangeRates.ratesSource}` : ""
                  }`
                : "Using manual rates — never fetched"}
            </span>
          </div>
          {rateMessage && (
            <div
              className="text-caption"
              style={{ color: rateMessage.ok ? "var(--success-text)" : "var(--warning-text)" }}
              role="status"
            >
              {rateMessage.text}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <label className="text-callout" style={fieldStyle}>
              EUR → USD
              <input
                className="input"
                type="number"
                step="any"
                min="0"
                value={settings.exchangeRates.eurUsd}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (Number.isFinite(value) && value > 0) {
                    update({ exchangeRates: { ...settings.exchangeRates, eurUsd: value } });
                  }
                }}
              />
            </label>

            <label className="text-callout" style={fieldStyle}>
              USD → LBP
              <input
                className="input"
                type="number"
                step="any"
                min="0"
                value={settings.exchangeRates.usdLbp}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (Number.isFinite(value) && value > 0) {
                    update({ exchangeRates: { ...settings.exchangeRates, usdLbp: value } });
                  }
                }}
              />
            </label>
          </div>

          <div className="text-note">
            A rate must stay above zero: a zero or negative rate would make every converted figure meaningless.
          </div>
        </div>
      </Section>
    </div>
  );
};
