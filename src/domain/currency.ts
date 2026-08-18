import type { CurrencyCode, CurrencyDisplayMode, ExchangeRates, RoundingRule, Settings } from "./types";

export const CURRENCY_OPTIONS: CurrencyCode[] = ["EUR", "USD", "LBP", "GBP", "CAD", "AUD", "JPY", "TRY", "SAR", "AED"];

/**
 * Returns the list of currencies enabled for display in dropdown pickers.
 * Always ensures the settings baseCurrency and monthlyBudgetCurrency are included.
 */
export function activeCurrencyOptions(settings?: Partial<Settings> | null): CurrencyCode[] {
  if (!settings) return CURRENCY_OPTIONS;
  const set = new Set<CurrencyCode>(settings.enabledCurrencies && settings.enabledCurrencies.length > 0 ? settings.enabledCurrencies : CURRENCY_OPTIONS);
  if (settings.baseCurrency) set.add(settings.baseCurrency);
  if (settings.monthlyBudgetCurrency) set.add(settings.monthlyBudgetCurrency);
  return CURRENCY_OPTIONS.filter((c) => set.has(c));
}

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  EUR: "€",
  USD: "$",
  LBP: "L.L.",
  GBP: "£",
  CAD: "C$",
  AUD: "A$",
  JPY: "¥",
  TRY: "₺",
  SAR: "SAR",
  AED: "AED",
};

export function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toUpperCase() === "N/A" || trimmed.toUpperCase() === "NAN") return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * True when a real rate exists for this pair. Callers that must not present a
 * fabricated figure (settings, currency management) check this first, because
 * `rateToBase` falls back to 1:1 to keep the UI rendering.
 */
export function canConvert(currency: CurrencyCode, baseCurrency: CurrencyCode, rates: ExchangeRates): boolean {
  if (currency === baseCurrency) return true;
  const pair = new Set([currency, baseCurrency]);
  if (pair.size === 2 && [...pair].every((c) => c === "EUR" || c === "USD" || c === "LBP")) return true;
  if (positive(rates.customToBase[currency]) != null) return true;
  const perEur = rates.perEur;
  return perEur != null && positive(perEur[currency]) != null && positive(perEur[baseCurrency]) != null;
}

/**
 * Multiplier that converts an amount in `currency` into `baseCurrency`.
 *
 * Resolution order, most to least specific:
 *  1. the manually maintained EUR/USD/LBP pairs;
 *  2. an explicit `customToBase` override;
 *  3. provider rates pivoted through EUR;
 *  4. 1 as a last resort.
 *
 * That final fallback silently treats an unknown currency as equal to the
 * base, which is wrong but keeps the app rendering. `canConvert` exists so
 * callers can detect and flag the case rather than quietly trusting it.
 */
export function rateToBase(currency: CurrencyCode, baseCurrency: CurrencyCode, rates: ExchangeRates): number {
  if (currency === baseCurrency) return 1;

  const eurUsd = positive(rates.eurUsd);
  const usdLbp = positive(rates.usdLbp);
  if (eurUsd != null) {
    if (currency === "EUR" && baseCurrency === "USD") return eurUsd;
    if (currency === "USD" && baseCurrency === "EUR") return 1 / eurUsd;
    if (usdLbp != null) {
      if (currency === "LBP" && baseCurrency === "EUR") return 1 / usdLbp / eurUsd;
      if (currency === "EUR" && baseCurrency === "LBP") return eurUsd * usdLbp;
    }
  }
  if (usdLbp != null) {
    if (currency === "LBP" && baseCurrency === "USD") return 1 / usdLbp;
    if (currency === "USD" && baseCurrency === "LBP") return usdLbp;
  }

  const override = positive(rates.customToBase[currency]);
  if (override != null) return override;

  // 1 unit of `currency` is 1/perEur[currency] EUR, which is
  // perEur[base]/perEur[currency] units of the base.
  const perEur = rates.perEur;
  if (perEur) {
    const from = positive(perEur[currency]);
    const to = positive(perEur[baseCurrency]);
    if (from != null && to != null) return to / from;
  }

  return 1;
}

export function normalizeAmount(amount: number | null | undefined, currency: CurrencyCode, settings: Settings): number {
  if (amount == null || Number.isNaN(amount)) return 0;
  return amount * rateToBase(currency, settings.baseCurrency, settings.exchangeRates);
}

export function convertAmount(amount: number | null | undefined, fromCurrency: CurrencyCode, toCurrency: CurrencyCode, rates: ExchangeRates): number | null {
  if (amount == null || Number.isNaN(amount)) return null;
  if (fromCurrency === toCurrency) return amount;
  const eurValue = amount * rateToBase(fromCurrency, "EUR", rates);
  return eurValue / rateToBase(toCurrency, "EUR", rates);
}

export function roundAmount(amount: number, rule: RoundingRule): number {
  switch (rule) {
    case "nearest-1":
      return Math.round(amount);
    case "nearest-5":
      return Math.round(amount / 5) * 5;
    case "nearest-10":
      return Math.round(amount / 10) * 10;
    case "ceil-10":
      return Math.ceil(amount / 10) * 10;
    case "none":
    default:
      return amount;
  }
}

export function currencyLabel(currency: CurrencyCode, mode: CurrencyDisplayMode): string {
  if (mode === "symbol") return CURRENCY_SYMBOLS[currency];
  if (mode === "both") return `${CURRENCY_SYMBOLS[currency]} ${currency}`;
  return currency;
}

export function formatMoney(
  amount: number | null | undefined,
  currency: CurrencyCode,
  mode: CurrencyDisplayMode = "both",
  options: { compact?: boolean; showSign?: boolean } = {},
): string {
  if (amount == null || Number.isNaN(amount)) return "NaN";
  const sign = options.showSign && amount > 0 ? "+" : "";
  const rounded = Math.abs(amount) >= 1000 || options.compact ? 0 : 2;
  return `${sign}${currencyLabel(currency, mode)} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: rounded,
    maximumFractionDigits: rounded,
  })}`;
}
