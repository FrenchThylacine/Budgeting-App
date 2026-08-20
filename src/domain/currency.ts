import type { BudgetSnapshot, CurrencyCode, CurrencyDisplayMode, ExchangeRates, RoundingRule, Settings } from "./types";

/** Every currency the application knows how to name, symbolise and convert. */
export const CURRENCY_OPTIONS: CurrencyCode[] = ["EUR", "USD", "LBP", "GBP", "CAD", "AUD", "JPY", "TRY", "SAR", "AED"];

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

// ─── Which currencies this budget actually deals in ─────────────────────────

/**
 * The currencies offered in the app's dropdowns.
 *
 * Every editor used to list all ten, which is nine wrong answers for someone
 * who only ever spends in two. `settings.trackedCurrencies` narrows that to a
 * chosen set; absent, the full list applies, so nothing changes for a budget
 * that has never touched the setting.
 *
 * The base currency is always included whatever the stored list says: a budget
 * whose display currency is not selectable is a budget that cannot state its
 * own totals.
 */
export function trackedCurrencies(settings: Pick<Settings, "trackedCurrencies" | "baseCurrency">): CurrencyCode[] {
  const stored = settings.trackedCurrencies;
  const chosen = Array.isArray(stored) && stored.length > 0
    ? stored.filter((code) => CURRENCY_OPTIONS.includes(code))
    : CURRENCY_OPTIONS;
  const withBase = chosen.includes(settings.baseCurrency) ? chosen : [settings.baseCurrency, ...chosen];
  // Presented in the canonical order rather than the order they were added, so
  // the dropdown does not reshuffle itself when the set changes.
  return CURRENCY_OPTIONS.filter((code) => withBase.includes(code));
}

/**
 * The tracked list, plus whatever `current` is.
 *
 * A record keeps its own currency even after that currency stops being
 * tracked — the money was spent in it, and rewriting the field would falsify
 * the record. A `<select>` whose value is not among its options silently shows
 * a different one, so the record's own currency is always offered while it is
 * being edited. Exactly the treatment archived categories get.
 */
export function currencyOptionsFor(
  settings: Pick<Settings, "trackedCurrencies" | "baseCurrency">,
  current?: CurrencyCode | null,
): CurrencyCode[] {
  const tracked = trackedCurrencies(settings);
  if (current && !tracked.includes(current)) return [...tracked, current];
  return tracked;
}

/**
 * Currencies this budget has actually recorded something in.
 *
 * Used to refuse an untracking that would orphan real data, and to say which
 * records are in the way. Covers every store of money in a snapshot:
 * activities, transactions, wishlist items and wallet entries, plus the two
 * currencies the settings themselves name.
 */
export function currenciesInUse(snapshot: BudgetSnapshot): Set<CurrencyCode> {
  const used = new Set<CurrencyCode>([snapshot.settings.baseCurrency, snapshot.settings.monthlyBudgetCurrency]);
  for (const record of Object.values(snapshot.years)) {
    for (const activity of record.activities) used.add(activity.currency);
    for (const entry of record.spendingEntries) used.add(entry.currency);
    for (const item of record.wishlistItems) used.add(item.currency);
    for (const entry of record.walletEntries) used.add(entry.currency);
  }
  return used;
}

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
