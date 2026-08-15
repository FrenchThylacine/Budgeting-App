import React from "react";
import { CURRENCY_OPTIONS } from "../../domain/currency";
import { useBudgetStore } from "../../store/budgetStore";
import type { CurrencyCode, CurrencyDisplayMode, RoundingRule } from "../../domain/types";
import { Section } from "../ui/Section";

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

  const fieldStyle: React.CSSProperties = { display: "grid", gap: 6 };
  const checkboxStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" };

  return (
    <div className="page-enter" style={{ display: "grid", gap: 24 }}>
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

      <Section title="Exchange rates">
        <div className="card card-body" style={{ display: "grid", gap: 16, maxWidth: 620 }}>
          <div className="text-caption">
            Rates convert stored amounts for display. Stored values are never rewritten.
          </div>

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
