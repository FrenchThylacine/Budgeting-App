/**
 * The daily 12:00 UTC refresh, and what a failed refresh must not do
 * ==================================================================
 *
 * The provider publishes once a day. Anchoring "have I got today's rates" to a
 * fixed instant rather than to a rolling age is what stops two devices in
 * different time zones holding different "current" rates for the same day.
 *
 * The harder half is failure. A refresh that could not reach the provider must
 * leave the stored rates *and their timestamp* exactly where they were: moving
 * the timestamp would present last Tuesday's numbers as today's, which is the
 * one outcome that makes every converted figure untrustworthy.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RATE_REFRESH_HOUR_UTC,
  applyRatesToSettings,
  fetchExchangeRates,
  isDueForScheduledRefresh,
  lastScheduledRefresh,
  noteRateFailure,
  rateFreshness,
  refreshRatesOnOpen,
  type RateSnapshot,
} from "../src/domain/exchangeRates";
import type { ExchangeRates } from "../src/domain/types";

const memoryStorage = (() => {
  let store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => void (store = new Map()),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
})();

if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", { value: memoryStorage, configurable: true });
}

beforeEach(() => localStorage.clear());

function baseRates(): ExchangeRates {
  return { eurUsd: 1.1, usdLbp: 90_000, customToBase: {} };
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

const at = (iso: string) => Date.parse(iso);

describe("the publication boundary", () => {
  it("is 12:00 UTC", () => {
    expect(RATE_REFRESH_HOUR_UTC).toBe(12);
  });

  it("is today's noon once noon has passed", () => {
    expect(lastScheduledRefresh(at("2026-08-20T12:00:00Z")).toISOString()).toBe("2026-08-20T12:00:00.000Z");
    expect(lastScheduledRefresh(at("2026-08-20T23:59:00Z")).toISOString()).toBe("2026-08-20T12:00:00.000Z");
  });

  it("is yesterday's noon before today's", () => {
    // At 09:00 the current published set is still yesterday's.
    expect(lastScheduledRefresh(at("2026-08-20T09:00:00Z")).toISOString()).toBe("2026-08-19T12:00:00.000Z");
  });

  /*
   * There was a `nextScheduledRefresh` here, and a caption in the Currencies
   * tab that read "Rates refresh daily at 12:00 UTC" followed by the next one.
   * Both are gone: the schedule is an upper bound on how often the provider is
   * asked, not a thing to plan a day around, and the behaviour worth stating
   * is "they update when you open the app".
   */
});

describe("whether a stored set is due for refresh", () => {
  it("is due when nothing has ever been fetched", () => {
    expect(isDueForScheduledRefresh(undefined)).toBe(true);
    expect(isDueForScheduledRefresh(null)).toBe(true);
  });

  it("is not due for a set fetched after the most recent noon", () => {
    expect(isDueForScheduledRefresh("2026-08-20T12:30:00Z", at("2026-08-20T18:00:00Z"))).toBe(false);
  });

  it("is due once the boundary has been crossed since the fetch", () => {
    // Fetched yesterday afternoon; it is now past today's noon.
    expect(isDueForScheduledRefresh("2026-08-19T13:00:00Z", at("2026-08-20T12:00:01Z"))).toBe(true);
  });

  it("is not due merely because the calendar day changed", () => {
    // Fetched at 13:00, asked at 09:00 the next morning: today's set has not
    // been published yet, so yesterday's is still the current one.
    expect(isDueForScheduledRefresh("2026-08-19T13:00:00Z", at("2026-08-20T09:00:00Z"))).toBe(false);
  });

  it("treats an unparseable timestamp as due rather than as fresh", () => {
    expect(isDueForScheduledRefresh("not a date")).toBe(true);
  });
});

describe("fetching against the schedule", () => {
  it("refetches once the boundary has passed, even inside the age window", () => {
    // Deliberately arranged so the age guard alone would say "still fresh":
    // 21 hours is well past the 6-hour window, so use a shorter gap.
    const fetchImpl = vi.fn(async () => jsonResponse({ rates: { USD: 1.2 } }));
    return (async () => {
      await fetchExchangeRates({ fetchImpl: fetchImpl as unknown as typeof fetch, now: at("2026-08-20T11:00:00Z") });
      await fetchExchangeRates({ fetchImpl: fetchImpl as unknown as typeof fetch, now: at("2026-08-20T13:00:00Z") });
      // Two hours apart — well inside the age window — but the noon boundary
      // fell between them, so the second call must go to the provider.
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    })();
  });

  it("reuses the cache when neither the age nor the boundary says otherwise", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ rates: { USD: 1.2 } }));
    await fetchExchangeRates({ fetchImpl: fetchImpl as unknown as typeof fetch, now: at("2026-08-20T13:00:00Z") });
    const second = await fetchExchangeRates({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: at("2026-08-20T15:00:00Z"),
    });
    expect(second.status).toBe("cached");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("a failed refresh", () => {
  const good: RateSnapshot = {
    ratesPerEur: { EUR: 1, USD: 1.2, GBP: 0.85 },
    fetchedAt: "2026-08-19T12:05:00Z",
    source: "open.er-api.com",
  };

  it("keeps the last known good values", () => {
    const stored = applyRatesToSettings(baseRates(), good);
    const afterFailure = noteRateFailure(stored, "Provider responded 503.");
    expect(afterFailure.perEur?.USD).toBe(1.2);
    expect(afterFailure.perEur?.GBP).toBe(0.85);
    expect(afterFailure.eurUsd).toBe(1.2);
  });

  it("does not pretend the stale rates are fresh", () => {
    const stored = applyRatesToSettings(baseRates(), good);
    const afterFailure = noteRateFailure(stored, "Network error.", new Date("2026-08-21T14:02:00Z"));
    // The rates are still the ones that genuinely arrived on the 19th…
    expect(afterFailure.ratesUpdatedAt).toBe("2026-08-19T12:05:00Z");
    // …and the attempt is stamped separately, with the reason.
    expect(afterFailure.ratesCheckedAt).toBe("2026-08-21T14:02:00.000Z");
    expect(afterFailure.ratesLastError).toBe("Network error.");
  });

  it("is reported as a failure, not as staleness or as currency", () => {
    const stored = noteRateFailure(applyRatesToSettings(baseRates(), good), "503");
    expect(rateFreshness(stored, at("2026-08-21T14:00:00Z")).state).toBe("failed");
  });

  it("is cleared by the next success", () => {
    const failed = noteRateFailure(applyRatesToSettings(baseRates(), good), "503");
    const recovered = applyRatesToSettings(failed, { ...good, fetchedAt: "2026-08-21T12:01:00Z" });
    expect(recovered.ratesLastError).toBeUndefined();
    expect(recovered.ratesUpdatedAt).toBe("2026-08-21T12:01:00Z");
    expect(rateFreshness(recovered, at("2026-08-21T13:00:00Z")).state).toBe("current");
  });

  it("leaves the app able to say it has never fetched at all", () => {
    expect(rateFreshness(baseRates()).state).toBe("never");
  });

  it("reports a set from before today's publication as stale", () => {
    const stored = applyRatesToSettings(baseRates(), good);
    expect(rateFreshness(stored, at("2026-08-21T13:00:00Z")).state).toBe("stale");
  });
});

describe("refreshing when the application is opened", () => {
  const rates = (patch: Partial<ExchangeRates> = {}): ExchangeRates => ({
    eurUsd: 1.1,
    usdLbp: 90000,
    customToBase: {},
    ...patch,
  });

  const provider = (body: unknown, ok = true) =>
    (async () => ({ ok, status: ok ? 200 : 503, json: async () => body })) as unknown as typeof fetch;

  beforeEach(() => localStorage.clear());

  it("fetches and stores when nothing has ever been fetched", async () => {
    const result = await refreshRatesOnOpen(rates(), {
      now: Date.parse("2026-08-29T13:00:00Z"),
      fetchImpl: provider({ rates: { USD: 1.19, LBP: 89000 } }),
    });
    expect(result?.outcome).toBe("updated");
    expect(result?.rates.perEur?.USD).toBe(1.19);
    expect(result?.rates.ratesUpdatedAt).toBe("2026-08-29T13:00:00.000Z");
  });

  it("writes nothing when the stored rates are already the current set", async () => {
    /*
     * The reason this returns null rather than the same object: storing an
     * identical rate set bumps the snapshot revision and pushes a sync to
     * every other device, to record that nothing changed.
     */
    const now = Date.parse("2026-08-29T13:00:00Z");
    const first = await refreshRatesOnOpen(rates(), { now, fetchImpl: provider({ rates: { USD: 1.19 } }) });
    const again = await refreshRatesOnOpen(first!.rates, { now: now + 60_000, fetchImpl: provider({ rates: { USD: 1.19 } }) });
    expect(again).toBeNull();
  });

  it("records a failure without moving the timestamp of the rates it still holds", async () => {
    const held = rates({ perEur: { USD: 1.15 }, ratesUpdatedAt: "2026-08-28T12:00:00.000Z", ratesSource: "open.er-api.com" });
    const result = await refreshRatesOnOpen(held, {
      now: Date.parse("2026-08-29T13:00:00Z"),
      fetchImpl: provider(null, false),
    });
    expect(result?.outcome).toBe("failed");
    expect(result?.rates.ratesUpdatedAt).toBe("2026-08-28T12:00:00.000Z");
    expect(result?.rates.ratesCheckedAt).toBe("2026-08-29T13:00:00.000Z");
    expect(result?.rates.ratesLastError).toMatch(/503/);
    expect(result?.rates.perEur?.USD).toBe(1.15);
  });

  it("does not rewrite the same failure on every load", async () => {
    const now = Date.parse("2026-08-29T13:00:00Z");
    const first = await refreshRatesOnOpen(rates(), { now, fetchImpl: provider(null, false) });
    const again = await refreshRatesOnOpen(first!.rates, { now: now + 60_000, fetchImpl: provider(null, false) });
    expect(again).toBeNull();
  });

  it("clears a recorded failure once rates arrive", async () => {
    const now = Date.parse("2026-08-29T13:00:00Z");
    const failed = await refreshRatesOnOpen(rates(), { now, fetchImpl: provider(null, false) });
    const recovered = await refreshRatesOnOpen(failed!.rates, {
      now: now + 60_000,
      fetchImpl: provider({ rates: { USD: 1.2 } }),
    });
    expect(recovered?.outcome).toBe("updated");
    expect(recovered?.rates.ratesLastError).toBeUndefined();
  });
});
