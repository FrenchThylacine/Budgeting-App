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

/**
 * The daily publication moment: 12:00 UTC.
 *
 * The provider publishes once a day, so a rate set is "the rates for today"
 * from that moment. Refreshing on a rolling age alone means two devices in
 * different time zones can hold different "current" rates for the same day and
 * quietly disagree about every converted figure; anchoring to a fixed instant
 * makes "have I got today's rates" a question with one answer everywhere.
 */
export const RATE_REFRESH_HOUR_UTC = 12;

/**
 * The most recent 12:00 UTC at or before `now`.
 *
 * Exported because it is the whole schedule, and a test that cannot name the
 * boundary cannot check what happens either side of it.
 */
export function lastScheduledRefresh(now: number = Date.now()): Date {
  const date = new Date(now);
  const boundary = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    RATE_REFRESH_HOUR_UTC,
    0,
    0,
    0,
  );
  // Before today's boundary, the current rate set is still yesterday's.
  return new Date(boundary <= now ? boundary : boundary - 86_400_000);
}

/** The next 12:00 UTC strictly after `now`, for "next update" captions. */
export function nextScheduledRefresh(now: number = Date.now()): Date {
  return new Date(lastScheduledRefresh(now).getTime() + 86_400_000);
}

/**
 * True when the stored rates predate the most recent 12:00 UTC publication.
 *
 * Independent of `isStale`, which is an age guard. Both are consulted: the
 * daily boundary is what makes a set "yesterday's", and the age guard catches
 * a set that is somehow older than a day without a boundary having been
 * crossed (a clock change, a long-suspended laptop).
 */
export function isDueForScheduledRefresh(
  fetchedAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!fetchedAt) return true;
  const fetched = new Date(fetchedAt).getTime();
  if (!Number.isFinite(fetched)) return true;
  return fetched < lastScheduledRefresh(now).getTime();
}

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

  // Two independent reasons to refetch, and a fresh cache must satisfy both:
  // the daily 12:00 UTC publication is what makes a set today's, and the age
  // guard catches a set older than that boundary can express.
  const due = isStale(cached, now) || isDueForScheduledRefresh(cached?.fetchedAt, now);
  if (!options.force && !due) {
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
/**
 * Record a failed refresh without pretending anything changed.
 *
 * `ratesUpdatedAt` is left exactly where it was — the stored rates are still
 * the ones that were last genuinely fetched, and moving the timestamp would
 * present yesterday's numbers as today's. Only the attempt is stamped, so the
 * interface can say "checked at 14:02, still using Tuesday's rates" rather
 * than either silently retrying forever or claiming to be current.
 */
export function noteRateFailure(current: ExchangeRates, message: string, now = new Date()): ExchangeRates {
  return {
    ...current,
    customToBase: { ...current.customToBase },
    perEur: current.perEur ? { ...current.perEur } : undefined,
    ratesCheckedAt: now.toISOString(),
    ratesLastError: message,
  };
}

/**
 * How the stored rates should be described, in words the interface prints.
 *
 * Four states worth telling apart: never fetched, current, a day or more old,
 * and "the last attempt failed". The last one is the reason this exists — a
 * failed refresh must never look like a successful one.
 */
export function rateFreshness(
  rates: ExchangeRates,
  now: number = Date.now(),
): { state: "never" | "current" | "stale" | "failed"; updatedAt: string | null; checkedAt: string | null } {
  const updatedAt = rates.ratesUpdatedAt ?? null;
  const checkedAt = rates.ratesCheckedAt ?? null;
  if (!updatedAt) return { state: "never", updatedAt, checkedAt };
  if (rates.ratesLastError) return { state: "failed", updatedAt, checkedAt };
  return {
    state: isDueForScheduledRefresh(updatedAt, now) ? "stale" : "current",
    updatedAt,
    checkedAt,
  };
}

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
    ratesCheckedAt: snapshot.fetchedAt,
    // A success clears the last failure: keeping it would leave the panel
    // reporting an error against rates that have since arrived.
    ratesLastError: undefined,
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

/**
 * The whole "refresh on open" decision, in one testable function.
 *
 * The brief is that rates update whenever the application is opened. Taken
 * literally that is a network request on every navigation and a database write
 * on every load, so what "opened" has to mean is: *once per session, and only
 * when a refresh is genuinely due.* `fetchExchangeRates` already owns "due" —
 * the 12:00 UTC publication boundary and the age guard — and answers `cached`
 * without touching the network when it is not.
 *
 * Returns the rates to store, or **null when there is nothing to store**. That
 * distinction is the point: writing an identical rate set on every load would
 * bump the snapshot revision, push a sync to every other device and fill the
 * audit trail, all to record that nothing changed.
 */
export async function refreshRatesOnOpen(
  current: ExchangeRates,
  options: { now?: number; fetchImpl?: typeof fetch } = {},
): Promise<{ rates: ExchangeRates; outcome: "updated" | "failed" } | null> {
  const now = options.now ?? Date.now();
  const result = await fetchExchangeRates({ now, fetchImpl: options.fetchImpl });

  if (result.status === "unavailable") {
    // A failure is only worth recording if we did not already record one for
    // this attempt window — otherwise every offline load writes a new
    // timestamp saying the same thing.
    if (current.ratesLastError === (result.message ?? "") && current.ratesCheckedAt) return null;
    return { rates: noteRateFailure(current, result.message ?? "Rates unavailable.", new Date(now)), outcome: "failed" };
  }

  const snapshot = result.snapshot;
  if (!snapshot) return null;
  // Already stored — including the common case of a fresh cache on a reload.
  if (current.ratesUpdatedAt === snapshot.fetchedAt && !current.ratesLastError) return null;
  return { rates: applyRatesToSettings(current, snapshot), outcome: "updated" };
}
