/**
 * Pinned currencies, the full dataset behind them, and cross rates
 * ================================================================
 *
 * Three separate promises:
 *
 *  1. the app knows about every ISO 4217 currency, not ten;
 *  2. only the *pinned* ones appear in dropdowns, and pinning is reversible;
 *  3. any currency converts to any other, from one canonical rate per
 *     currency rather than a maintained table of pairs.
 */
import { describe, expect, it } from "vitest";
import {
  ALL_CURRENCY_CODES,
  CURRENCY_OPTIONS,
  CURRENCY_SYMBOLS,
  canConvert,
  convertAmount,
  crossRate,
  currenciesInUse,
  currencyDecimals,
  currencyName,
  currencyOptionsFor,
  formatMoney,
  formatRate,
  isCurrencyCode,
  searchCurrencies,
  trackedCurrencies,
  unpinBlockedReason,
} from "../src/domain/currency";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import type { CurrencyCode, ExchangeRates, Settings } from "../src/domain/types";

const NOW = new Date(2026, 7, 16);

function settingsWith(overrides: Partial<Settings>): Settings {
  return { ...createSeedBudgetSnapshot(NOW).settings, ...overrides } as Settings;
}

/** Provider rates quoted per euro, which is the only representation stored. */
function rates(perEur: Partial<Record<CurrencyCode, number>>): ExchangeRates {
  return { eurUsd: 1.17, usdLbp: 89500, customToBase: {}, perEur: { EUR: 1, ...perEur } };
}

describe("the dataset", () => {
  it("covers far more than the original ten", () => {
    expect(ALL_CURRENCY_CODES.length).toBeGreaterThan(140);
    for (const code of ["CHF", "SEK", "INR", "BRL", "ZAR", "KRW", "NGN", "VND"]) {
      expect(isCurrencyCode(code), code).toBe(true);
    }
  });

  it("keeps the original ten first, in their original order", () => {
    // The canonical order is what `trackedCurrencies` sorts by, so changing it
    // would reshuffle every existing budget's dropdown.
    expect(ALL_CURRENCY_CODES.slice(0, 10)).toEqual(CURRENCY_OPTIONS);
  });

  it("knows each currency's real number of decimal places", () => {
    expect(currencyDecimals("JPY")).toBe(0);
    expect(currencyDecimals("KWD")).toBe(3);
    expect(currencyDecimals("EUR")).toBe(2);
  });

  it("formats to the currency's own precision", () => {
    // The yen has no minor unit; printing "¥ 12,00" is not how a price is
    // written anywhere in Japan.
    expect(formatMoney(12, "JPY", "symbol")).not.toMatch(/[.,]\d\d$/);
    expect(formatMoney(12, "EUR", "symbol")).toMatch(/12[.,]00/);
  });

  it("has a symbol and a real name for every code", () => {
    for (const code of ALL_CURRENCY_CODES) {
      expect(CURRENCY_SYMBOLS[code], code).toBeTruthy();
      // A name, not the code echoed back — which is what `currencyName`
      // returns for anything it does not know.
      expect(currencyName(code), code).not.toBe(code);
      expect(currencyName(code).length, code).toBeGreaterThan(2);
    }
  });

  it("rejects a code that is not a currency", () => {
    expect(isCurrencyCode("XYZ")).toBe(false);
    expect(isCurrencyCode("")).toBe(false);
  });
});

describe("searching the dataset", () => {
  it("ranks an exact code first", () => {
    expect(searchCurrencies("CHF")[0]).toBe("CHF");
  });

  it("finds a currency by its English name", () => {
    expect(searchCurrencies("swiss")).toContain("CHF");
    expect(searchCurrencies("rupee")).toContain("INR");
  });

  it("is accent-insensitive, so an unaccented query still finds the accented name", () => {
    expect(searchCurrencies("cordoba")).toContain("NIO");
    expect(searchCurrencies("colon")).toContain("CRC");
  });

  it("returns everything for an empty query", () => {
    expect(searchCurrencies("  ")).toHaveLength(ALL_CURRENCY_CODES.length);
  });

  it("returns nothing rather than everything for a query that matches nothing", () => {
    expect(searchCurrencies("zzzzqq")).toHaveLength(0);
  });
});

describe("pinning", () => {
  it("offers the default set when the budget has never chosen", () => {
    // Unchanged behaviour for every budget written before the dataset grew.
    expect(trackedCurrencies(settingsWith({}))).toEqual(CURRENCY_OPTIONS);
  });

  it("narrows the dropdown to the pinned set — and only the pinned set", () => {
    const pinned = trackedCurrencies(settingsWith({ baseCurrency: "EUR", trackedCurrencies: ["EUR", "CHF"] }));
    expect(pinned).toEqual(["EUR", "CHF"]);
    expect(pinned).not.toContain("USD");
    // The unpinned ones are still *known*, which is what makes re-pinning work.
    expect(isCurrencyCode("USD")).toBe(true);
  });

  it("pins, unpins and re-pins the same currency", () => {
    let pinned: CurrencyCode[] = ["EUR", "USD"];
    pinned = [...pinned, "JPY"];
    expect(trackedCurrencies(settingsWith({ baseCurrency: "EUR", trackedCurrencies: pinned }))).toContain("JPY");

    pinned = pinned.filter((code) => code !== "JPY");
    expect(trackedCurrencies(settingsWith({ baseCurrency: "EUR", trackedCurrencies: pinned }))).not.toContain("JPY");

    // Re-pinning is simply pinning again: nothing about unpinning is
    // destructive, which is the whole reason it can be a double-tap.
    pinned = [...pinned, "JPY"];
    expect(trackedCurrencies(settingsWith({ baseCurrency: "EUR", trackedCurrencies: pinned }))).toContain("JPY");
  });

  it("always includes the display currency, whatever the stored list says", () => {
    expect(trackedCurrencies(settingsWith({ baseCurrency: "GBP", trackedCurrencies: ["EUR", "USD"] }))).toContain("GBP");
  });

  it("keeps the canonical order rather than the order they were added", () => {
    expect(trackedCurrencies(settingsWith({ baseCurrency: "EUR", trackedCurrencies: ["JPY", "USD", "EUR"] }))).toEqual([
      "EUR",
      "USD",
      "JPY",
    ]);
  });

  it("ignores an unknown code instead of offering it", () => {
    expect(trackedCurrencies(settingsWith({ baseCurrency: "EUR", trackedCurrencies: ["EUR", "XYZ" as never] }))).toEqual([
      "EUR",
    ]);
  });

  it("still offers a record's own currency while it is being edited", () => {
    const settings = settingsWith({ baseCurrency: "EUR", trackedCurrencies: ["EUR"] });
    expect(currencyOptionsFor(settings, "JPY")).toEqual(["EUR", "JPY"]);
    expect(currencyOptionsFor(settings)).toEqual(["EUR"]);
  });
});

describe("what unpinning refuses to do", () => {
  const snapshot = createSeedBudgetSnapshot(NOW);

  it("refuses the display currency", () => {
    expect(unpinBlockedReason(snapshot, snapshot.settings.baseCurrency)).toBe("display-currency");
  });

  it("refuses a currency real records are stored in", () => {
    // The seed records activities in dollars.
    expect(currenciesInUse(snapshot).has("USD")).toBe(true);
    expect(unpinBlockedReason(snapshot, "USD")).toBe("in-use");
  });

  it("allows one nothing depends on", () => {
    expect(currenciesInUse(snapshot).has("CHF")).toBe(false);
    expect(unpinBlockedReason(snapshot, "CHF")).toBeNull();
  });
});

describe("cross rates from one canonical representation", () => {
  const table = rates({ USD: 1.17, GBP: 0.85, JPY: 168, CHF: 0.94, LBP: 104_000 });

  it("converts any pair, in both directions", () => {
    // EUR → USD
    expect(crossRate("EUR", "USD", table)).toBeCloseTo(1.17, 6);
    // USD → EUR is the reciprocal, and the direction genuinely matters.
    expect(crossRate("USD", "EUR", table)).toBeCloseTo(1 / 1.17, 6);
    // EUR → JPY
    expect(crossRate("EUR", "JPY", table)).toBeCloseTo(168, 6);
    // LBP → EUR
    expect(crossRate("LBP", "EUR", table)).toBeCloseTo(1 / 104_000, 10);
    // GBP → CHF, a pair no table anywhere lists.
    expect(crossRate("GBP", "CHF", table)).toBeCloseTo(0.94 / 0.85, 6);
  });

  it("round-trips without drift", () => {
    const there = convertAmount(100, "GBP", "CHF", table)!;
    expect(convertAmount(there, "CHF", "GBP", table)).toBeCloseTo(100, 8);
  });

  it("is 1 for a currency against itself, and that is a real answer", () => {
    expect(crossRate("EUR", "EUR", table)).toBe(1);
  });

  it("returns null rather than 1 for a pair it does not know", () => {
    // A rate of 1 for an unknown pair is the single most dangerous answer
    // available: it looks like a conversion and is a fabrication.
    expect(crossRate("EUR", "MGA", table)).toBeNull();
    expect(canConvert("MGA", "EUR", table)).toBe(false);
  });

  it("folds the two legacy manual pairs into the same euro pivot", () => {
    // A budget that only ever set EUR/USD and USD/LBP by hand keeps working…
    const manual: ExchangeRates = { eurUsd: 1.1, usdLbp: 90_000, customToBase: {} };
    expect(crossRate("EUR", "USD", manual)).toBeCloseTo(1.1, 6);
    expect(crossRate("USD", "LBP", manual)).toBeCloseTo(90_000, 6);
    // …and every pair those two imply now follows from the same arithmetic.
    expect(crossRate("LBP", "EUR", manual)).toBeCloseTo(1 / (1.1 * 90_000), 12);
  });

  it("prints a rate with enough precision to be useful at any magnitude", () => {
    expect(formatRate(1.17)).toMatch(/^1[.,]17/);
    expect(formatRate(104000)).toMatch(/104/);
    // Never "0.00": a small rate keeps significant figures.
    expect(formatRate(0.0000096)).not.toMatch(/^0[.,]0*$/);
  });
});
