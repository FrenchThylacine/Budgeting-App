import { describe, expect, it } from "vitest";
import { secondaryAmount } from "../src/domain/currency";
import type { ExchangeRates } from "../src/domain/types";

/**
 * The second currency shown under an amount.
 *
 * The rule this exists to enforce is negative: it must be **absent** whenever
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
  ({ secondaryCurrency, exchangeRates: rates }) as Parameters<typeof secondaryAmount>[2];

describe("the second currency under an amount", () => {
  it("converts through the euro pivot", () => {
    const result = secondaryAmount(100, "USD", settings("EUR"));
    expect(result).not.toBeNull();
    expect(result!.currency).toBe("EUR");
    expect(result!.amount).toBeCloseTo(100 / 1.19, 6);
  });

  it("handles the specification's own example", () => {
    // 150 000 LBP through EUR→USD 1.19 and USD→LBP 90 000.
    const result = secondaryAmount(150_000, "LBP", settings("EUR"));
    expect(result!.amount).toBeCloseTo(150_000 / (1.19 * 90_000), 6);
  });

  it("crosses two non-euro currencies", () => {
    const result = secondaryAmount(100, "GBP", settings("USD"));
    expect(result!.amount).toBeCloseTo((100 / 0.84) * 1.19, 6);
  });

  it("is absent when no second currency is configured", () => {
    expect(secondaryAmount(100, "USD", settings(undefined))).toBeNull();
  });

  it("is absent when the amount is already in the second currency", () => {
    expect(secondaryAmount(100, "EUR", settings("EUR"))).toBeNull();
  });

  it("is absent when there is no amount", () => {
    expect(secondaryAmount(null, "USD", settings("EUR"))).toBeNull();
    expect(secondaryAmount(undefined, "USD", settings("EUR"))).toBeNull();
    expect(secondaryAmount(Number.NaN, "USD", settings("EUR"))).toBeNull();
  });

  it("is absent — not 1:1 — when no rate connects the pair", () => {
    // NZD is in no rate table here, and `rateToBase` would answer 1.
    expect(secondaryAmount(100, "NZD", settings("EUR"))).toBeNull();
    expect(secondaryAmount(100, "EUR", settings("NZD"))).toBeNull();
  });

  it("keeps zero, which is a real amount", () => {
    const result = secondaryAmount(0, "USD", settings("EUR"));
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(0);
  });

  it("carries the sign of a negative movement", () => {
    const result = secondaryAmount(-50, "USD", settings("EUR"));
    expect(result!.amount).toBeCloseTo(-50 / 1.19, 6);
  });
});
