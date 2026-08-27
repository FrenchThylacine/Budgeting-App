/**
 * The report: the funding breakdown, activity costs, and printing in black
 * ========================================================================
 *
 * A report is printed, and a great many printers are monochrome. Every
 * distinction it makes therefore has to survive the colour being removed —
 * which is a testable property, not a matter of taste: for each meaning the
 * report conveys, there must be something other than a colour conveying it.
 */
import { describe, expect, it } from "vitest";
import { buildPeriodReport, reportHtml } from "../src/domain/report";
import { createSeedBudgetSnapshot, createEmptyBudgetSnapshot } from "../src/data/seedBudget";
import { catId } from "./helpers/seedIds";
import { formatMoney } from "../src/domain/currency";
import type { Activity, BudgetSnapshot, SpendingEntry } from "../src/domain/types";

const NOW = new Date(2026, 7, 16);

function entry(overrides: Partial<SpendingEntry>): SpendingEntry {
  return {
    id: `spend-${Math.random().toString(16).slice(2, 8)}`,
    year: 2026,
    month: 8,
    week: 33,
    date: "2026-08-10",
    categoryId: "cat-spending",
    amount: 0,
    currency: "EUR",
    recurrenceType: "none",
    isPiloting: false,
    note: "",
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

function activity(name: string, overrides: Partial<Activity>): Activity {
  return {
    id: `act-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    categoryId: "cat-test",
    currency: "EUR",
    recurrenceType: "monthly",
    recurrenceInterval: 1,
    pricePerSession: null,
    pricePerPurchase: null,
    pricePerMonth: null,
    estimatedCost: null,
    yearlyEstimate: null,
    active: true,
    visible: true,
    seasonalTag: "normal",
    order: 0,
    notes: "",
    ...overrides,
  };
}

/** One transaction of each funding kind, plus three activities to match. */
function reportSnapshot(): BudgetSnapshot {
  const snapshot = createSeedBudgetSnapshot(NOW);
  snapshot.settings.selectedYear = 2026;
  snapshot.settings.selectedMonth = 8;
  snapshot.settings.selectedPeriodMode = "month";
  snapshot.settings.monthlyBudget = 1000;
  snapshot.settings.baseCurrency = "EUR";
  snapshot.settings.monthlyBudgetCurrency = "EUR";
  const category = catId(snapshot, "cat-spending");
  snapshot.years["2026"].spendingEntries = [
    entry({ amount: 300, categoryId: category, source: "personal" }),
    entry({ amount: 200, categoryId: category, source: "shared" }),
    entry({ amount: 150, categoryId: category, source: "external" }),
  ];
  const utilities = catId(snapshot, "cat-utilities");
  snapshot.years["2026"].activities = [
    activity("Mine", { categoryId: utilities, costModel: "fixed", pricePerMonth: 100 }),
    activity("Lessons", {
      categoryId: utilities,
      costModel: "fixed",
      pricePerMonth: 200,
      fundingSource: "other",
      fundedBy: "Dad",
    }),
    activity("Navigraph", {
      categoryId: utilities,
      costModel: "fixedYearly",
      yearlyEstimate: 81.64,
      nextRenewalDate: "2026-09-14",
    }),
    activity("Undated annual", { categoryId: utilities, costModel: "fixedYearly", yearlyEstimate: 60 }),
  ];
  return snapshot;
}

const money = (value: number) => formatMoney(value, "EUR", "symbol");

describe("the funding breakdown", () => {
  const report = buildPeriodReport(reportSnapshot(), "month", NOW);

  it("reports all three kinds, never two", () => {
    expect(report.funding.lines.map((line) => line.kind)).toEqual(["personal", "other", "outside"]);
  });

  it("keeps paid-by-other and outside-budget as separate amounts", () => {
    const byKind = Object.fromEntries(report.funding.lines.map((line) => [line.kind, line]));
    expect(byKind.personal.amount).toBeCloseTo(300, 6);
    expect(byKind.other.amount).toBeCloseTo(200, 6);
    expect(byKind.outside.amount).toBeCloseTo(150, 6);
    expect(report.funding.gross).toBeCloseTo(650, 6);
  });

  it("gives shares that add up to the whole", () => {
    const total = report.funding.lines.reduce((sum, line) => sum + (line.share ?? 0), 0);
    expect(total).toBeCloseTo(100, 6);
  });

  it("gives each kind a distinct non-colour mark", () => {
    const glyphs = report.funding.lines.map((line) => line.glyph);
    expect(new Set(glyphs).size).toBe(3);
  });

  it("says in words that neither exclusion was charged to the budget", () => {
    const notes = report.notes.join(" ");
    expect(notes).toMatch(/paid by someone else/i);
    expect(notes).toMatch(/outside this budget/i);
  });
});

describe("activity costs in the report", () => {
  const report = buildPeriodReport(reportSnapshot(), "month", NOW);

  it("lists every active activity with its monthly and yearly cost", () => {
    expect(report.activities.lines.map((line) => line.name).sort()).toEqual(
      ["Lessons", "Mine", "Navigraph", "Undated annual"].sort(),
    );
    const mine = report.activities.lines.find((line) => line.name === "Mine")!;
    expect(mine.monthly).toBeCloseTo(100, 6);
    expect(mine.yearly).toBeCloseTo(1200, 6);
  });

  it("splits the totals three ways", () => {
    expect(report.activities.monthly.personal).toBeCloseTo(100 + 81.64 / 12 + 5, 4);
    expect(report.activities.monthly.other).toBeCloseTo(200, 6);
    expect(report.activities.monthly.gross).toBeCloseTo(report.activities.monthly.personal + 200, 4);
  });

  it("names who pays an externally funded activity", () => {
    const lessons = report.activities.lines.find((line) => line.name === "Lessons")!;
    expect(lessons.fundingLabel).toBe("Paid by other");
  });

  it("shows nothing due for an annual charge that does not renew this month", () => {
    const navigraph = report.activities.lines.find((line) => line.name === "Navigraph")!;
    // August; it renews in September.
    expect(navigraph.dueThisMonth).toBe(0);
    expect(navigraph.dueNote).toMatch(/not due/i);
  });

  it("refuses to place an activity with no known payment date", () => {
    const undated = report.activities.lines.find((line) => line.name === "Undated annual")!;
    expect(undated.dueThisMonth).toBeNull();
    expect(undated.dueNote).toMatch(/renewal date/i);
    expect(report.activities.unscheduled).toBe(1);
    // And the report says so in words, naming the activity.
    expect(report.notes.join(" ")).toMatch(/Undated annual/);
  });

  it("excludes the unknown one from the month's requirement", () => {
    // August requires the two monthly ones and nothing else.
    expect(report.activities.requiredThisMonth.personal).toBeCloseTo(100, 6);
    expect(report.activities.requiredThisMonth.other).toBeCloseTo(200, 6);
  });
});

describe("printing without colour", () => {
  const html = reportHtml(buildPeriodReport(reportSnapshot(), "month", NOW), money);

  it("carries a glyph beside every funding label", () => {
    for (const glyph of ["●", "◆", "▲"]) {
      expect(html).toContain(glyph);
    }
  });

  it("prints a legend naming what each mark means", () => {
    expect(html).toMatch(/●\s*Paid by me/);
    expect(html).toMatch(/◆\s*Paid by other/);
    expect(html).toMatch(/▲\s*Outside budget/);
  });

  it("says 'over cap' in words rather than only in red", () => {
    const snapshot = reportSnapshot();
    const category = snapshot.categories.find((item) => item.id === catId(snapshot, "cat-spending"))!;
    category.monthlyCap = 100;
    const withBreach = reportHtml(buildPeriodReport(snapshot, "month", NOW), money);
    expect(withBreach).toContain("OVER CAP");
    // And the flag is a bordered box, so it survives with no fill at all.
    expect(withBreach).toMatch(/\.flag\s*\{[^}]*border:/);
  });

  it("distinguishes the emphasised card by weight, not by a tint", () => {
    expect(html).toMatch(/\.card-strong\s*\{[^}]*border:\s*2px/);
  });

  it("gives bars a border so they remain visible unfilled", () => {
    expect(html).toMatch(/\.hbar-plain\s*\{[^}]*border:/);
    expect(html).toMatch(/\.bar-fill\s*\{[^}]*border:/);
  });

  it("keeps rows and headings from breaking across pages", () => {
    expect(html).toMatch(/@media print[\s\S]*break-inside:\s*avoid/);
    expect(html).toMatch(/thead\s*\{\s*display:\s*table-header-group/);
  });

  it("hides the print button when printing", () => {
    expect(html).toMatch(/@media print[\s\S]*\.no-print\s*\{\s*display:\s*none/);
  });

  it("is entirely self-contained — no external asset can fail to load", () => {
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("escapes user text rather than injecting it", () => {
    const snapshot = reportSnapshot();
    snapshot.years["2026"].activities[0].name = '<script>alert("x")</script>';
    const escaped = reportHtml(buildPeriodReport(snapshot, "month", NOW), money);
    expect(escaped).not.toContain("<script>alert");
    expect(escaped).toContain("&lt;script&gt;");
  });
});

describe("a report with nothing in it", () => {
  it("says so rather than printing zeroes", () => {
    const empty = createEmptyBudgetSnapshot();
    empty.settings.selectedYear = 2026;
    empty.settings.selectedMonth = 8;
    const report = buildPeriodReport(empty, "month", NOW);
    expect(report.activities.lines).toHaveLength(0);
    expect(report.notes.join(" ")).toMatch(/no spending was recorded/i);
    // And it still renders.
    expect(() => reportHtml(report, money)).not.toThrow();
  });
});
