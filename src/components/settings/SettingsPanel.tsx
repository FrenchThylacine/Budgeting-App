import React, { useState } from "react";
import { RefreshCw } from "lucide-react";
import { CURRENCY_OPTIONS } from "../../domain/currency";
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
  const settings = useBudgetStore((s) => s.snapshot.settings);
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

  const fieldStyle: React.CSSProperties = { display: "grid", gap: 6 };
  const checkboxStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" };

  return (
    <div className="page-enter" style={{ display: "grid", gap: 24 }}>
      <AccountSettings />

      <Section title="Currency">
        <div className="card card-body" style={{ display: "grid", gap: 16, maxWidth: 620 }}>
          <label className="text-callout" style={fieldStyle}>
            Display currency
            <select
              className="select"
              value={settings.baseCurrency}
              onChange={(e) => update({ baseCurrency: e.target.value as CurrencyCode })}
            >
              {CURRENCY_OPTIONS.map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </select>
            <span className="text-footnote">Everything is converted to this currency for display only.</span>
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

          <div style={fieldStyle}>
            <span className="text-callout">Currencies in lists</span>
            <span className="text-footnote">Select which currencies appear in dropdown pickers across the app.</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              {CURRENCY_OPTIONS.map((code) => {
                const current = settings.enabledCurrencies ?? CURRENCY_OPTIONS;
                const isEnabled = current.includes(code);
                const isLocked = code === settings.baseCurrency || code === settings.monthlyBudgetCurrency;
                return (
                  <button
                    key={code}
                    type="button"
                    disabled={isLocked}
                    className={`badge ${isEnabled ? "badge-info" : "badge-neutral"}`}
                    style={{
                      cursor: isLocked ? "default" : "pointer",
                      padding: "6px 12px",
                      border: "none",
                      fontSize: 13,
                      fontWeight: isEnabled ? 600 : 400,
                      opacity: isLocked ? 0.9 : 1,
                    }}
                    onClick={() => {
                      if (isLocked) return;
                      const next = isEnabled
                        ? current.filter((c) => c !== code)
                        : [...current, code];
                      if (next.length > 0) update({ enabledCurrencies: next });
                    }}
                    title={isLocked ? `${code} is currently in use as your base or budget currency` : `Toggle ${code}`}
                  >
                    {isEnabled ? `✓ ${code}` : code}
                  </button>
                );
              })}
            </div>
          </div>
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
                {CURRENCY_OPTIONS.map((currency) => (
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

          <label className="text-caption" style={checkboxStyle}>
            <input
              type="checkbox"
              checked={settings.ignoreNonBudgetSpending ?? false}
              onChange={(e) => update({ ignoreNonBudgetSpending: e.target.checked })}
            />
            <span>Exclude non-budget payment sources from analytics</span>
          </label>
        </div>
      </Section>

      <Section title="Seasonal presets">
        <div className="card card-body" style={{ display: "grid", gap: 12, maxWidth: 620 }}>
          <div className="text-footnote">Apply a preset to set a common season for your activities (e.g. summer, travel, school-term).</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {(settings.seasonalPresets ?? []).map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="badge badge-info"
                onClick={() => {
                  // applySeasonalPreset is a store action
                  useBudgetStore.getState().applySeasonalPreset(preset.id);
                }}
                title={`Apply ${preset.season} preset`}
              >
                {preset.season}
              </button>
            ))}
            {(!settings.seasonalPresets || settings.seasonalPresets.length === 0) && (
              <div className="text-caption">No presets available in this budget.</div>
            )}
          </div>
        </div>
      </Section>

      <Section title="Advanced">
        <div className="card card-body" style={{ display: "grid", gap: 12, maxWidth: 620 }}>
          <label style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={!!settings.autoWalletRollupEnabled}
              onChange={(e) => update({ autoWalletRollupEnabled: e.target.checked })}
            />
            <div>
              <div className="text-callout">Auto wallet rollup</div>
              <div className="text-footnote">Automatically roll small wallet balances into the monthly budget when closing a month.</div>
            </div>
          </label>

          <label style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={!!settings.promptBeforeMonthClose}
              onChange={(e) => update({ promptBeforeMonthClose: e.target.checked })}
            />
            <div>
              <div className="text-callout">Confirm before closing month</div>
              <div className="text-footnote">Show a confirmation dialog when attempting to close a month.</div>
            </div>
          </label>

          <label style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={!!settings.liveClockEnabled}
              onChange={(e) => update({ liveClockEnabled: e.target.checked })}
            />
            <div>
              <div className="text-callout">Live clock in period selector</div>
              <div className="text-footnote">Toggle the live local time display inside the period selector.</div>
            </div>
          </label>

          <label className="text-callout" style={{ display: "grid", gap: 6 }}>
            NaN handling policy
            <select
              className="select"
              value={settings.nanPolicy}
              onChange={(e) => update({ nanPolicy: e.target.value as any })}
            >
              <option value="closed-periods-only">Closed periods only</option>
            </select>
            <div className="text-footnote">Controls how calculations handle missing historical data.</div>
          </label>

          <div style={{ display: 'grid', gap: 8 }}>
            <div className="text-callout">Monthly notes for selected period</div>
            <div className="text-footnote">Notes attached to the selected month are stored with the year record and persist across devices.</div>
            <textarea
              className="input"
              style={{ minHeight: 80, resize: 'vertical' }}
              value={(useBudgetStore.getState().snapshot.years[String(settings.selectedYear)]?.monthlyNotes?.[settings.selectedMonth] ?? '')}
              onChange={(e) => useBudgetStore.getState().updateMonthlyNote(settings.selectedYear, settings.selectedMonth, e.target.value)}
            />
          </div>
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
              <span className="text-footnote" style={{ display: "block" }}>
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
            <div className="text-caption" style={{ color: "var(--warning)" }}>{syncError}</div>
          )}
          <div className="text-footnote">
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
              style={{ color: rateMessage.ok ? "var(--success)" : "var(--warning)" }}
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

          <div className="text-footnote">
            A rate must stay above zero: a zero or negative rate would make every converted figure meaningless.
          </div>
        </div>
      </Section>
    </div>
  );
};
