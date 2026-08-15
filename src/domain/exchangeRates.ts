import type { CurrencyCode, ExchangeRates } from "./types";

/**
 * Live exchange rates.
 *
 * Rates are fetched from a public endpoint that needs no API key, so nothing
 * secret ever reaches the browser. If a keyed provider is adopted later, the
 * call must move behind a server route rather than shipping the key here.
 *
 * Three rules shape this module:
 *  - a fetch failure is never fatal; the stored manual rates keep working;
 *  - fetched rates are cached and only refreshed when stale, so navigating
 *    around the app cannot hammer the provider;
 *  - a rate is only accepted when finite and strictly positive, because a
 *    zero or negative rate would silently corrupt every converted figure.
 */

const PROVIDER_URL = "https://open.er-api.com/v6/latest/EUR";
const CACHE_KEY = "exchange-rates-cache-v1";

/** Rates older than this are refetched; younger ones are reused. */
export const RATE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface RateSnapshot {
  /** Units of each currency per 1 EUR. */
  ratesPerEur: Partial<Record<CurrencyCode, number>>;
  fetchedAt: string;
  source: string;
}

export interface RateFetchResult {
  status: "updated" | "cached" | "unavailable";
  snapshot: RateSnapshot | null;
  message?: string;
}

function isUsableRate(value: unknown): value is number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

export function readCachedRates(now = Date.now()): RateSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RateSnapshot;
    if (!parsed?.fetchedAt || !parsed.ratesPerEur) return null;
    const age = now - new Date(parsed.fetchedAt).getTime();
    if (!Number.isFinite(age) || age < 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedRates(snapshot: RateSnapshot): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    /* storage unavailable (private mode, quota) — caching is best-effort */
  }
}

export function isStale(snapshot: RateSnapshot | null, now = Date.now()): boolean {
  if (!snapshot) return true;
  return now - new Date(snapshot.fetchedAt).getTime() > RATE_MAX_AGE_MS;
}

/**
 * Fetch current rates, reusing a fresh cache when one exists. Never throws:
 * callers get `unavailable` and keep using whatever rates they already hold.
 */
export async function fetchExchangeRates(
  options: { force?: boolean; now?: number; fetchImpl?: typeof fetch } = {},
): Promise<RateFetchResult> {
  const now = options.now ?? Date.now();
  const cached = readCachedRates(now);

  if (!options.force && !isStale(cached, now)) {
    return { status: "cached", snapshot: cached };
  }

  const doFetch = options.fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!doFetch) return { status: "unavailable", snapshot: cached, message: "No fetch implementation available." };

  try {
    const response = await doFetch(PROVIDER_URL);
    if (!response.ok) {
      return { status: "unavailable", snapshot: cached, message: `Provider responded ${response.status}.` };
    }
    const body = await response.json();
    const rates = body?.rates;
    if (!rates || typeof rates !== "object") {
      return { status: "unavailable", snapshot: cached, message: "Provider returned no rates." };
    }

    const ratesPerEur: Partial<Record<CurrencyCode, number>> = {};
    for (const [code, value] of Object.entries(rates)) {
      if (isUsableRate(value)) ratesPerEur[code as CurrencyCode] = Number(value);
    }
    if (!isUsableRate(ratesPerEur.USD)) {
      return { status: "unavailable", snapshot: cached, message: "Provider returned no usable USD rate." };
    }

    const snapshot: RateSnapshot = {
      ratesPerEur,
      fetchedAt: new Date(now).toISOString(),
      source: "open.er-api.com",
    };
    writeCachedRates(snapshot);
    return { status: "updated", snapshot };
  } catch (error) {
    return {
      status: "unavailable",
      snapshot: cached,
      message: error instanceof Error ? error.message : "Network error.",
    };
  }
}

/**
 * Map a fetched snapshot onto the app's stored rate shape.
 *
 * Only rates the provider actually supplied are replaced — a missing currency
 * keeps its existing manual value rather than being zeroed, which would make
 * every amount in that currency read as 0.
 */
export function applyRatesToSettings(current: ExchangeRates, snapshot: RateSnapshot): ExchangeRates {
  const { ratesPerEur } = snapshot;

  // Provider rates land in `perEur`, which is base-independent. They are kept
  // separate from `customToBase` so a manual override the user set stays
  // authoritative and is never overwritten by a refresh.
  const next: ExchangeRates = {
    ...current,
    customToBase: { ...current.customToBase },
    perEur: { ...(current.perEur ?? {}) },
    ratesUpdatedAt: snapshot.fetchedAt,
    ratesSource: snapshot.source,
  };

  for (const [code, value] of Object.entries(ratesPerEur) as [CurrencyCode, number][]) {
    if (isUsableRate(value)) next.perEur![code] = value;
  }

  if (isUsableRate(ratesPerEur.USD)) next.eurUsd = ratesPerEur.USD;
  if (isUsableRate(ratesPerEur.USD) && isUsableRate(ratesPerEur.LBP)) {
    // The app stores USD→LBP, while the provider quotes everything per EUR.
    next.usdLbp = ratesPerEur.LBP / ratesPerEur.USD;
  }

  return next;
}
