import { describe, expect, it } from "vitest";
import { activityBudgetSummary } from "../src/domain/activityBudget";
import { monthlyEstimateNative, yearlyEstimateNative } from "../src/domain/calculations";
import { installmentPaymentDates, installmentTotal, paymentsBetween } from "../src/domain/payments";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import type { Activity, BudgetSnapshot } from "../src/domain/types";

/**
 * An instalment plan ends
 * =======================
 *
 * That is the whole reason this is a payment model rather than a recurring
 * cost. Twelve payments of €250 is not €250 a month for ever: the thirteenth
 * month costs nothing, and a budget that goes on demanding €250 is describing a
 * commitment somebody has finished paying.
 *
 * So the payment *dates* are authoritative everywhere — what a month requires
 * is the instalments that genuinely fall in it, which is one or none — while
 * the activity's own worth stays the total, because a €3,000 licence paid in
 * three costs €3,000 whether the payments straddle a year boundary or not.
 */

const NOW = new Date("2026-01-15T12:00:00Z");

function withActivity(over: Partial<Activity>): BudgetSnapshot {
  const snapshot = createSeedBudgetSnapshot(NOW);
  snapshot.settings.selectedYear = 2026;
  snapshot.settings.selectedMonth = 1;
  const year = String(snapshot.settings.selectedYear);
  snapshot.years[year].activities = [
    {
      id: "piloting",
      name: "Piloting",
      categoryId: snapshot.categories[0].id,
      currency: "EUR",
      recurrenceType: "custom",
      recurrenceInterval: 1,
      active: true,
      visible: true,
      order: 0,
      notes: "",
      costModel: "installments",
      installmentCount: 3,
      installmentAmount: 1000,
      installmentFrequency: "monthly",
      nextRenewalDate: "2026-02-10",
      ...over,
    } as Activity,
  ];
  return snapshot;
}

/**
 * A date as the reader's calendar shows it.
 *
 * `toISOString` would answer in UTC, and every date in this domain is a *local*
 * one — a payment on the 10th is on the 10th wherever the machine running the
 * tests happens to be. Comparing through UTC turns local midnight into the
 * previous day and fails a correct schedule.
 */
const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const activityOf = (snapshot: BudgetSnapshot) =>
  snapshot.years[String(snapshot.settings.selectedYear)].activities[0];

/** What the budget says this activity requires in one month. */
function requiredIn(snapshot: BudgetSnapshot, year: number, month: number) {
  const summary = activityBudgetSummary(snapshot, year, month);
  return summary.items.find((item) => item.activity.id === "piloting")!;
}

describe("the plan's dates", () => {
  it("produces exactly as many payments as the plan has", () => {
    const dates = installmentPaymentDates(activityOf(withActivity({})));
    expect(dates).toHaveLength(3);
    expect(dates.map((date) => localDay(date))).toEqual([
      "2026-02-10",
      "2026-03-10",
      "2026-04-10",
    ]);
  });

  it("keeps the day of the month, clamped to short months", () => {
    // A plan starting on the 31st pays on the 28th in February rather than
    // slipping into March and dragging every later payment with it.
    const dates = installmentPaymentDates(
      activityOf(withActivity({ nextRenewalDate: "2026-01-31", installmentCount: 3 })),
    );
    expect(dates.map((date) => localDay(date))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });

  it("supports a yearly plan", () => {
    const dates = installmentPaymentDates(
      activityOf(withActivity({ installmentFrequency: "yearly", installmentCount: 3 })),
    );
    expect(dates.map((date) => localDay(date).slice(0, 4))).toEqual(["2026", "2027", "2028"]);
  });

  it("supports a custom interval in days", () => {
    const dates = installmentPaymentDates(
      activityOf(
        withActivity({ installmentFrequency: "custom", installmentIntervalDays: 42, installmentCount: 3 }),
      ),
    );
    expect(dates.map((date) => localDay(date))).toEqual([
      "2026-02-10",
      "2026-03-24",
      "2026-05-05",
    ]);
  });

  it("produces nothing without a first payment date", () => {
    // The application does not invent dates, here or anywhere else.
    expect(installmentPaymentDates(activityOf(withActivity({ nextRenewalDate: undefined })))).toEqual([]);
  });
});

describe("what a month actually requires", () => {
  it("is one instalment in a month a payment falls in", () => {
    const snapshot = withActivity({});
    const february = requiredIn(snapshot, 2026, 2);
    expect(february.status).toBe("due");
    expect(february.dueNative).toBe(1000);
  });

  it("is nothing in a month between payments of a yearly plan", () => {
    const snapshot = withActivity({ installmentFrequency: "yearly" });
    expect(requiredIn(snapshot, 2026, 5).status).toBe("not-due");
  });

  it("is nothing once the plan has finished", () => {
    /*
     * The case that makes this a model of its own. Three monthly payments from
     * February end in April; May owes nothing, and a recurring cost would go on
     * claiming €1,000 for ever.
     */
    const snapshot = withActivity({});
    // Payments in February, March and April; every later month owes nothing.
    expect(requiredIn(snapshot, 2026, 5).status).toBe("not-due");
    expect(requiredIn(snapshot, 2026, 8).status).toBe("not-due");
    expect(requiredIn(snapshot, 2026, 12).status).toBe("not-due");
  });

  it("says so rather than guessing when there is no first payment date", () => {
    const snapshot = withActivity({ nextRenewalDate: undefined });
    const item = requiredIn(snapshot, 2026, 2);
    expect(item.status).toBe("unknown");
    expect(item.unknownReason).toBe("activities.unknown.noFirstInstallment");
  });

  it("says so rather than guessing when no amount is stated", () => {
    const snapshot = withActivity({ installmentAmount: null });
    const item = requiredIn(snapshot, 2026, 2);
    expect(item.status).toBe("unknown");
    expect(item.unknownReason).toBe("activities.unknown.installmentAmountMissing");
  });
});

describe("what the activity is worth", () => {
  it("is the whole plan, not a year of it", () => {
    const activity = activityOf(withActivity({}));
    expect(installmentTotal(activity)).toBe(3000);
    expect(yearlyEstimateNative(activity)).toBe(3000);
  });

  it("stays the whole plan when the payments straddle a year boundary", () => {
    const activity = activityOf(
      withActivity({ nextRenewalDate: "2026-11-10", installmentCount: 4 }),
    );
    // November, December, January, February — €4,000, not €2,000 this year.
    expect(yearlyEstimateNative(activity)).toBe(4000);
  });

  it("accrues over the months the plan runs for, not over twelve", () => {
    /*
     * Six monthly payments of €500 is €500 a month for half a year, not €250 a
     * month for a year that does not exist. The accrual is a display figure —
     * what a month *requires* comes from the dates above — but it should not be
     * a figure nobody could arrive at.
     */
    const activity = activityOf(
      withActivity({ installmentCount: 6, installmentAmount: 500 }),
    );
    expect(monthlyEstimateNative(activity)).toBeCloseTo(500, 6);
  });
});

describe("funding", () => {
  it("keeps an instalment plan somebody else pays for out of the personal budget", () => {
    const snapshot = withActivity({ fundingSource: "other", fundedBy: "Dad" });
    const summary = activityBudgetSummary(snapshot, 2026, 2);
    // It is due, it is real money, and it is not this budget's money.
    expect(requiredIn(snapshot, 2026, 2).status).toBe("due");
    expect(summary.requiredThisMonth.personal).toBe(0);
    expect(summary.requiredThisMonth.other).toBe(1000);
  });

  it("keeps an outside-budget plan out of the personal requirement", () => {
    const snapshot = withActivity({ fundingSource: "outside" });
    const summary = activityBudgetSummary(snapshot, 2026, 2);
    expect(summary.requiredThisMonth.personal).toBe(0);
    expect(summary.requiredThisMonth.outside).toBe(1000);
  });

  it("counts a plan the reader pays for", () => {
    const summary = activityBudgetSummary(withActivity({}), 2026, 2);
    expect(summary.requiredThisMonth.personal).toBe(1000);
  });

  it("excludes an externally funded plan from the yearly share", () => {
    const snapshot = withActivity({ fundingSource: "other" });
    const summary = activityBudgetSummary(snapshot, 2026, 2);
    expect(summary.shares.map((share) => share.activity.id)).not.toContain("piloting");
  });
});

describe("the payment window", () => {
  it("reports only the payments inside it", () => {
    const activity = activityOf(withActivity({}));
    const payments = paymentsBetween(activity, new Date(2026, 2, 1), new Date(2026, 2, 31));
    expect(payments).not.toBeNull();
    expect(payments).toHaveLength(1);
    expect(payments![0].amountNative).toBe(1000);
  });

  it("reports none after the plan is over", () => {
    const activity = activityOf(withActivity({}));
    expect(paymentsBetween(activity, new Date(2027, 0, 1), new Date(2027, 11, 31))).toEqual([]);
  });
});
