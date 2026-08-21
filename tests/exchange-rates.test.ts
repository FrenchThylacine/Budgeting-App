/**
 * Live exchange rates: caching, failure handling, and the conversion maths
 * they feed. Rates are display-only, but a wrong rate silently misstates every
 * figure in the app, so the failure modes matter as much as the happy path.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyRatesToSettings,
  fetchExchangeRates,
  isStale,
  RATE_MAX_AGE_MS,
  type RateSnapshot,
} from "../src/domain/exchangeRates";
import {
  CURRENCY_OPTIONS,
  currenciesInUse,
  currencyOptionsFor,
  trackedCurrencies,
} from "../src/domain/currency";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import type { Settings } from "../src/domain/types";
import { canConvert, convertAmount, rateToBase } from "../src/domain/currency";
import type { ExchangeRates } from "../src/domain/types";

function baseRates(): ExchangeRates {
  return { eurUsd: 1.1, usdLbp: 90000, customToBase: {} };
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

// The suite runs in Node, which has no localStorage. A minimal in-memory
// stand-in keeps the caching behaviour under test without pulling in a DOM.
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

beforeEach(() => {
  localStorage.clear();
});

describe("fetchExchangeRates", () => {
  it("stores rates it fetched and reports them as updated", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ rates: { EUR: 1, USD: 1.2, GBP: 0.85 } }));
    const result = await fetchExchangeRates({ fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result.status).toBe("updated");
    expect(result.snapshot?.ratesPerEur.USD).toBe(1.2);
    expect(result.snapshot?.ratesPerEur.GBP).toBe(0.85);
  });

  it("reuses a fresh cache instead of calling the provider again", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ rates: { USD: 1.2 } }));
    await fetchExchangeRates({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const second = await fetchExchangeRates({ fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(second.status).toBe("cached");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refetches once the cache is stale", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ rates: { USD: 1.2 } }));
    const start = Date.parse("2026-08-15T00:00:00Z");
    await fetchExchangeRates({ fetchImpl: fetchImpl as unknown as typeof fetch, now: start });
    await fetchExchangeRates({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: start + RATE_MAX_AGE_MS + 1000,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps working when the provider is unreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await fetchExchangeRates({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.status).toBe("unavailable");
    expect(result.message).toContain("network down");
  });

  it("treats an error response as unavailable rather than as data", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 503));
    const result = await fetchExchangeRates({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.status).toBe("unavailable");
  });

  it("rejects a payload whose rates are unusable", async () => {
    // A zero or negative rate would make every converted amount meaningless.
    const fetchImpl = vi.fn(async () => jsonResponse({ rates: { USD: 0, GBP: -3 } }));
    const result = await fetchExchangeRates({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.status).toBe("unavailable");
  });

  it("drops individual bad rates but keeps the good ones", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ rates: { USD: 1.2, GBP: 0, JPY: "abc", CAD: 1.5 } }));
    const result = await fetchExchangeRates({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.status).toBe("updated");
    expect(result.snapshot?.ratesPerEur.CAD).toBe(1.5);
    expect(result.snapshot?.ratesPerEur.GBP).toBeUndefined();
    expect(result.snapshot?.ratesPerEur.JPY).toBeUndefined();
  });
});

describe("isStale", () => {
  it("treats a missing snapshot as stale", () => {
    expect(isStale(null)).toBe(true);
  });

  it("is fresh inside the window and stale past it", () => {
    const now = Date.parse("2026-08-15T12:00:00Z");
    const snapshot: RateSnapshot = {
      ratesPerEur: { USD: 1.2 },
      fetchedAt: new Date(now - 1000).toISOString(),
      source: "test",
    };
    expect(isStale(snapshot, now)).toBe(false);
    expect(isStale(snapshot, now + RATE_MAX_AGE_MS + 1)).toBe(true);
  });
});

describe("applyRatesToSettings", () => {
  const snapshot: RateSnapshot = {
    ratesPerEur: { EUR: 1, USD: 1.2, LBP: 108000, GBP: 0.85 },
    fetchedAt: "2026-08-15T10:00:00Z",
    source: "test-provider",
  };

  it("updates the manual EUR/USD and USD/LBP pairs", () => {
    const next = applyRatesToSettings(baseRates(), snapshot);
    expect(next.eurUsd).toBe(1.2);
    expect(next.usdLbp).toBeCloseTo(108000 / 1.2);
  });

  it("records provenance for display", () => {
    const next = applyRatesToSettings(baseRates(), snapshot);
    expect(next.ratesUpdatedAt).toBe("2026-08-15T10:00:00Z");
    expect(next.ratesSource).toBe("test-provider");
  });

  it("never overwrites a manual override with a fetched rate", () => {
    const current = { ...baseRates(), customToBase: { GBP: 1.4 } };
    const next = applyRatesToSettings(current, snapshot);
    expect(next.customToBase.GBP).toBe(1.4);
    expect(next.perEur?.GBP).toBe(0.85);
  });
});

describe("rateToBase with provider rates", () => {
  it("pivots through EUR for a pair with no manual rate", () => {
    const rates: ExchangeRates = { ...baseRates(), perEur: { EUR: 1, GBP: 0.8, CAD: 1.6 } };
    // 1 GBP = 1/0.8 EUR = 1.25 EUR; in CAD that is 1.25 × 1.6 = 2.
    expect(rateToBase("GBP", "CAD", rates)).toBeCloseTo(2);
    expect(rateToBase("GBP", "EUR", rates)).toBeCloseTo(1.25);
  });

  it("prefers a manual override over the provider rate", () => {
    const rates: ExchangeRates = { ...baseRates(), customToBase: { GBP: 1.5 }, perEur: { EUR: 1, GBP: 0.8 } };
    expect(rateToBase("GBP", "EUR", rates)).toBe(1.5);
  });

  it("ignores a non-positive rate rather than producing nonsense", () => {
    const rates: ExchangeRates = { ...baseRates(), customToBase: { GBP: 0 }, perEur: { EUR: 1, GBP: 0.8 } };
    // A zero override must not zero out every GBP amount.
    expect(rateToBase("GBP", "EUR", rates)).toBeCloseTo(1.25);
  });

  it("falls back to 1 only when nothing is known, and says so", () => {
    const rates = baseRates();
    expect(rateToBase("JPY", "EUR", rates)).toBe(1);
    expect(canConvert("JPY", "EUR", rates)).toBe(false);
    expect(canConvert("USD", "EUR", rates)).toBe(true);
  });

  it("keeps a round trip stable", () => {
    const rates: ExchangeRates = { ...baseRates(), perEur: { EUR: 1, GBP: 0.86, CAD: 1.47 } };
    const there = convertAmount(100, "GBP", "CAD", rates)!;
    const back = convertAmount(there, "CAD", "GBP", rates)!;
    expect(back).toBeCloseTo(100, 6);
  });

  it("treats a zero amount as a real zero, not missing", () => {
    const rates = baseRates();
    expect(convertAmount(0, "USD", "EUR", rates)).toBe(0);
    expect(convertAmount(null, "USD", "EUR", rates)).toBeNull();
  });
});

describe("tracked currencies", () => {
  const settingsWith = (overrides: Partial<Settings>): Settings =>
    ({ ...createSeedBudgetSnapshot().settings, ...overrides }) as Settings;

  it("offers every currency when nothing has been chosen", () => {
    expect(trackedCurrencies(settingsWith({}))).toEqual(CURRENCY_OPTIONS);
  });

  it("narrows the list to the chosen set", () => {
    expect(trackedCurrencies(settingsWith({ baseCurrency: "EUR", trackedCurrencies: ["EUR", "USD"] })))
      .toEqual(["EUR", "USD"]);
  });

  it("always includes the display currency, whatever the stored list says", () => {
    // Otherwise the budget cannot state its own totals in its own currency.
    expect(trackedCurrencies(settingsWith({ baseCurrency: "GBP", trackedCurrencies: ["EUR", "USD"] })))
      .toContain("GBP");
  });

  it("keeps the canonical order rather than the order they were added", () => {
    expect(trackedCurrencies(settingsWith({ baseCurrency: "EUR", trackedCurrencies: ["JPY", "USD", "EUR"] })))
      .toEqual(["EUR", "USD", "JPY"]);
  });

  it("ignores an unknown code instead of offering it", () => {
    expect(trackedCurrencies(settingsWith({ baseCurrency: "EUR", trackedCurrencies: ["EUR", "XYZ" as never] })))
      .toEqual(["EUR"]);
  });

  it("still offers a record's own currency while it is being edited", () => {
    // The money was spent in it; rewriting the field would falsify the record.
    const settings = settingsWith({ baseCurrency: "EUR", trackedCurrencies: ["EUR"] });
    expect(currencyOptionsFor(settings, "JPY")).toEqual(["EUR", "JPY"]);
    expect(currencyOptionsFor(settings, "EUR")).toEqual(["EUR"]);
    expect(currencyOptionsFor(settings)).toEqual(["EUR"]);
  });

  it("finds every currency the budget has actually recorded something in", () => {
    const snapshot = createSeedBudgetSnapshot();
    const used = currenciesInUse(snapshot);
    // The seed records activities in both euros and dollars.
    expect(used.has("EUR")).toBe(true);
    expect(used.has("USD")).toBe(true);
    expect(used.has("JPY")).toBe(false);
  });
});
