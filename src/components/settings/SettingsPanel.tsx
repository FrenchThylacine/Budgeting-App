import React, { useMemo, useState } from "react";
import { ArrowRight, Bell, Coins, Languages, RefreshCw, Search } from "lucide-react";
import { trackedCurrencies } from "../../domain/currency";
import { formatDateTime } from "../../domain/dates";
import { LANGUAGES, findLanguage, searchLanguages } from "../../domain/languages";
import { resolveLanguage } from "../../domain/i18n";
import {
  declineNotifications,
  notificationStatus,
  requestNotificationPermission,
  showNotification,
} from "../../domain/notifications";
import { restartedOnboarding } from "../../domain/tutorial";
import { useTranslation } from "../../i18n/useTranslation";
import { Button } from "../ui/Button";
import { EditorSheet } from "../ui/EditorSheet";
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
  const { t, language } = useTranslation();
  const snapshot = useBudgetStore((s) => s.snapshot);
  const settings = snapshot.settings;
  const update = useBudgetStore((s) => s.updateSettings);
  const lastSyncedAt = useBudgetStore((s) => s.lastSyncedAt);
  const syncError = useBudgetStore((s) => s.syncError);
  const pendingLocalChanges = useBudgetStore((s) => s.pendingLocalChanges);
  const syncNow = useBudgetStore((s) => s.syncNow);
  const retrySync = useBudgetStore((s) => s.retrySync);

  /** The pinned set, for the two display dropdowns this panel still owns. */
  const tracked = trackedCurrencies(settings);

  const fieldStyle: React.CSSProperties = { display: "grid", gap: 6 };
  const checkboxStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" };

  return (
    <div className="page-enter" style={{ display: "grid", gap: 24 }}>
      <AccountSettings />

      {/* Language leads.

          It changes every other word on this page, so it belongs above them
          rather than at the bottom of a list somebody has to scroll past in a
          language they cannot read. */}
      <Section title={t("settings.language")}>
        <div className="card card-body" style={{ display: "grid", gap: 12, maxWidth: 620 }}>
          <p className="text-note" style={{ margin: 0 }}>{t("settings.languageHint")}</p>
          <LanguageSelector />
        </div>
      </Section>

      <Section title="Currency">
        <div className="card card-body" style={{ display: "grid", gap: 16, maxWidth: 620 }}>
          {/* Currencies moved out.

              Which currencies a budget deals in, and what they are worth
              against each other, are one subject; they used to be two screens
              — a chip list here and an "Exchange rates" category further down,
              neither of which said anything about the other. Both now live in
              the Currencies tab, and this section keeps only the two settings
              that are genuinely about *display*. */}
          <div className="settings-crosslink">
            <Coins size={16} aria-hidden="true" />
            <div>
              <div className="text-callout">{t("currencies.pinned")}</div>
              <p className="text-note" style={{ margin: "2px 0 0" }}>
                {t("currencies.pinnedHint")}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.dispatchEvent(new CustomEvent("budget-os:navigate", { detail: "currencies" }))}
            >
              {t("nav.currencies")} <ArrowRight size={14} />
            </Button>
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

      {/* Notifications.

          The previous attempt shipped a component and never called
          `Notification.requestPermission()` from anywhere, so the browser was
          never asked and nothing could ever be shown. The button below is one
          of exactly two places that make the request, and it is a real user
          gesture — which is what every browser requires. */}
      <Section title={t("notifications.title")}>
        <NotificationSettings />
      </Section>

      <Section title={t("settings.help")}>
        <div className="card card-body" style={{ display: "grid", gap: 10, maxWidth: 620 }}>
          <p className="text-note" style={{ margin: 0 }}>{t("settings.replayTutorialHint")}</p>
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                // Clearing both marks is what makes the tour run from the
                // start rather than resuming where it was abandoned, and the
                // event brings the card back without a reload.
                update({ onboarding: restartedOnboarding() });
                window.dispatchEvent(new CustomEvent("budget-os:replay-tutorial"));
              }}
            >
              {t("settings.replayTutorial")}
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Data">
        <p className="text-note" style={{ margin: "0 0 12px" }}>
          Importing <strong>replaces</strong> your budget rather than merging into it. The preview shows
          what changes, and offers a backup, before anything is written.
        </p>
        <ImportControl />
      </Section>

    </div>
  );
};

/**
 * A searchable language list.
 *
 * Seventy-six entries cannot be a `<select>`: a native dropdown of that length
 * is unusable with a thumb and unsearchable without one. This is a button that
 * opens a filtered list, searchable by English name, native name or code, with
 * the language's own name as the primary label — the person looking for
 * "Deutsch" should not have to know it is filed under G.
 *
 * Languages without bundled strings are offered and labelled as such. They are
 * not a lie: choosing one really does change how every date, number and amount
 * on screen is written, because that is the locale rather than the dictionary.
 */
const LanguageSelector: React.FC = () => {
  const { t } = useTranslation();
  const stored = useBudgetStore((s) => s.snapshot.settings.language);
  const update = useBudgetStore((s) => s.updateSettings);
  const active = resolveLanguage(stored);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchLanguages(query), [query]);
  const current = findLanguage(active) ?? LANGUAGES[0];

  return (
    <>
      <button type="button" className="language-trigger" onClick={() => setOpen(true)}>
        <Languages size={16} aria-hidden="true" />
        <span className="language-trigger-text">
          <span className="language-native">{current.nativeName}</span>
          <span className="text-caption">{current.name}</span>
        </span>
        <span className="text-caption language-trigger-badge">
          {current.translated ? t("settings.languageTranslated") : t("settings.languageFormattingOnly")}
        </span>
      </button>

      {open && (
        <EditorSheet
          title={t("settings.language")}
          subtitle={t("settings.languageHint")}
          onClose={() => setOpen(false)}
          footer={
            <Button type="button" variant="primary" onClick={() => setOpen(false)}>
              {t("common.done")}
            </Button>
          }
        >
          <div className="language-picker">
            <label className="currency-picker-search">
              <Search size={15} aria-hidden="true" />
              <input
                className="input"
                type="search"
                autoFocus
                placeholder={t("settings.languageSearch")}
                aria-label={t("settings.languageSearch")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <ul className="language-list" aria-label={t("a11y.languageList")}>
              {results.map((language) => (
                <li key={language.code}>
                  <button
                    type="button"
                    className={`language-row${language.code === active ? " language-row-active" : ""}`}
                    aria-current={language.code === active ? "true" : undefined}
                    onClick={() => {
                      update({ language: language.code });
                      setOpen(false);
                    }}
                  >
                    <span className="language-row-text">
                      {/* The language names itself first. `lang` and `dir` on
                          the element so a right-to-left name renders correctly
                          inside a left-to-right list. */}
                      <span
                        className="language-native"
                        lang={language.code}
                        dir={language.rtl ? "rtl" : "ltr"}
                      >
                        {language.nativeName}
                      </span>
                      <span className="text-caption">{language.name}</span>
                    </span>
                    <span className="text-caption language-row-badge">
                      {language.translated ? t("settings.languageTranslated") : t("settings.languageFormattingOnly")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </EditorSheet>
      )}
    </>
  );
};

/**
 * Notification permission, honestly reported.
 *
 * Five states, each with a different correct thing to say and a different
 * correct control to offer — which is why this is a component and not a
 * checkbox. A checkbox cannot express "your browser has blocked this and I
 * cannot ask again".
 */
const NotificationSettings: React.FC = () => {
  const { t } = useTranslation();
  const settings = useBudgetStore((s) => s.snapshot.settings.notifications);
  const update = useBudgetStore((s) => s.updateSettings);
  const [note, setNote] = useState<string | null>(null);
  const status = notificationStatus(settings);

  const ask = async () => {
    const result = await requestNotificationPermission();
    update({ notifications: result.settings });
    setNote(
      result.outcome === "granted"
        ? t("notifications.enabled")
        : result.outcome === "unsupported"
          ? t("notifications.unsupported")
          : result.outcome === "denied" || result.outcome === "already-denied"
            ? t("notifications.blocked")
            : t("notifications.declined"),
    );
  };

  return (
    <div className="card card-body" style={{ display: "grid", gap: 12, maxWidth: 620 }}>
      <p className="text-note" style={{ margin: 0 }}>{t("notifications.body")}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {status.state === "granted" ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const shown = showNotification(t("notifications.testTitle"), t("notifications.testBody"));
                setNote(shown ? t("notifications.testSent") : t("notifications.blocked"));
              }}
            >
              <Bell size={14} /> {t("notifications.test")}
            </Button>
            {/* Turning them off in the app is a real choice we can honour:
                the browser permission stays granted (only the user can revoke
                that), and nothing is sent while this is off. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                update({ notifications: declineNotifications() });
                setNote(t("notifications.declined"));
              }}
            >
              {t("notifications.disable")}
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" disabled={!status.canRequest} onClick={() => void ask()}>
            <Bell size={14} /> {t("notifications.enable")}
          </Button>
        )}
      </div>

      <div className="text-caption" role="status">
        {note ??
          (status.state === "granted"
            ? t("notifications.enabled")
            : status.state === "denied"
              ? t("notifications.blocked")
              : status.state === "unsupported"
                ? t("notifications.unsupported")
                : status.state === "declined"
                  ? t("notifications.declined")
                  : "")}
      </div>
    </div>
  );
};
