import {
  ALL_CURRENCY_CODES,
  CURRENCY_DEFINITIONS,
  currencyDecimals,
  currencyDefinition,
  isCurrencyCode,
} from "./currencies";
import type { BudgetSnapshot, CurrencyCode, CurrencyDisplayMode, ExchangeRates, RoundingRule, Settings } from "./types";

export { ALL_CURRENCY_CODES, currencyDecimals, currencyName, isCurrencyCode, searchCurrencies } from "./currencies";
export type { CurrencyDefinition } from "./currencies";

/**
 * The currencies a budget is pinned to when it has never said otherwise.
 *
 * These are the ten the application shipped with, in the order it shipped
 * them. `settings.trackedCurrencies` is absent for every budget written before
 * currency pinning existed, and this is what "absent" has always meant — so
 * widening the dataset to the whole of ISO 4217 changes nothing for them. The
 * full list is `ALL_CURRENCY_CODES`, and it is reachable from the searchable
 * picker; it is deliberately *not* what a dropdown offers.
 */
export const CURRENCY_OPTIONS: CurrencyCode[] = [
  "EUR",
  "USD",
  "LBP",
  "GBP",
  "CAD",
  "AUD",
  "JPY",
  "TRY",
  "SAR",
  "AED",
];

/**
 * Symbols for every currency the app knows.
 *
 * Derived from the dataset rather than maintained beside it: two lists of the
 * same facts drift, and the one that drifts is the one nobody is looking at.
 */
export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = Object.fromEntries(
  CURRENCY_DEFINITIONS.map((entry) => [entry.code, entry.symbol]),
) as Record<CurrencyCode, string>;

// ─── Which currencies this budget actually deals in ─────────────────────────

/**
 * The currencies offered in the app's dropdowns — the pinned set.
 *
 * Every editor used to list all ten, which is nine wrong answers for someone
 * who only ever spends in two; offering all one hundred and sixty would be a
 * hundred and fifty-eight. `settings.trackedCurrencies` is the pinned list;
 * absent, the default set above applies, so nothing changes for a budget that
 * has never touched the setting.
 *
 * The base currency is always included whatever the stored list says: a budget
 * whose display currency is not selectable is a budget that cannot state its
 * own totals.
 */
export function trackedCurrencies(settings: Pick<Settings, "trackedCurrencies" | "baseCurrency">): CurrencyCode[] {
  const stored = settings.trackedCurrencies;
  const chosen =
    Array.isArray(stored) && stored.length > 0 ? stored.filter((code) => isCurrencyCode(code)) : CURRENCY_OPTIONS;
  const withBase = chosen.includes(settings.baseCurrency) ? chosen : [settings.baseCurrency, ...chosen];
  // Presented in the canonical order rather than the order they were added, so
  // the dropdown does not reshuffle itself when the set changes.
  return ALL_CURRENCY_CODES.filter((code) => withBase.includes(code));
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
 * Used to refuse an unpinning that would orphan real data, and to say which
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

/**
 * Why a currency cannot be unpinned, or null when it can.
 *
 * One function so the chip, the picker and the confirmation dialog can never
 * disagree about whether a removal is allowed.
 */
export function unpinBlockedReason(
  snapshot: BudgetSnapshot,
  code: CurrencyCode,
): "display-currency" | "budget-currency" | "in-use" | null {
  if (code === snapshot.settings.baseCurrency) return "display-currency";
  if (code === snapshot.settings.monthlyBudgetCurrency) return "budget-currency";
  return currenciesInUse(snapshot).has(code) ? "in-use" : null;
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
 * Units of `currency` per one euro, from whichever source knows.
 *
 * The euro is the canonical pivot: every rate the provider publishes is quoted
 * against it, so one number per currency describes every pair. The two legacy
 * manual fields (`eurUsd`, `usdLbp`) are folded in here rather than being a
 * pair table of their own — a budget that only ever set those two by hand
 * keeps working, and every *other* pair those two imply (LBP→GBP, say) now
 * follows from the same arithmetic instead of falling off a cliff.
 */
export function unitsPerEur(currency: CurrencyCode, rates: ExchangeRates): number | null {
  if (currency === "EUR") return 1;

  const provider = positive(rates.perEur?.[currency]);
  if (provider != null) return provider;

  const eurUsd = positive(rates.eurUsd);
  if (currency === "USD" && eurUsd != null) return eurUsd;
  if (currency === "LBP") {
    const usdLbp = positive(rates.usdLbp);
    if (eurUsd != null && usdLbp != null) return eurUsd * usdLbp;
  }
  return null;
}

/**
 * True when a real rate exists for this pair.
 *
 * Callers that must not present a fabricated figure (the currency panel, the
 * exchange popup) check this first, because `rateToBase` falls back to 1:1 to
 * keep the interface rendering rather than filling the page with NaN.
 */
export function canConvert(currency: CurrencyCode, baseCurrency: CurrencyCode, rates: ExchangeRates): boolean {
  if (currency === baseCurrency) return true;
  if (positive(rates.customToBase[currency]) != null) return true;
  return unitsPerEur(currency, rates) != null && unitsPerEur(baseCurrency, rates) != null;
}

/**
 * Multiplier that converts an amount in `currency` into `baseCurrency`.
 *
 * Resolution order, most to least specific:
 *  1. an explicit `customToBase` override the user typed;
 *  2. the euro pivot — provider rates, with the two legacy manual pairs folded
 *     in by `unitsPerEur`;
 *  3. 1 as a last resort.
 *
 * That final fallback silently treats an unknown currency as equal to the
 * base, which is wrong but keeps the app rendering. `canConvert` exists so
 * callers can detect and flag the case rather than quietly trusting it.
 */
export function rateToBase(currency: CurrencyCode, baseCurrency: CurrencyCode, rates: ExchangeRates): number {
  if (currency === baseCurrency) return 1;

  const override = positive(rates.customToBase[currency]);
  if (override != null && baseCurrency === "EUR") return override;

  // 1 unit of `currency` is 1/perEur[currency] EUR, which is
  // perEur[base]/perEur[currency] units of the base.
  const from = unitsPerEur(currency, rates);
  const to = unitsPerEur(baseCurrency, rates);
  if (from != null && to != null) return to / from;

  if (override != null) return override;
  return 1;
}

/**
 * The rate from one currency to another, or null when it is not known.
 *
 * The direction matters and is stated by the argument order: `crossRate("EUR",
 * "USD")` answers "how many dollars is one euro". Null rather than 1 when the
 * pair cannot be resolved — the exchange popup must say it does not know
 * rather than print a rate of one.
 */
export function crossRate(from: CurrencyCode, to: CurrencyCode, rates: ExchangeRates): number | null {
  if (from === to) return 1;
  if (!canConvert(from, to, rates)) return null;
  const rate = rateToBase(from, to, rates);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export function normalizeAmount(amount: number | null | undefined, currency: CurrencyCode, settings: Settings): number {
  if (amount == null || Number.isNaN(amount)) return 0;
  return amount * rateToBase(currency, settings.baseCurrency, settings.exchangeRates);
}

export function convertAmount(
  amount: number | null | undefined,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  rates: ExchangeRates,
): number | null {
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
  const symbol = currencyDefinition(currency)?.symbol ?? currency;
  if (mode === "symbol") return symbol;
  if (mode === "both") return `${symbol} ${currency}`;
  return currency;
}

/**
 * The locale numbers are grouped and punctuated in.
 *
 * Set by the language selector (see `domain/i18n.ts`), which writes it here so
 * every `toLocaleString` in the app answers to one place rather than to the
 * browser's own locale on one screen and the chosen language on another.
 * `undefined` means "the browser's", which is what it always was.
 */
let activeNumberLocale: string | undefined;

export function setNumberLocale(locale: string | undefined): void {
  activeNumberLocale = locale || undefined;
}

export function numberLocale(): string | undefined {
  return activeNumberLocale;
}

export function formatMoney(
  amount: number | null | undefined,
  currency: CurrencyCode,
  // The same default as a new budget's setting, so a caller that does not
  // thread the preference through does not silently print a different format
  // from the rest of the application.
  mode: CurrencyDisplayMode = "symbol",
  options: { compact?: boolean; showSign?: boolean } = {},
): string {
  if (amount == null || Number.isNaN(amount)) return "NaN";
  const sign = options.showSign && amount > 0 ? "+" : "";
  // The currency's own minor units, capped at two above a thousand and dropped
  // entirely when compact: a four-figure total does not need centimes, and the
  // yen has none at any size.
  const natural = currencyDecimals(currency);
  const digits = options.compact || Math.abs(amount) >= 1000 ? 0 : natural;
  return `${sign}${currencyLabel(currency, mode)} ${amount.toLocaleString(activeNumberLocale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/**
 * Equivalents: two questions, two functions
 * =========================================
 *
 * An "≈" line under a figure answers one of two entirely different questions,
 * and the application had one function doing both — which meant it answered
 * the wrong one everywhere.
 *
 *  1. **"What is this record worth in my money?"** A taxi cost 150 000 LBP.
 *     The reader's budget is in euros. The equivalent that helps is
 *     **≈ €1.35** — the *display* currency, the one every total on the screen
 *     is already in. This is `displayEquivalent`, and it is on by default
 *     because it is not a preference: it is the difference between a number
 *     and a number you can place.
 *
 *  2. **"What is this total worth in the other currency I think in?"**
 *     Somebody who earns in dollars and budgets in euros wants the wallet's
 *     €2,400 to also read **≈ $2,790**. That is `secondaryEquivalent`, it
 *     applies to *aggregates* rather than to records, and it is off until
 *     somebody chooses a second currency.
 *
 * One function served both, keyed on `settings.secondaryCurrency` — so a
 * Lebanese taxi in a euro budget with the second currency set to dollars
 * printed "≈ $1.47", converting a record the reader never asked about into a
 * currency no total on the page was in. The two are now named separately, and
 * the names are the documentation.
 *
 * Both return null rather than guessing. Null in four cases, each of which
 * matters:
 *
 *  - the amount is already in the target, so an "≈" line would restate it;
 *  - there is no amount;
 *  - (for the second currency) none is configured — the feature is off;
 *  - **no rate connects the pair.** A fabricated equivalent under a real
 *    figure is worse than none at all: "≈ €1.35" reads as a fact, and
 *    `rateToBase` falls back to 1:1 to keep the interface rendering. These are
 *    the callers that must not accept that fallback.
 */
function equivalent(
  amount: number | null | undefined,
  currency: CurrencyCode,
  target: CurrencyCode | undefined,
  rates: ExchangeRates,
): { amount: number; currency: CurrencyCode } | null {
  if (!target || target === currency) return null;
  if (amount == null || !Number.isFinite(amount)) return null;
  if (!canConvert(currency, target, rates)) return null;
  const converted = convertAmount(amount, currency, target, rates);
  if (converted == null || !Number.isFinite(converted)) return null;
  return { amount: converted, currency: target };
}

/**
 * What one recorded amount is worth in the **display** currency.
 *
 * For a transaction, a wallet movement, an activity's price — anything
 * recorded in a currency of its own. Not a preference: the reader chose the
 * display currency, and every total on the screen is already in it.
 */
export function displayEquivalent(
  amount: number | null | undefined,
  currency: CurrencyCode,
  settings: Pick<Settings, "baseCurrency" | "exchangeRates">,
): { amount: number; currency: CurrencyCode } | null {
  return equivalent(amount, currency, settings.baseCurrency, settings.exchangeRates);
}

/**
 * What an **aggregate** is worth in the optional second currency.
 *
 * For a wallet balance, a monthly activity total, a period's spending — the
 * figures somebody who thinks in two currencies wants to read twice. Off
 * until a second currency is chosen.
 */
export function secondaryEquivalent(
  amount: number | null | undefined,
  currency: CurrencyCode,
  settings: Pick<Settings, "secondaryCurrency" | "exchangeRates">,
): { amount: number; currency: CurrencyCode } | null {
  return equivalent(amount, currency, settings.secondaryCurrency, settings.exchangeRates);
}

/**
 * A rate, printed with enough precision to be useful in both directions.
 *
 * 1 EUR = 1.17 USD needs two decimals; 1 EUR = 0.0000093 BTC-sized rates need
 * rather more, and 1 EUR = 108,000 LBP needs none at all. Significant figures
 * rather than a fixed count, so no rate is ever shown as "0.00".
 */
export function formatRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "—";
  const digits = rate >= 1000 ? 0 : rate >= 100 ? 1 : rate >= 1 ? 4 : rate >= 0.01 ? 5 : 8;
  return rate
    .toLocaleString(activeNumberLocale, { minimumFractionDigits: 0, maximumFractionDigits: digits })
    .replace(/([.,]\d*?)0+$/, "$1")
    .replace(/[.,]$/, "");
}
