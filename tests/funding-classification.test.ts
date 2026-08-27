/**
 * Three funding classifications, not two and a label
 * ==================================================
 *
 * "Paid by other" and "Outside budget" behave identically against the personal
 * budget and mean different things. The tests below pin both halves of that:
 * neither consumes the budget, and nothing merges them.
 */
import { describe, expect, it } from "vitest";
import {
  FUNDING_KINDS,
  FUNDING_META,
  FUNDING_SOURCES,
  activityFundingKind,
  entryFundingKind,
  externalEntries,
  fundedByName,
  fundingKind,
  fundingLabel,
  fundingShortLabel,
  isExternallyFunded,
  isPersonallyFunded,
  otherFundedEntries,
  outsideBudgetEntries,
  personalEntries,
  splitByFunding,
} from "../src/domain/funding";
import { calculateYear, summarizeMonth } from "../src/domain/calculations";
import { budgetPacing, categoryBreakdown, fundingSplit } from "../src/domain/analytics";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import { catId } from "./helpers/seedIds";
import type { BudgetSnapshot, SpendingEntry } from "../src/domain/types";

const NOW = new Date(2026, 7, 16);

function entry(overrides: Partial<SpendingEntry> = {}): SpendingEntry {
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

/** A budget of €1,000 with one transaction of each kind. */
function worked(): BudgetSnapshot {
  const snapshot = createSeedBudgetSnapshot(NOW);
  snapshot.settings.monthlyBudget = 1000;
  snapshot.settings.monthlyBudgetCurrency = "EUR";
  snapshot.settings.baseCurrency = "EUR";
  snapshot.settings.selectedYear = 2026;
  snapshot.settings.selectedMonth = 8;
  snapshot.settings.selectedPeriodMode = "month";
  const category = catId(snapshot, "cat-spending");
  snapshot.years["2026"].spendingEntries = [
    entry({ amount: 300, categoryId: category, source: "personal", note: "Mine" }),
    entry({ amount: 200, categoryId: category, source: "shared", note: "A friend paid" }),
    entry({ amount: 150, categoryId: category, source: "external", note: "Other account" }),
  ];
  return snapshot;
}

describe("the classification itself", () => {
  it("maps the three stored values onto the three kinds", () => {
    expect(fundingKind("personal")).toBe("personal");
    expect(fundingKind("shared")).toBe("other");
    expect(fundingKind("external")).toBe("outside");
  });

  it("treats a missing source as personal, which is what every old record was", () => {
    expect(fundingKind(undefined)).toBe("personal");
    expect(fundingKind(null)).toBe("personal");
    expect(isPersonallyFunded(entry({}))).toBe(true);
  });

  it("reads an unrecognised non-personal value as paid-by-other, never as outside", () => {
    // "gift" and "reimbursed" describe somebody else's money. Reading them as
    // "outside budget" would make an old import claim the user had chosen to
    // keep their own spending off the budget.
    for (const legacy of ["gift", "reimbursed", "sponsored"]) {
      expect(fundingKind(legacy)).toBe("other");
      expect(isExternallyFunded(entry({ source: legacy }))).toBe(true);
    }
  });

  it("offers exactly three options, in a fixed order", () => {
    expect(FUNDING_SOURCES.map((option) => option.kind)).toEqual(["personal", "other", "outside"]);
    expect(FUNDING_KINDS).toEqual(["personal", "other", "outside"]);
  });

  it("names each kind distinctly, in full and in short", () => {
    expect(fundingLabel("personal")).toBe("Paid by me — in budget");
    expect(fundingLabel("shared")).toBe("Paid by other");
    expect(fundingLabel("external")).toBe("Outside budget");
    expect(fundingShortLabel("shared")).not.toBe(fundingShortLabel("external"));
  });

  it("gives each kind a non-colour mark, so print can tell them apart", () => {
    const glyphs = FUNDING_KINDS.map((kind) => FUNDING_META[kind].glyph);
    expect(new Set(glyphs).size).toBe(3);
  });
});

describe("splitting a ledger", () => {
  const entries = [
    entry({ amount: 300, source: "personal" }),
    entry({ amount: 200, source: "shared" }),
    entry({ amount: 150, source: "external" }),
  ];

  it("puts each entry in exactly one bucket", () => {
    const buckets = splitByFunding(entries);
    expect(buckets.personal).toHaveLength(1);
    expect(buckets.other).toHaveLength(1);
    expect(buckets.outside).toHaveLength(1);
  });

  it("keeps the two exclusions separate but also offers them together", () => {
    expect(otherFundedEntries(entries)).toHaveLength(1);
    expect(outsideBudgetEntries(entries)).toHaveLength(1);
    expect(externalEntries(entries)).toHaveLength(2);
    expect(personalEntries(entries)).toHaveLength(1);
  });
});

describe("the worked example: €1,000 budget, €300 mine, €200 theirs, €150 outside", () => {
  const snapshot = worked();

  it("charges €300 and leaves €700 — not €500, and not €350", () => {
    const calc = calculateYear(snapshot, NOW);
    expect(calc.selectedMonthSpend.total).toBeCloseTo(300, 6);
    const pacing = budgetPacing(snapshot, personalEntries(snapshot.years["2026"].spendingEntries), NOW)!;
    expect(pacing.spent).toBeCloseTo(300, 6);
    expect(pacing.remaining).toBeCloseTo(700, 6);
  });

  it("reports all three figures separately, and the gross", () => {
    const split = fundingSplit(snapshot.years["2026"].spendingEntries, snapshot);
    expect(split.personal).toBeCloseTo(300, 6);
    expect(split.otherFunded).toBeCloseTo(200, 6);
    expect(split.outsideBudget).toBeCloseTo(150, 6);
    expect(split.transactions).toBeCloseTo(650, 6);
    // The two exclusions are also available added together, for the callers
    // that genuinely only need "not mine".
    expect(split.external).toBeCloseTo(350, 6);
  });

  it("counts each kind", () => {
    const split = fundingSplit(snapshot.years["2026"].spendingEntries, snapshot);
    expect(split.personalCount).toBe(1);
    expect(split.otherFundedCount).toBe(1);
    expect(split.outsideBudgetCount).toBe(1);
    expect(split.externalCount).toBe(2);
  });

  it("carries the split onto the period summary", () => {
    const summary = summarizeMonth(snapshot.years["2026"].spendingEntries, snapshot, 2026, 8, NOW);
    expect(summary.personalTotal).toBeCloseTo(300, 6);
    expect(summary.otherFundedTotal).toBeCloseTo(200, 6);
    expect(summary.outsideBudgetTotal).toBeCloseTo(150, 6);
    expect(summary.transactionTotal).toBeCloseTo(650, 6);
  });

  it("carries it onto the year, and year to date", () => {
    const calc = calculateYear(snapshot, NOW);
    expect(calc.totalSpend).toBeCloseTo(300, 6);
    expect(calc.otherFundedSpend).toBeCloseTo(200, 6);
    expect(calc.outsideBudgetSpend).toBeCloseTo(150, 6);
    expect(calc.otherFundedYtdTotal).toBeCloseTo(200, 6);
    expect(calc.outsideBudgetYtdTotal).toBeCloseTo(150, 6);
  });

  it("keeps both exclusions out of category totals and caps", () => {
    const stats = categoryBreakdown(personalEntries(snapshot.years["2026"].spendingEntries), snapshot);
    const total = stats.reduce((sum, stat) => sum + stat.total, 0);
    expect(total).toBeCloseTo(300, 6);
  });

  it("keeps every transaction visible at its full amount", () => {
    const entries = snapshot.years["2026"].spendingEntries;
    expect(entries).toHaveLength(3);
    expect(entries.map((item) => item.amount)).toEqual([300, 200, 150]);
  });
});

describe("changing a transaction's funding changes every derived figure", () => {
  it("moves €200 out of the budget and back again", () => {
    const snapshot = worked();
    snapshot.years["2026"].spendingEntries[1].source = "personal";
    expect(calculateYear(snapshot, NOW).selectedMonthSpend.total).toBeCloseTo(500, 6);

    snapshot.years["2026"].spendingEntries[1].source = "shared";
    expect(calculateYear(snapshot, NOW).selectedMonthSpend.total).toBeCloseTo(300, 6);

    // And moving it to the *other* exclusion leaves the budget alone while
    // changing which column it is reported in.
    snapshot.years["2026"].spendingEntries[1].source = "external";
    const split = fundingSplit(snapshot.years["2026"].spendingEntries, snapshot);
    expect(calculateYear(snapshot, NOW).selectedMonthSpend.total).toBeCloseTo(300, 6);
    expect(split.otherFundedCount).toBe(0);
    expect(split.outsideBudgetCount).toBe(2);
  });
});

describe("activities carry the same classification", () => {
  it("defaults to personal for an activity that has never said otherwise", () => {
    expect(activityFundingKind({})).toBe("personal");
    expect(activityFundingKind({ fundingSource: undefined })).toBe("personal");
  });

  it("reads the stored value when there is one", () => {
    expect(activityFundingKind({ fundingSource: "other" })).toBe("other");
    expect(activityFundingKind({ fundingSource: "outside" })).toBe("outside");
  });

  it("names who pays, but only where that means something", () => {
    expect(fundedByName({ fundingSource: "other", fundedBy: "Dad" })).toBe("Dad");
    // Never required, and never shown for the other two kinds.
    expect(fundedByName({ fundingSource: "other", fundedBy: "   " })).toBeNull();
    expect(fundedByName({ fundingSource: "other" })).toBeNull();
    expect(fundedByName({ fundingSource: "personal", fundedBy: "Dad" })).toBeNull();
    expect(fundedByName({ fundingSource: "outside", fundedBy: "Dad" })).toBeNull();
  });
});

describe("the entry-level helper", () => {
  it("classifies a transaction the same way the activity helper does", () => {
    expect(entryFundingKind(entry({ source: "shared" }))).toBe("other");
    expect(entryFundingKind(entry({}))).toBe("personal");
  });
});
