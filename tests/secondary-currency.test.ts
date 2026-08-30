import { describe, expect, it } from "vitest";
import { displayEquivalent, secondaryEquivalent } from "../src/domain/currency";
import type { ExchangeRates } from "../src/domain/types";

/**
 * The two equivalents, and the difference between them
 * ====================================================
 *
 * An "≈" line answers one of two questions and the application had one
 * function answering both:
 *
 *  - under a **record**, "what is this worth in my money" — the *display*
 *    currency, always on, because the reader already chose it and every total
 *    on the page is in it;
 *  - under an **aggregate**, "what is this worth in the other currency I think
 *    in" — the optional *second* currency.
 *
 * Keyed on the second currency, the first question got the wrong answer: a
 * 150 000 LBP taxi in a euro budget printed "≈ $1.47", a currency nothing else
 * on the screen was in.
 *
 * The other rule both share is negative: the line must be **absent** whenever
 * it would be a guess. `rateToBase` falls back to 1:1 for an unknown pair so
 * the interface keeps rendering, and printing that fallback under a real
 * transaction would state "≈ €150,000" as calmly as it states a real rate.
 */

const rates: ExchangeRates = {
  eurUsd: 1.19,
  usdLbp: 90000,
  customToBase: {},
  perEur: { USD: 1.19, GBP: 0.84, CHF: 0.94 },
};

const settings = (secondaryCurrency?: string) =>
  ({ secondaryCurrency, exchangeRates: rates }) as Parameters<typeof secondaryEquivalent>[2];

/** The display currency the reader chose, for the record-level equivalent. */
const display = (baseCurrency: string) =>
  ({ baseCurrency, exchangeRates: rates }) as Parameters<typeof displayEquivalent>[2];

describe("the second currency under an aggregate", () => {
  it("converts through the euro pivot", () => {
    const result = secondaryEquivalent(100, "USD", settings("EUR"));
    expect(result).not.toBeNull();
    expect(result!.currency).toBe("EUR");
    expect(result!.amount).toBeCloseTo(100 / 1.19, 6);
  });

  it("handles the specification's own example", () => {
    // 150 000 LBP through EUR→USD 1.19 and USD→LBP 90 000.
    const result = secondaryEquivalent(150_000, "LBP", settings("EUR"));
    expect(result!.amount).toBeCloseTo(150_000 / (1.19 * 90_000), 6);
  });

  it("crosses two non-euro currencies", () => {
    const result = secondaryEquivalent(100, "GBP", settings("USD"));
    expect(result!.amount).toBeCloseTo((100 / 0.84) * 1.19, 6);
  });

  it("is absent when no second currency is configured", () => {
    expect(secondaryEquivalent(100, "USD", settings(undefined))).toBeNull();
  });

  it("is absent when the amount is already in the second currency", () => {
    expect(secondaryEquivalent(100, "EUR", settings("EUR"))).toBeNull();
  });

  it("is absent when there is no amount", () => {
    expect(secondaryEquivalent(null, "USD", settings("EUR"))).toBeNull();
    expect(secondaryEquivalent(undefined, "USD", settings("EUR"))).toBeNull();
    expect(secondaryEquivalent(Number.NaN, "USD", settings("EUR"))).toBeNull();
  });

  it("is absent — not 1:1 — when no rate connects the pair", () => {
    // NZD is in no rate table here, and `rateToBase` would answer 1.
    expect(secondaryEquivalent(100, "NZD", settings("EUR"))).toBeNull();
    expect(secondaryEquivalent(100, "EUR", settings("NZD"))).toBeNull();
  });

  it("keeps zero, which is a real amount", () => {
    const result = secondaryEquivalent(0, "USD", settings("EUR"));
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(0);
  });

  it("carries the sign of a negative movement", () => {
    const result = secondaryEquivalent(-50, "USD", settings("EUR"));
    expect(result!.amount).toBeCloseTo(-50 / 1.19, 6);
  });
});

describe("the display currency under a record", () => {
  it("converts a foreign transaction into the money the reader budgets in", () => {
    // The brief's own example: a Lebanese taxi in a euro budget.
    const result = displayEquivalent(150_000, "LBP", display("EUR"));
    expect(result).not.toBeNull();
    expect(result!.currency).toBe("EUR");
    expect(result!.amount).toBeCloseTo(150_000 / (1.19 * 90_000), 6);
  });

  it("does not depend on the second currency at all", () => {
    /*
     * The regression this file exists for. With the second currency set to
     * dollars, the taxi used to print "≈ $1.47" — a currency the reader never
     * asked about for this figure, and one no total beside it was in.
     */
    const withSecond = { baseCurrency: "EUR", secondaryCurrency: "USD", exchangeRates: rates } as never;
    expect(displayEquivalent(150_000, "LBP", withSecond)!.currency).toBe("EUR");
  });

  it("is absent when the record is already in the display currency", () => {
    expect(displayEquivalent(42, "EUR", display("EUR"))).toBeNull();
  });

  it("is absent rather than fabricated when no rate connects the pair", () => {
    const noRate = { baseCurrency: "EUR", exchangeRates: { ...rates, perEur: { USD: 1.19 } } } as never;
    expect(displayEquivalent(100, "JPY", noRate)).toBeNull();
  });

  it("and the aggregate equivalent still answers the other question", () => {
    // Same settings object, both questions, two different answers.
    const both = { baseCurrency: "EUR", secondaryCurrency: "USD", exchangeRates: rates } as never;
    expect(displayEquivalent(150_000, "LBP", both)!.currency).toBe("EUR");
    expect(secondaryEquivalent(2400, "EUR", both)!.currency).toBe("USD");
    expect(secondaryEquivalent(2400, "EUR", both)!.amount).toBeCloseTo(2400 * 1.19, 6);
  });
});
