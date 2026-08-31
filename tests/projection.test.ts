import { describe, expect, it } from "vitest";
import { budgetPacing } from "../src/domain/analytics";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import type { Activity, BudgetSnapshot, SpendingEntry } from "../src/domain/types";

/**
 * Where the month is heading
 * ==========================
 *
 * The projection was `spent ÷ elapsed × total`, which treats a budget as a tap
 * running at a steady rate. Two things make that wrong in opposite directions
 * on the same screen, and both are tested here:
 *
 *  - a **recurring charge is an event, not a rate** — a €200 gym block paid on
 *    the 3rd is a fifth of the month by the 4th, and extrapolating it says the
 *    reader is on course to pay it fifteen times;
 *  - a **charge the application already knows is coming is not a guess** — an
 *    annual subscription renewing on the 28th is in the schedule, with a date
 *    on it, and straight-line pacing ignores it and then reports a surprise.
 */

const YEAR = 2026;
const MONTH = 6; // June: 30 days, so "half the month" is exactly the 15th.
const MID_MONTH = new Date(YEAR, MONTH - 1, 15, 12, 0, 0);

function budget(entries: Partial<SpendingEntry>[], activities: Partial<Activity>[] = []): BudgetSnapshot {
  const snapshot = createSeedBudgetSnapshot();
  snapshot.settings.selectedYear = YEAR;
  snapshot.settings.selectedMonth = MONTH;
  snapshot.settings.selectedPeriodMode = "month";
  snapshot.settings.monthlyBudget = 1000;
  snapshot.settings.monthlyBudgetCurrency = snapshot.settings.baseCurrency;

  const year = String(YEAR);
  snapshot.years[year] = {
    ...snapshot.years[String(snapshot.settings.selectedYear)],
    year: YEAR,
    activities: activities.map((activity, index) => ({
      id: `act${index}`,
      name: `Activity ${index}`,
      categoryId: snapshot.categories[0].id,
      pricePerMonth: 0,
      currency: snapshot.settings.baseCurrency,
      recurrenceType: "monthly",
      recurrenceInterval: 1,
      active: true,
      visible: true,
      order: index,
      notes: "",
      costModel: "fixed",
      ...activity,
    })) as Activity[],
    spendingEntries: [],
    wishlistItems: [],
    walletEntries: [],
    closedMonths: [],
    monthlyNotes: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return snapshot;
}

const entry = (over: Partial<SpendingEntry>): SpendingEntry =>
  ({
    id: Math.random().toString(36).slice(2),
    year: YEAR,
    month: MONTH,
    week: 1,
    date: `${YEAR}-06-05`,
    amount: 0,
    currency: "EUR",
    categoryId: "",
    note: "",
    source: "personal",
    recurrenceType: "none",
    createdAt: "",
    updatedAt: "",
    ...over,
  }) as SpendingEntry;

describe("the projected total", () => {
  it("extrapolates ordinary day-to-day spending", () => {
    // €150 of groceries over the first 15 days → €10/day → €300 for June.
    const snapshot = budget([]);
    const entries = [entry({ amount: 150 })];
    const pacing = budgetPacing(snapshot, entries, MID_MONTH)!;
    expect(pacing.projectedTotal).toBeCloseTo(300, 5);
  });

  it("does not extrapolate a recurring charge fifteen times", () => {
    /*
     * The failure the old formula had. €200 paid once, on a recurring
     * transaction, halfway through the month: the naive projection doubles it
     * to €400 as though it were a daily habit.
     */
    const snapshot = budget([]);
    const entries = [entry({ amount: 200, recurrenceType: "monthly" })];
    const pacing = budgetPacing(snapshot, entries, MID_MONTH)!;
    expect(pacing.spent).toBe(200);
    // It happened, so it is in the total — and it is not multiplied.
    expect(pacing.projectedTotal).toBeCloseTo(200, 5);
  });

  it("does not extrapolate a payment recorded against an activity", () => {
    const snapshot = budget([]);
    const entries = [entry({ amount: 200, activityId: "act0" })];
    const pacing = budgetPacing(snapshot, entries, MID_MONTH)!;
    expect(pacing.projectedTotal).toBeCloseTo(200, 5);
  });

  it("adds a charge the schedule says is still coming", () => {
    /*
     * A yearly subscription renewing on the 28th, with nothing spent yet. The
     * old projection reported €0 all month and then a surprise.
     */
    const snapshot = budget([], [
      { costModel: "fixedYearly", yearlyEstimate: 120, nextRenewalDate: `${YEAR}-06-28`, recurrenceType: "yearly" },
    ]);
    const pacing = budgetPacing(snapshot, [], MID_MONTH)!;
    expect(pacing.projectedTotal).toBeCloseTo(120, 5);
  });

  it("does not add a charge somebody else pays for", () => {
    // It falls due, it costs real money, and it costs this budget nothing.
    const snapshot = budget([], [
      {
        costModel: "fixedYearly",
        yearlyEstimate: 120,
        nextRenewalDate: `${YEAR}-06-28`,
        recurrenceType: "yearly",
        fundingSource: "other",
      },
    ]);
    const pacing = budgetPacing(snapshot, [], MID_MONTH)!;
    expect(pacing.projectedTotal).toBeCloseTo(0, 5);
  });

  it("does not count a scheduled charge whose date has already passed", () => {
    // Dated the 5th and today is the 15th: if it happened it is in `spent`,
    // and counting it again would be counting it twice.
    const snapshot = budget([], [
      { costModel: "fixedYearly", yearlyEstimate: 120, nextRenewalDate: `${YEAR}-06-05`, recurrenceType: "yearly" },
    ]);
    const pacing = budgetPacing(snapshot, [], MID_MONTH)!;
    expect(pacing.projectedTotal).toBeCloseTo(0, 5);
  });

  it("combines the two: a habit that continues and a charge that is coming", () => {
    const snapshot = budget([], [
      { costModel: "fixedYearly", yearlyEstimate: 120, nextRenewalDate: `${YEAR}-06-28`, recurrenceType: "yearly" },
    ]);
    const entries = [entry({ amount: 150 })];
    const pacing = budgetPacing(snapshot, entries, MID_MONTH)!;
    // €150 spent + €10/day for 15 more days + the €120 renewal.
    expect(pacing.projectedTotal).toBeCloseTo(420, 5);
  });
});
