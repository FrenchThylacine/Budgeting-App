/**
 * The externally-funded-spending rule.
 *
 * A transaction somebody else paid for is recorded in full and charged to
 * nothing. The worked example this file is built around is the one in the
 * specification:
 *
 *     Budget           €1,000
 *     Personal spend     €300
 *     Paid by other      €200
 *     Remaining          €700   ← not €500
 *
 * Every figure that answers "how am I doing against my budget" is asserted
 * against it: remaining budget, utilisation, burn rate, forecast, category
 * totals, health, period comparison, the year and year-to-date totals, and the
 * report. The transaction itself must stay visible and keep its amount.
 */

import { describe, expect, it } from "vitest";
import {
  budgetPacing,
  budgetRelevantEntries,
  categoryBreakdown,
  cumulativeForecast,
  entriesForSelectedPeriod,
  fundingSplit,
  periodComparison,
  recurringMonthlySplit,
  spendingStats,
} from "../src/domain/analytics";
import { calculateYear, summarizeCategories, summarizeMonth } from "../src/domain/calculations";
import {
  externalEntries,
  fundingLabel,
  isExternallyFunded,
  isPersonallyFunded,
  personalEntries,
} from "../src/domain/funding";
import { buildPeriodReport } from "../src/domain/report";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import { findSeedCategory } from "../src/domain/seedCategories";
import type { BudgetSnapshot, SpendingEntry } from "../src/domain/types";

const NOW = new Date("2026-07-31T12:00:00Z");

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

/** The specification's example: €1,000 budget, €300 personal, €200 external. */
function exampleSnapshot(): BudgetSnapshot {
  const snap = createSeedBudgetSnapshot();
  const spendingCategory = findSeedCategory(snap.categories, "cat-spending")?.id ?? snap.categories[0].id;
  snap.settings.selectedPeriodMode = "month";
  snap.settings.selectedYear = 2026;
  snap.settings.selectedMonth = 7;
  snap.settings.baseCurrency = "EUR";
  snap.settings.monthlyBudget = 1000;
  snap.settings.monthlyBudgetCurrency = "EUR";
  snap.years["2026"] = {
    year: 2026,
    activities: [],
    spendingEntries: [
      entry({ amount: 300, source: "personal", categoryId: spendingCategory, note: "Groceries" }),
      entry({ amount: 200, source: "shared", categoryId: spendingCategory, note: "Dinner, paid by a friend" }),
    ],
    wishlistItems: [],
    walletEntries: [],
    closedMonths: [],
    monthlyNotes: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  return snap;
}

describe("the funding predicate", () => {
  it("treats a missing source as personal", () => {
    expect(isPersonallyFunded(entry({}))).toBe(true);
    expect(isExternallyFunded(entry({}))).toBe(false);
  });

  it("treats every non-personal source as external", () => {
    for (const source of ["external", "shared", "reimbursed", "gift"]) {
      expect(isExternallyFunded(entry({ source }))).toBe(true);
    }
  });

  it("splits a list without losing or duplicating an entry", () => {
    const entries = [entry({ source: "personal" }), entry({ source: "shared" }), entry({})];
    expect(personalEntries(entries)).toHaveLength(2);
    expect(externalEntries(entries)).toHaveLength(1);
  });

  it("names the source for a badge", () => {
    // Renamed deliberately: the three classifications are now "Paid by me —
    // in budget", "Paid by other" and "Outside budget", and the stored values
    // are unchanged so no record had to be rewritten.
    expect(fundingLabel("shared")).toBe("Paid by other");
    expect(fundingLabel(undefined)).toBe("Paid by me — in budget");
  });
});

describe("the worked example: €1,000 budget, €300 personal, €200 external", () => {
  const snap = exampleSnapshot();
  const entries = entriesForSelectedPeriod(snap, snap.settings);
  const budgetEntries = budgetRelevantEntries(entries, snap.settings);

  it("keeps both transactions, at their real amounts", () => {
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.amount).sort((a, b) => a - b)).toEqual([200, 300]);
  });

  it("charges €300 to the budget and leaves €700", () => {
    const pacing = budgetPacing(snap, budgetEntries, NOW);
    expect(pacing?.budget).toBe(1000);
    expect(pacing?.spent).toBe(300);
    expect(pacing?.remaining).toBe(700);
    expect(pacing?.utilisation).toBeCloseTo(30);
  });

  it("paces the burn rate on personal spend alone", () => {
    const pacing = budgetPacing(snap, budgetEntries, NOW);
    // 31 days elapsed of a 31-day month: €300 / 31 per day, projecting €300.
    expect(pacing?.dailyAverage).toBeCloseTo(300 / 31);
    expect(pacing?.projectedTotal).toBeCloseTo(300);
    expect(pacing?.projectedRemaining).toBeCloseTo(700);
  });

  it("reports personal, external and all-transaction totals separately", () => {
    const split = fundingSplit(entries, snap);
    expect(split.personal).toBe(300);
    expect(split.external).toBe(200);
    expect(split.transactions).toBe(500);
    expect(split.personalCount).toBe(1);
    expect(split.externalCount).toBe(1);
  });

  it("summarises the month at €300, not €500", () => {
    const summary = summarizeMonth(snap.years["2026"].spendingEntries, snap, 2026, 7, NOW);
    expect(summary.total).toBe(300);
    expect(summary.personalTotal).toBe(300);
    expect(summary.externalTotal).toBe(200);
    expect(summary.transactionTotal).toBe(500);
    // The external transaction is still counted as a record that exists.
    expect(summary.entryCount).toBe(2);
    expect(summary.externalCount).toBe(1);
  });

  it("keeps the year and year-to-date totals personal", () => {
    const calc = calculateYear(snap, NOW);
    expect(calc.totalSpend).toBe(300);
    expect(calc.externalSpend).toBe(200);
    expect(calc.ytdTotal).toBe(300);
    expect(calc.externalYtdTotal).toBe(200);
    expect(calc.delta).toBe(700);
  });

  it("keeps category totals personal, so a cap is not breached by someone else", () => {
    const stats = categoryBreakdown(budgetEntries, snap);
    const total = stats.reduce((sum, stat) => sum + stat.total, 0);
    expect(total).toBe(300);

    // And the month-level helper agrees with the period-aware selector.
    const rows = summarizeCategories(snap.years["2026"].spendingEntries, snap.categories, snap, 7);
    expect(rows.reduce((sum, row) => sum + row.total, 0)).toBe(300);
  });

  it("counts one transaction, not two, in the spending statistics", () => {
    const stats = spendingStats(budgetEntries, snap);
    expect(stats.total).toBe(300);
    expect(stats.count).toBe(1);
    expect(stats.average).toBe(300);
  });

  it("forecasts from personal spend alone", () => {
    const forecast = cumulativeForecast(budgetEntries, snap, snap.settings, NOW);
    const last = forecast?.actual.filter((value) => value != null).at(-1);
    expect(last).toBe(300);
  });

  it("compares periods on personal spend alone", () => {
    const previous = exampleSnapshot();
    previous.years["2026"].spendingEntries.push(
      entry({ amount: 400, month: 6, week: 24, date: "2026-06-10", source: "personal" }),
      entry({ amount: 900, month: 6, week: 24, date: "2026-06-11", source: "external" }),
    );
    const comparison = periodComparison(previous, previous.settings);
    expect(comparison.currentTotal).toBe(300);
    expect(comparison.previousTotal).toBe(400);
    expect(comparison.deltaAbs).toBe(-100);
  });

  it("splits recurring vs one-off on personal spend alone", () => {
    const split = recurringMonthlySplit(snap, snap.settings);
    expect(split.oneOff[6]).toBe(300);
  });

  it("reports €300 spent, €700 remaining, and names the €200 separately", () => {
    const report = buildPeriodReport(snap, "month", NOW);
    const line = (label: string) => report.summary.find((item) => item.label === label)?.value;
    expect(line("Total spending")).toContain("300");
    expect(line("Remaining")).toContain("700");
    expect(line("Paid by other")).toContain("200");
    // And the report says so in words, so a printed page cannot mislead.
    expect(report.notes.join(" ")).toMatch(/excluded from the budget/i);
  });
});

describe("changing the funding source changes the figures", () => {
  it("moves €200 out of the budget when a transaction is marked as paid by someone else", () => {
    const snap = exampleSnapshot();
    // Start with both transactions personal: €500 spent, €500 left.
    snap.years["2026"].spendingEntries[1].source = "personal";
    let pacing = budgetPacing(snap, budgetRelevantEntries(entriesForSelectedPeriod(snap, snap.settings), snap.settings), NOW);
    expect(pacing?.spent).toBe(500);
    expect(pacing?.remaining).toBe(500);

    // Mark the second one as paid by somebody else.
    snap.years["2026"].spendingEntries[1].source = "shared";
    pacing = budgetPacing(snap, budgetRelevantEntries(entriesForSelectedPeriod(snap, snap.settings), snap.settings), NOW);
    expect(pacing?.spent).toBe(300);
    expect(pacing?.remaining).toBe(700);

    // The transaction kept its amount throughout.
    expect(snap.years["2026"].spendingEntries[1].amount).toBe(200);
  });
});

describe("weeks and years follow the same rule", () => {
  it("excludes external spend from the weekly summary", () => {
    const snap = exampleSnapshot();
    snap.settings.selectedPeriodMode = "week";
    snap.settings.selectedWeek = 28;
    snap.settings.selectedWeekYear = 2026;
    const entries = budgetRelevantEntries(entriesForSelectedPeriod(snap, snap.settings), snap.settings);
    expect(spendingStats(entries, snap).total).toBe(300);
  });

  it("excludes external spend from the yearly summary", () => {
    const snap = exampleSnapshot();
    snap.settings.selectedPeriodMode = "year";
    const entries = budgetRelevantEntries(entriesForSelectedPeriod(snap, snap.settings), snap.settings);
    expect(spendingStats(entries, snap).total).toBe(300);
  });
});
