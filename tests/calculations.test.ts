import { describe, expect, it } from "vitest";
import { calculateRolloverDelta, calculateSuggestedMonthlyBudget, calculateYear, createNextYearRecord, summarizeWeek } from "../src/domain/calculations";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import type { Activity, SpendingEntry } from "../src/domain/types";

const NOW = new Date("2026-07-09T12:00:00+03:00");

function zeroEntry(overrides: Partial<SpendingEntry> = {}): SpendingEntry {
  return {
    id: "test-zero",
    year: 2026,
    month: 1,
    week: 1,
    date: "2026-01-01",
    categoryId: "cat-spending",
    amount: 0,
    currency: "EUR",
    recurrenceType: "none",
    isPiloting: false,
    note: "Explicit zero",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function recurringActivity(overrides: Partial<Activity>): Activity {
  return {
    id: "test-activity",
    name: "Test recurring",
    categoryId: "cat-other",
    currency: "EUR",
    recurrenceType: "monthly",
    recurrenceInterval: 1,
    pricePerSession: null,
    pricePerPurchase: null,
    pricePerMonth: 1234,
    estimatedCost: 1234,
    yearlyEstimate: null,
    active: true,
    visible: true,
    seasonalTag: "normal",
    order: 0,
    notes: "",
    ...overrides,
  };
}

describe("budget calculations", () => {
  it("keeps piloting separated while preserving full totals", () => {
    const snapshot = createSeedBudgetSnapshot(NOW);
    const result = calculateYear(snapshot, NOW);

    expect(result.generalBudget).toBeGreaterThan(0);
    expect(result.pilotingBudget).toBeGreaterThan(0);
    expect(result.combinedBudget).toBeCloseTo(result.generalBudget + result.pilotingBudget, 8);
    expect(result.includedBudget).toBeCloseTo(result.combinedBudget, 8);
  });

  it("shows NaN only for closed empty periods", () => {
    const snapshot = createSeedBudgetSnapshot(NOW);
    const result = calculateYear(snapshot, NOW);

    expect(result.weeklyTrend[0].status).toBe("nan");
    expect(result.monthlyTrend[6].status).toBe("pending");
  });

  it("treats an entered 0 as a real value", () => {
    const snapshot = createSeedBudgetSnapshot(NOW);
    snapshot.years["2026"].spendingEntries.push(zeroEntry());

    const summary = summarizeWeek(snapshot.years["2026"].spendingEntries, snapshot, 2026, 1, NOW);

    expect(summary.status).toBe("zero");
    expect(summary.total).toBe(0);
    expect(summary.entryCount).toBe(1);
  });

  it("does not compute rollover for pending or NaN periods", () => {
    const snapshot = createSeedBudgetSnapshot(NOW);

    expect(calculateRolloverDelta(snapshot, 2026, 1, NOW)).toBeNull();
    expect(calculateRolloverDelta(snapshot, 2026, 7, NOW)).toBeNull();
  });

  it("handles negative rollover deltas visibly", () => {
    const snapshot = createSeedBudgetSnapshot(NOW);
    snapshot.years["2026"].spendingEntries.push(
      zeroEntry({
        id: "huge-march-spend",
        month: 3,
        week: 12,
        date: "2026-03-18",
        amount: 10000,
        currency: "EUR",
      }),
    );

    const delta = calculateRolloverDelta(snapshot, 2026, 3, NOW);

    expect(delta).not.toBeNull();
    expect(delta!).toBeLessThan(0);
  });

  it("flushes bought wishlist items when creating a new year", () => {
    const snapshot = createSeedBudgetSnapshot(NOW);
    const previousWishlist = JSON.stringify(snapshot.years["2026"].wishlistItems);
    const next = createNextYearRecord(snapshot, 2027, NOW);

    expect(next.wishlistItems.every((item) => !item.bought)).toBe(true);
    expect(next.wishlistItems.some((item) => item.name === "BATC")).toBe(false);
    expect(JSON.stringify(snapshot.years["2026"].wishlistItems)).toBe(previousWishlist);
  });

  it("suggests monthly budget from active recurring costs excluding piloting", () => {
    const snapshot = createSeedBudgetSnapshot(NOW);
    snapshot.settings.baseCurrency = "EUR";
    snapshot.years["2026"].activities = [
      recurringActivity({ id: "normal-recurring", categoryId: "cat-other", pricePerMonth: 1234, estimatedCost: 1234 }),
      recurringActivity({ id: "pilot-recurring", categoryId: "cat-piloting", pricePerMonth: 9999, estimatedCost: 9999 }),
      recurringActivity({ id: "inactive-recurring", active: false, pricePerMonth: 500, estimatedCost: 500 }),
    ];

    const suggestion = calculateSuggestedMonthlyBudget(snapshot);

    expect(suggestion.recurringTotal).toBe(1234);
    expect(suggestion.suggestedAmount).toBe(1300);
  });

  it("rounds suggested budget up to the next hundred in USD", () => {
    const snapshot = createSeedBudgetSnapshot(NOW);
    snapshot.settings.baseCurrency = "USD";
    snapshot.years["2026"].activities = [
      recurringActivity({ id: "usd-recurring", categoryId: "cat-other", currency: "USD", pricePerMonth: 5678, estimatedCost: 5678 }),
    ];

    const suggestion = calculateSuggestedMonthlyBudget(snapshot);

    expect(suggestion.recurringTotal).toBe(5678);
    expect(suggestion.suggestedAmount).toBe(5700);
  });
});
