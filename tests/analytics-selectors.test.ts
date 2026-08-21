/**
 * Regression tests for the shared analytics selectors in src/domain/analytics.ts.
 * These selectors feed both the Dashboard and the dedicated Analytics page,
 * so their correctness guarantees the two surfaces stay consistent.
 */

import { describe, expect, it } from "vitest";
import {
  budgetPacing,
  budgetRelevantEntries,
  categoriesOverCap,
  categoryBreakdown,
  entriesForSelectedPeriod,
  monthlyTrendBars,
  periodComparison,
  selectedPeriodWindow,
  spendingStats,
  weeklyTrendBars,
} from "../src/domain/analytics";
import { calculateYear } from "../src/domain/calculations";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import type { BudgetSnapshot, SpendingEntry } from "../src/domain/types";

function entry(overrides: Partial<SpendingEntry>): SpendingEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2)}`,
    year: 2026,
    month: 7,
    week: 28,
    date: "2026-07-09",
    categoryId: "cat-spending",
    amount: 100,
    currency: "EUR",
    recurrenceType: "none",
    isPiloting: false,
    note: "",
    createdAt: "2026-07-09T00:00:00Z",
    updatedAt: "2026-07-09T00:00:00Z",
    ...overrides,
  };
}

function snapshotWith(entries: SpendingEntry[]): BudgetSnapshot {
  const snap = createSeedBudgetSnapshot();
  const record = snap.years["2026"] ?? {
    year: 2026,
    activities: [],
    spendingEntries: [],
    wishlistItems: [],
    walletEntries: [],
    closedMonths: [],
    monthlyNotes: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  record.spendingEntries = entries;
  snap.years["2026"] = record;
  snap.settings.selectedPeriodMode = "month";
  snap.settings.selectedYear = 2026;
  snap.settings.selectedMonth = 7;
  snap.settings.baseCurrency = "EUR";
  return snap;
}

describe("spendingStats", () => {
  it("returns null totals for empty periods (missing is not zero)", () => {
    const snap = snapshotWith([]);
    const stats = spendingStats([], snap);
    expect(stats.total).toBeNull();
    expect(stats.average).toBeNull();
    expect(stats.median).toBeNull();
    expect(stats.largest).toBeNull();
    expect(stats.count).toBe(0);
  });

  it("keeps a single zero-amount entry as a real zero total", () => {
    const snap = snapshotWith([entry({ amount: 0 })]);
    const stats = spendingStats(snap.years["2026"].spendingEntries, snap);
    expect(stats.total).toBe(0);
    expect(stats.count).toBe(1);
    expect(stats.average).toBe(0);
  });

  it("computes average, median and largest", () => {
    const snap = snapshotWith([
      entry({ amount: 10 }),
      entry({ amount: 20 }),
      entry({ amount: 90 }),
    ]);
    const stats = spendingStats(snap.years["2026"].spendingEntries, snap);
    expect(stats.total).toBe(120);
    expect(stats.average).toBe(40);
    expect(stats.median).toBe(20);
    expect(stats.largest).toBe(90);
  });

  it("computes even-count median as midpoint", () => {
    const snap = snapshotWith([
      entry({ amount: 10 }),
      entry({ amount: 20 }),
      entry({ amount: 30 }),
      entry({ amount: 40 }),
    ]);
    const stats = spendingStats(snap.years["2026"].spendingEntries, snap);
    expect(stats.median).toBe(25);
  });

  it("splits recurring and one-off spend with counts", () => {
    const snap = snapshotWith([
      entry({ amount: 50, recurrenceType: "monthly" }),
      entry({ amount: 30, recurrenceType: "session" }),
      entry({ amount: 20, recurrenceType: "none" }),
    ]);
    const stats = spendingStats(snap.years["2026"].spendingEntries, snap);
    expect(stats.recurringTotal).toBe(80);
    expect(stats.oneOffTotal).toBe(20);
    expect(stats.recurringCount).toBe(2);
    expect(stats.oneOffCount).toBe(1);
    expect(stats.recurringShare).toBeCloseTo(80);
  });
});

describe("budgetPacing", () => {
  it("returns null outside month mode", () => {
    const snap = snapshotWith([entry({ amount: 100 })]);
    snap.settings.selectedPeriodMode = "year";
    expect(budgetPacing(snap, snap.years["2026"].spendingEntries)).toBeNull();
  });

  it("returns null when no budget is set", () => {
    const snap = snapshotWith([entry({ amount: 100 })]);
    snap.settings.monthlyBudget = 0;
    expect(budgetPacing(snap, snap.years["2026"].spendingEntries)).toBeNull();
  });

  it("computes utilisation, remaining, and projection mid-month", () => {
    const snap = snapshotWith([entry({ amount: 300 })]);
    snap.settings.monthlyBudget = 1000;
    snap.settings.monthlyBudgetCurrency = "EUR";
    // Mid-July 2026: 15 of 31 days elapsed
    const now = new Date("2026-07-15T12:00:00Z");
    const pacing = budgetPacing(snap, snap.years["2026"].spendingEntries, now)!;
    expect(pacing.budget).toBe(1000);
    expect(pacing.spent).toBe(300);
    expect(pacing.remaining).toBe(700);
    expect(pacing.utilisation).toBeCloseTo(30);
    expect(pacing.dailyAverage).toBeCloseTo(20);
    expect(pacing.projectedTotal).toBeCloseTo(620);
    expect(pacing.projectedRemaining).toBeCloseTo(380);
    expect(pacing.daysLeft).toBe(16);
    expect(pacing.requiredDailyPace).toBeCloseTo(700 / 16);
  });

  it("treats an already-finished month as fully elapsed", () => {
    const snap = snapshotWith([entry({ amount: 310, month: 7 })]);
    snap.settings.monthlyBudget = 1000;
    const now = new Date("2026-09-10T12:00:00Z");
    const pacing = budgetPacing(snap, snap.years["2026"].spendingEntries, now)!;
    expect(pacing.dailyAverage).toBeCloseTo(10);
    expect(pacing.projectedTotal).toBeCloseTo(310);
    expect(pacing.daysLeft).toBe(0);
    expect(pacing.requiredDailyPace).toBeNull();
  });
});

describe("categoryBreakdown", () => {
  it("excludes piloting from shares but keeps its total visible", () => {
    const snap = snapshotWith([
      entry({ amount: 100, categoryId: "cat-spending" }),
      entry({ amount: 300, categoryId: "cat-food" }),
      entry({ amount: 500, categoryId: "cat-piloting", isPiloting: true }),
    ]);
    snap.categories.push(
      { id: "cat-food", name: "Food", bucket: "general", color: "#00ff00" },
      { id: "cat-piloting", name: "Piloting", bucket: "piloting", color: "#0000ff" },
    );
    const breakdown = categoryBreakdown(snap.years["2026"].spendingEntries, snap);
    const piloting = breakdown.find((b) => b.categoryId === "cat-piloting")!;
    const food = breakdown.find((b) => b.categoryId === "cat-food")!;
    const spending = breakdown.find((b) => b.categoryId === "cat-spending")!;

    expect(piloting.total).toBe(500);
    expect(piloting.share).toBeNull();
    expect(food.share).toBeCloseTo(75); // 300 / (100 + 300)
    expect(spending.share).toBeCloseTo(25);
    // Sorted by total descending: piloting first
    expect(breakdown[0].categoryId).toBe("cat-piloting");
  });
});

describe("periodComparison", () => {
  it("compares against the previous month and reports delta", () => {
    const snap = snapshotWith([
      entry({ amount: 100, month: 7, date: "2026-07-09" }),
      entry({ amount: 50, month: 6, date: "2026-06-09", week: 24 }),
    ]);
    const cmp = periodComparison(snap, snap.settings);
    expect(cmp.currentTotal).toBe(100);
    expect(cmp.previousTotal).toBe(50);
    expect(cmp.deltaAbs).toBe(50);
    expect(cmp.deltaPct).toBeCloseTo(100);
  });

  it("keeps a missing previous period as null instead of zero", () => {
    const snap = snapshotWith([entry({ amount: 100, month: 7 })]);
    const cmp = periodComparison(snap, snap.settings);
    expect(cmp.previousTotal).toBeNull();
    expect(cmp.deltaAbs).toBeNull();
    expect(cmp.deltaPct).toBeNull();
  });

  it("crosses the year boundary when comparing January to December", () => {
    const snap = snapshotWith([entry({ amount: 100, month: 1, date: "2026-01-10", week: 2 })]);
    snap.years["2025"] = {
      ...snap.years["2026"],
      year: 2025,
      spendingEntries: [entry({ amount: 40, year: 2025, month: 12, date: "2025-12-10", week: 50 })],
    };
    snap.settings.selectedMonth = 1;
    const cmp = periodComparison(snap, snap.settings);
    expect(cmp.currentTotal).toBe(100);
    expect(cmp.previousTotal).toBe(40);
  });
});

describe("trend bar windows", () => {
  it("weekly window always contains the selected week", () => {
    const snap = snapshotWith([entry({ amount: 10, week: 33, month: 8, date: "2026-08-12" })]);
    snap.settings.selectedWeek = 33;
    const calc = calculateYear(snap);
    const bars = weeklyTrendBars(calc.weeklyTrend, 33, 12);
    expect(bars).toHaveLength(12);
    const highlighted = bars.filter((b) => b.highlight);
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].label).toBe("W33");
  });

  it("weekly window clamps at the start of the year", () => {
    const snap = snapshotWith([]);
    const calc = calculateYear(snap);
    const bars = weeklyTrendBars(calc.weeklyTrend, 2, 12);
    expect(bars[0].label).toBe("W1");
    expect(bars.some((b) => b.label === "W2" && b.highlight)).toBe(true);
  });

  it("monthly bars keep pending/closed empty months as null (missing ≠ 0)", () => {
    const snap = snapshotWith([entry({ amount: 100, month: 7 })]);
    const calc = calculateYear(snap, new Date("2026-08-15T12:00:00Z"));
    const bars = monthlyTrendBars(calc.monthlyTrend, 7);
    expect(bars[6].value).toBe(100); // July recorded
    expect(bars[0].value).toBeNull(); // January closed with no data → missing
    expect(bars[6].highlight).toBe(true);
  });
});

describe("budgetRelevantEntries", () => {
  it("excludes externally funded spend unconditionally", () => {
    const snap = snapshotWith([
      entry({ amount: 100, source: "personal" }),
      entry({ amount: 50, source: "external" }),
      entry({ amount: 25, source: "shared" }),
    ]);
    const all = entriesForSelectedPeriod(snap, snap.settings);
    expect(budgetRelevantEntries(all, snap.settings)).toHaveLength(1);

    // The old opt-in setting must not be able to bring it back: this is a rule
    // about what the numbers mean, not a preference.
    snap.settings.ignoreNonBudgetSpending = false;
    expect(budgetRelevantEntries(all, snap.settings)).toHaveLength(1);
  });

  it("treats a missing source as personal", () => {
    const snap = snapshotWith([entry({ amount: 100 })]);
    const all = entriesForSelectedPeriod(snap, snap.settings);
    expect(all[0].source).toBeUndefined();
    expect(budgetRelevantEntries(all, snap.settings)).toHaveLength(1);
  });
});

describe("selectedPeriodWindow", () => {
  it("counts week window as 7 days", () => {
    const snap = snapshotWith([]);
    snap.settings.selectedPeriodMode = "week";
    snap.settings.selectedWeek = 28;
    snap.settings.selectedWeekYear = 2026;
    const w = selectedPeriodWindow(snap.settings, new Date("2026-07-08T12:00:00Z"));
    expect(w.totalDays).toBe(7);
    // Week 28 of 2026 starts Mon 2026-07-06 → July 8 is day 3
    expect(w.elapsedDays).toBe(3);
  });

  it("clamps elapsed days to zero before the period starts", () => {
    const snap = snapshotWith([]);
    snap.settings.selectedMonth = 12;
    const w = selectedPeriodWindow(snap.settings, new Date("2026-07-08T12:00:00Z"));
    expect(w.elapsedDays).toBe(0);
    expect(w.totalDays).toBe(31);
  });
});

describe("category caps", () => {
  function snapshotWithCap(cap: number | undefined, spend: number) {
    const snap = snapshotWith([entry({ amount: spend, categoryId: "cat-capped" })]);
    snap.categories.push({
      id: "cat-capped",
      name: "Capped",
      bucket: "general",
      color: "#ff8800",
      monthlyCap: cap,
    });
    return snap;
  }

  it("reports usage and remaining headroom below the cap", () => {
    const snap = snapshotWithCap(200, 50);
    const stat = categoryBreakdown(snap.years["2026"].spendingEntries, snap).find(
      (s) => s.categoryId === "cat-capped",
    )!;
    expect(stat.cap).toBe(200);
    expect(stat.capUsage).toBeCloseTo(25);
    expect(stat.overCap).toBe(false);
  });

  it("flags a breach once spending passes the cap", () => {
    const snap = snapshotWithCap(100, 150);
    const stats = categoryBreakdown(snap.years["2026"].spendingEntries, snap);
    const stat = stats.find((s) => s.categoryId === "cat-capped")!;
    expect(stat.overCap).toBe(true);
    expect(stat.capUsage).toBeCloseTo(150);
    expect(categoriesOverCap(stats).map((s) => s.categoryId)).toContain("cat-capped");
  });

  it("does not flag spending exactly at the cap", () => {
    const snap = snapshotWithCap(100, 100);
    const stat = categoryBreakdown(snap.years["2026"].spendingEntries, snap).find(
      (s) => s.categoryId === "cat-capped",
    )!;
    expect(stat.overCap).toBe(false);
    expect(stat.capUsage).toBeCloseTo(100);
  });

  it("treats a zero cap as a real limit, not a missing one", () => {
    const snap = snapshotWithCap(0, 10);
    const stat = categoryBreakdown(snap.years["2026"].spendingEntries, snap).find(
      (s) => s.categoryId === "cat-capped",
    )!;
    expect(stat.cap).toBe(0);
    expect(stat.overCap).toBe(true);
  });

  it("leaves cap fields null when no cap is set", () => {
    const snap = snapshotWithCap(undefined, 50);
    const stat = categoryBreakdown(snap.years["2026"].spendingEntries, snap).find(
      (s) => s.categoryId === "cat-capped",
    )!;
    expect(stat.cap).toBeNull();
    expect(stat.capUsage).toBeNull();
    expect(stat.overCap).toBe(false);
  });

  it("ignores monthly caps outside month mode, where they cannot apply", () => {
    const snap = snapshotWithCap(100, 500);
    snap.settings.selectedPeriodMode = "year";
    const stats = categoryBreakdown(snap.years["2026"].spendingEntries, snap);
    const stat = stats.find((s) => s.categoryId === "cat-capped")!;
    // A year's spend must not be reported as breaching a monthly cap.
    expect(stat.cap).toBeNull();
    expect(stat.overCap).toBe(false);
    expect(categoriesOverCap(stats)).toHaveLength(0);
  });
});
