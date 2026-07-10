import type { CurrencyCode, CurrencyDisplayMode, ExchangeRates, RoundingRule, Settings } from "./types";

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

export function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toUpperCase() === "N/A" || trimmed.toUpperCase() === "NAN") return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function rateToBase(currency: CurrencyCode, baseCurrency: CurrencyCode, rates: ExchangeRates): number {
  if (currency === baseCurrency) return 1;
  if (currency === "EUR" && baseCurrency === "USD") return rates.eurUsd;
  if (currency === "USD" && baseCurrency === "EUR") return 1 / rates.eurUsd;
  if (currency === "LBP" && baseCurrency === "USD") return 1 / rates.usdLbp;
  if (currency === "LBP" && baseCurrency === "EUR") return 1 / rates.usdLbp / rates.eurUsd;
  if (currency === "EUR" && baseCurrency === "LBP") return rates.eurUsd * rates.usdLbp;
  if (currency === "USD" && baseCurrency === "LBP") return rates.usdLbp;
  return rates.customToBase[currency] ?? 1;
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
