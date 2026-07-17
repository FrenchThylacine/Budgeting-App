import { describe, it, expect } from "vitest";
import { normalizeAmount, convertAmount } from "../src/domain/currency";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import { createNextYearRecord } from "../src/domain/calculations";

const NOW = new Date("2026-07-09T12:00:00+03:00");

describe("Phase 0 safety net", () => {
  it("treats literal 0 as a valid numeric value", () => {
    const settings = createSeedBudgetSnapshot(NOW).settings;
    expect(normalizeAmount(0, settings.baseCurrency, settings)).toBe(0);
  });

  it("current, as-is behavior: normalizes null/NaN to 0 (explicitly captured)", () => {
    const settings = createSeedBudgetSnapshot(NOW).settings;
    expect(normalizeAmount(null as unknown as number, settings.baseCurrency, settings)).toBe(0);
    expect(normalizeAmount(NaN as unknown as number, settings.baseCurrency, settings)).toBe(0);
  });

  it("currency conversion is deterministic with fixed rates", () => {
    const snapshot = createSeedBudgetSnapshot(NOW);
    const rates = snapshot.settings.exchangeRates;
    const a = 123.45;
    const first = convertAmount(a, "EUR", "USD", rates);
    const second = convertAmount(a, "EUR", "USD", rates);
    expect(first).toBe(second);
  });

  it("historical navigation / next-year creation does not mutate source year data", () => {
    const snapshot = createSeedBudgetSnapshot(NOW);
    const before = JSON.stringify(snapshot.years[String(snapshot.settings.selectedYear)].wishlistItems);
    const next = createNextYearRecord(snapshot, snapshot.settings.selectedYear + 1, NOW);
    expect(JSON.stringify(snapshot.years[String(snapshot.settings.selectedYear)].wishlistItems)).toBe(before);
    expect(next.walletEntries.some((e) => e.type === "opening")).toBe(true);
  });
});
