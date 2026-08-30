/**
 * What an activity costs, and what it costs *this month*
 * ======================================================
 *
 * The distinction this whole suite exists for:
 *
 *   monthly accrual   — €81.64/year is €6.80 a month, for comparing it
 *                       against a €12 subscription;
 *   monthly requirement — €81.64 in September and €0 in the other eleven.
 *
 * Dividing the year by twelve answers the first question and is simply wrong
 * as an answer to the second. Every case below is checked in both directions,
 * and the `unknown` cases are checked hardest: an activity the app cannot place
 * on a calendar must never be assigned to a month, and must never quietly
 * become zero either.
 */
import { describe, expect, it } from "vitest";
import {
  activityBudgetSummary,
  activityMonthCost,
  fundingShares,
} from "../src/domain/activityBudget";
import { createEmptyBudgetSnapshot } from "../src/data/seedBudget";
import type { Activity, BudgetSnapshot } from "../src/domain/types";
import { en } from "../src/i18n/en";
import type { FundingKind } from "../src/domain/funding";

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: `act-${Math.random().toString(16).slice(2, 8)}`,
    name: "Test",
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

/**
 * A snapshot whose only content is the given activities.
 *
 * Built on the *empty* budget rather than the demo one, so a figure in a test
 * can only have come from the activity under test.
 */
function snapshotWith(activities: Activity[], year = 2026): BudgetSnapshot {
  const snapshot = createEmptyBudgetSnapshot();
  snapshot.settings.selectedYear = year;
  snapshot.settings.baseCurrency = "EUR";
  snapshot.settings.monthlyBudgetCurrency = "EUR";
  snapshot.years[String(year)] = {
    year,
    activities,
    spendingEntries: [],
    wishlistItems: [],
    walletEntries: [],
    closedMonths: [],
    monthlyNotes: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  return snapshot;
}

/** The brief's own example: an annual subscription renewing in September. */
const navigraph = activity({
  name: "Navigraph",
  costModel: "fixedYearly",
  yearlyEstimate: 81.64,
  nextRenewalDate: "2026-09-14",
  recurrenceType: "yearly",
});

describe("an annual subscription with a known renewal date", () => {
  const snapshot = snapshotWith([navigraph]);

  it("charges the whole year in the month it renews", () => {
    const september = activityMonthCost(navigraph, snapshot, 2026, 9);
    expect(september.status).toBe("due");
    expect(september.dueBase).toBeCloseTo(81.64, 6);
    expect(september.dueDates).toHaveLength(1);
    expect(september.dueDates[0].getMonth() + 1).toBe(9);
    expect(september.dueDates[0].getDate()).toBe(14);
  });

  it("charges nothing at all in the other eleven months", () => {
    for (const month of [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12]) {
      const cost = activityMonthCost(navigraph, snapshot, 2026, month);
      expect(cost.status, `month ${month}`).toBe("not-due");
      // A confident zero, not a missing value: we know it is not due.
      expect(cost.dueBase, `month ${month}`).toBe(0);
    }
  });

  it("still reports a monthly accrual, and never confuses it with the charge", () => {
    const october = activityMonthCost(navigraph, snapshot, 2026, 10);
    // The accrual is the year over twelve, and it is present in every month…
    expect(october.monthlyBase).toBeCloseTo(81.64 / 12, 6);
    expect(october.yearlyBase).toBeCloseTo(81.64, 6);
    // …while the requirement for that same month is zero.
    expect(october.dueBase).toBe(0);
  });

  it("repeats on the same day in later years", () => {
    const next = activityMonthCost(navigraph, snapshot, 2027, 9);
    expect(next.status).toBe("due");
    expect(next.dueDates[0].getFullYear()).toBe(2027);
    expect(next.dueDates[0].getDate()).toBe(14);
  });

  it("is not due in a year before it started", () => {
    // The subscription began in 2026; 2025 had no charge for it.
    expect(activityMonthCost(navigraph, snapshot, 2025, 9).status).toBe("not-due");
  });

  it("sums to the yearly amount exactly once across twelve months", () => {
    let total = 0;
    for (let month = 1; month <= 12; month += 1) {
      total += activityMonthCost(navigraph, snapshot, 2026, month).dueBase ?? 0;
    }
    expect(total).toBeCloseTo(81.64, 6);
  });
});

describe("an annual subscription with no renewal date", () => {
  const undated = activity({
    name: "Nebula",
    costModel: "fixedYearly",
    yearlyEstimate: 60,
    recurrenceType: "yearly",
  });
  const snapshot = snapshotWith([undated]);

  it("is never assigned to a month — not even January", () => {
    for (let month = 1; month <= 12; month += 1) {
      const cost = activityMonthCost(undated, snapshot, 2026, month);
      expect(cost.status, `month ${month}`).toBe("unknown");
      // Null, not zero: "we do not know" and "nothing is due" are different
      // answers, and only one of them can be added to a total.
      expect(cost.dueBase, `month ${month}`).toBeNull();
      expect(cost.dueDates, `month ${month}`).toHaveLength(0);
    }
  });

  it("still states what it costs, and says why the month is unknown", () => {
    const cost = activityMonthCost(undated, snapshot, 2026, 3);
    expect(cost.yearlyBase).toBeCloseTo(60, 6);
    expect(cost.monthlyBase).toBeCloseTo(5, 6);
    // A translation key, so the interface can say it in the reader's language.
    expect(cost.unknownReason).toBe("activities.unknown.noRenewalDate");
    expect(en[cost.unknownReason as keyof typeof en]).toMatch(/renewal date/i);
  });

  it("is excluded from the month's requirement and reported separately", () => {
    const summary = activityBudgetSummary(snapshot, 2026, 3);
    expect(summary.requiredThisMonth.gross).toBe(0);
    expect(summary.unscheduled).toHaveLength(1);
    expect(summary.unscheduledMonthly.personal).toBeCloseTo(5, 6);
    // The estimate is still in the accrual totals — it is a real commitment.
    expect(summary.yearly.gross).toBeCloseTo(60, 6);
  });
});

describe("the automatic model with a yearly recurrence", () => {
  it("behaves the same way: a date makes it placeable, no date makes it unknown", () => {
    const dated = activity({
      name: "Legacy annual",
      recurrenceType: "yearly",
      yearlyEstimate: 120,
      nextRenewalDate: "2026-04-02",
    });
    const undated = activity({ name: "Legacy annual, no date", recurrenceType: "yearly", yearlyEstimate: 120 });
    const snapshot = snapshotWith([dated, undated]);

    expect(activityMonthCost(dated, snapshot, 2026, 4).dueBase).toBeCloseTo(120, 6);
    expect(activityMonthCost(dated, snapshot, 2026, 5).dueBase).toBe(0);
    expect(activityMonthCost(undated, snapshot, 2026, 4).status).toBe("unknown");
  });

  it("clamps a 29 February renewal to the 28th in a common year", () => {
    const leapling = activity({
      name: "Leap day",
      costModel: "fixedYearly",
      yearlyEstimate: 40,
      nextRenewalDate: "2024-02-29",
    });
    const snapshot = snapshotWith([leapling]);
    const february = activityMonthCost(leapling, snapshot, 2026, 2);
    expect(february.status).toBe("due");
    expect(february.dueDates[0].getDate()).toBe(28);
    // And it does not roll into March.
    expect(activityMonthCost(leapling, snapshot, 2026, 3).status).toBe("not-due");
  });
});

describe("a monthly activity", () => {
  const rent = activity({ name: "Ogero", costModel: "fixed", pricePerMonth: 10 });
  const snapshot = snapshotWith([rent]);

  it("is due every month, because it genuinely is", () => {
    for (let month = 1; month <= 12; month += 1) {
      const cost = activityMonthCost(rent, snapshot, 2026, month);
      expect(cost.status, `month ${month}`).toBe("due");
      expect(cost.dueBase, `month ${month}`).toBeCloseTo(10, 6);
    }
  });

  it("reports the day only when one is set", () => {
    expect(activityMonthCost(rent, snapshot, 2026, 5).datesKnown).toBe(false);
    const dated = { ...rent, dayOfMonth: 15 };
    const withDay = activityMonthCost(dated, snapshotWith([dated]), 2026, 5);
    expect(withDay.datesKnown).toBe(true);
    expect(withDay.dueDates[0].getDate()).toBe(15);
  });
});

describe("a session pack", () => {
  /** €20 a session, twice a week, settled every ten sessions, from 1 Aug. */
  const gym = activity({
    name: "Gym",
    costModel: "sessionPack",
    pricePerSession: 20,
    sessionsPerPeriod: 2,
    sessionPeriod: "week",
    sessionsPerPayment: 10,
    nextRenewalDate: "2026-08-01",
  });
  const snapshot = snapshotWith([gym]);

  it("charges whole payments, not one per session", () => {
    const august = activityMonthCost(gym, snapshot, 2026, 8);
    expect(august.status).toBe("due");
    // 1 August and 5 September are 35 days apart, so August holds exactly one.
    expect(august.dueDates).toHaveLength(1);
    expect(august.dueBase).toBeCloseTo(200, 6);
  });

  it("keeps the monthly accrual separate from the payment", () => {
    const august = activityMonthCost(gym, snapshot, 2026, 8);
    // Two a week across a 31-day August is ~8.86 sessions at €20.
    expect(august.monthlyBase).toBeCloseTo((2 * 31) / 7 * 20, 4);
    // Which is not the same number as the payment that actually fell.
    expect(august.monthlyBase).not.toBeCloseTo(august.dueBase!, 2);
  });

  it("is unknown, not zero, without a first-payment date", () => {
    const floating = { ...gym, nextRenewalDate: undefined, startDate: undefined };
    const cost = activityMonthCost(floating, snapshotWith([floating]), 2026, 8);
    expect(cost.status).toBe("unknown");
    expect(cost.dueBase).toBeNull();
  });
});

describe("a real weekday schedule", () => {
  const padel = activity({
    name: "Padel",
    costModel: "schedule",
    pricePerSession: 30,
    weekdays: [1, 4],
  });
  const snapshot = snapshotWith([padel]);

  it("charges the occurrences that truly fall in the month", () => {
    // August 2026 holds nine Mondays and Thursdays.
    const august = activityMonthCost(padel, snapshot, 2026, 8);
    expect(august.status).toBe("due");
    expect(august.dueDates).toHaveLength(9);
    expect(august.dueBase).toBeCloseTo(270, 6);
  });

  it("sums twelve real months for the year, never one month times twelve", () => {
    const august = activityMonthCost(padel, snapshot, 2026, 8);
    expect(august.yearlyBase).not.toBeCloseTo(august.monthlyBase * 12, 2);
    expect(august.yearlyBase).toBeCloseTo(3150, 6);
  });
});

describe("a one-off purchase", () => {
  it("belongs to the month it happens in, and to none until a date is given", () => {
    const dated = activity({
      name: "PC maintenance",
      recurrenceType: "purchase",
      pricePerPurchase: 35,
      startDate: "2026-06-10",
    });
    const undated = activity({ name: "Someday", recurrenceType: "purchase", pricePerPurchase: 35 });
    const snapshot = snapshotWith([dated, undated]);

    expect(activityMonthCost(dated, snapshot, 2026, 6).dueBase).toBeCloseTo(35, 6);
    expect(activityMonthCost(dated, snapshot, 2026, 7).dueBase).toBe(0);
    expect(activityMonthCost(undated, snapshot, 2026, 6).status).toBe("unknown");
  });
});

describe("deactivated activities", () => {
  it("cost nothing and require nothing", () => {
    const paused = { ...navigraph, id: "act-paused", active: false };
    const snapshot = snapshotWith([paused]);
    const september = activityMonthCost(paused, snapshot, 2026, 9);
    expect(september.monthlyBase).toBe(0);
    expect(september.yearlyBase).toBe(0);
    expect(september.dueBase).toBe(0);
  });

  it("are left out of the summary entirely, and counted so the panel can say so", () => {
    const snapshot = snapshotWith([{ ...navigraph, id: "a" }, { ...navigraph, id: "b", active: false }]);
    const summary = activityBudgetSummary(snapshot, 2026, 9);
    expect(summary.items).toHaveLength(1);
    expect(summary.inactiveCount).toBe(1);
    expect(summary.requiredThisMonth.gross).toBeCloseTo(81.64, 6);
  });
});

describe("the funding split", () => {
  const mine = activity({ name: "Mine", costModel: "fixed", pricePerMonth: 100 });
  const dads = activity({ name: "Lessons", costModel: "fixed", pricePerMonth: 200, fundingSource: "other", fundedBy: "Dad" });
  const elsewhere = activity({ name: "Business", costModel: "fixed", pricePerMonth: 50, fundingSource: "outside" });
  const snapshot = snapshotWith([mine, dads, elsewhere]);

  it("keeps the three kinds apart and sums them into the gross", () => {
    const summary = activityBudgetSummary(snapshot, 2026, 5);
    expect(summary.monthly.personal).toBeCloseTo(100, 6);
    expect(summary.monthly.other).toBeCloseTo(200, 6);
    expect(summary.monthly.outside).toBeCloseTo(50, 6);
    expect(summary.monthly.gross).toBeCloseTo(350, 6);
  });

  it("splits the month's requirement the same three ways", () => {
    const summary = activityBudgetSummary(snapshot, 2026, 5);
    expect(summary.requiredThisMonth.personal).toBeCloseTo(100, 6);
    expect(summary.requiredThisMonth.other).toBeCloseTo(200, 6);
    expect(summary.requiredThisMonth.outside).toBeCloseTo(50, 6);
  });

  it("produces shares that add up to a hundred", () => {
    const shares = fundingShares(activityBudgetSummary(snapshot, 2026, 5).yearly);
    expect(shares.personal! + shares.other! + shares.outside!).toBeCloseTo(100, 6);
    expect(shares.personal).toBeCloseTo((100 / 350) * 100, 6);
  });

  it("reports no share at all when there is nothing to divide", () => {
    const shares = fundingShares({ personal: 0, other: 0, outside: 0, gross: 0 });
    // A share of nothing is undefined, not 0%.
    expect(shares.personal).toBeNull();
  });

  it("changes every derived figure when the funding changes", () => {
    const switched = { ...dads, fundingSource: "personal" as FundingKind };
    const before = activityBudgetSummary(snapshot, 2026, 5);
    const after = activityBudgetSummary(snapshotWith([mine, switched, elsewhere]), 2026, 5);
    expect(before.monthly.personal).toBeCloseTo(100, 6);
    expect(after.monthly.personal).toBeCloseTo(300, 6);
    expect(after.monthly.other).toBe(0);
    // The gross is unchanged: who pays does not alter what it costs.
    expect(after.monthly.gross).toBeCloseTo(before.monthly.gross, 6);
  });
});

describe("per-activity shares", () => {
  it("ranks by yearly cost and divides the gross yearly total", () => {
    const a = activity({ name: "A", costModel: "fixed", pricePerMonth: 50 }); // 600/yr
    const b = activity({ name: "B", costModel: "fixed", pricePerMonth: 100 }); // 1200/yr
    const summary = activityBudgetSummary(snapshotWith([a, b]), 2026, 5);
    expect(summary.shares[0].activity.name).toBe("B");
    expect(summary.shares[0].share).toBeCloseTo((1200 / 1800) * 100, 6);
    expect(summary.shares.reduce((total, share) => total + (share.share ?? 0), 0)).toBeCloseTo(100, 6);
  });
});

describe("the year boundary", () => {
  it("places a December renewal in December and a January one in January", () => {
    const december = activity({
      name: "December",
      costModel: "fixedYearly",
      yearlyEstimate: 90,
      nextRenewalDate: "2026-12-31",
    });
    const january = activity({
      name: "January",
      costModel: "fixedYearly",
      yearlyEstimate: 90,
      nextRenewalDate: "2027-01-01",
    });
    const snapshot = snapshotWith([december, january], 2026);

    expect(activityMonthCost(december, snapshot, 2026, 12).dueBase).toBeCloseTo(90, 6);
    expect(activityMonthCost(january, snapshot, 2026, 12).status).toBe("not-due");
    // And the January one lands the following month, in the next year.
    expect(activityMonthCost(january, snapshot, 2027, 1).dueBase).toBeCloseTo(90, 6);
  });
});

/**
 * "Share of the yearly total" is a question about the user's own money
 * ====================================================================
 *
 * The bug this suite exists to prevent: an activity a parent pays for was
 * listed in "share of the yearly total" alongside the user's own, taking a
 * percentage of a whole it contributes nothing to. A €1,200 subscription
 * somebody else funds made the user's own €600 gym look like a third of their
 * year rather than all of it.
 *
 * Both halves have to move together — the list *and* the denominator. Filtering
 * the list while dividing by the gross is the same error wearing a different
 * hat: the bars stop summing to 100% and nothing on screen says why.
 */
describe("share of the yearly total", () => {
  const mine = activity({ name: "Gym", costModel: "fixedYearly", yearlyEstimate: 600, nextRenewalDate: "2026-03-01" });
  const dads = activity({
    name: "Navigraph",
    costModel: "fixedYearly",
    yearlyEstimate: 1200,
    nextRenewalDate: "2026-09-14",
    fundingSource: "other",
    fundedBy: "Dad",
  });
  const elsewhere = activity({
    name: "Business phone",
    costModel: "fixedYearly",
    yearlyEstimate: 300,
    nextRenewalDate: "2026-05-01",
    fundingSource: "outside",
  });

  it("lists only the activities the user actually pays for", () => {
    const summary = activityBudgetSummary(snapshotWith([mine, dads, elsewhere]), 2026, 8);
    expect(summary.shares.map((share) => share.activity.name)).toEqual(["Gym"]);
  });

  it("divides by the personal total, not the gross", () => {
    const summary = activityBudgetSummary(snapshotWith([mine, dads, elsewhere]), 2026, 8);
    // 600 of 600, not 600 of 2,100.
    expect(summary.shares[0].share).toBeCloseTo(100, 6);
  });

  it("still sums to 100% across several personal activities", () => {
    const second = activity({ name: "Arabic", costModel: "fixedYearly", yearlyEstimate: 200, nextRenewalDate: "2026-04-01" });
    const summary = activityBudgetSummary(snapshotWith([mine, second, dads]), 2026, 8);
    const total = summary.shares.reduce((sum, share) => sum + (share.share ?? 0), 0);
    expect(total).toBeCloseTo(100, 6);
    expect(summary.shares.map((share) => share.activity.name)).toEqual(["Gym", "Arabic"]);
  });

  it("reports how many were left out, so the omission is visible", () => {
    const summary = activityBudgetSummary(snapshotWith([mine, dads, elsewhere]), 2026, 8);
    expect(summary.externallyFundedCount).toBe(2);
  });

  it("has no share at all when every activity is funded by somebody else", () => {
    const summary = activityBudgetSummary(snapshotWith([dads, elsewhere]), 2026, 8);
    expect(summary.shares).toEqual([]);
    expect(summary.externallyFundedCount).toBe(2);
    // And the gross totals still carry them: they are excluded from the
    // *share*, not from the record.
    expect(summary.yearly.gross).toBeCloseTo(1500, 6);
    expect(summary.yearly.personal).toBe(0);
  });

  it("keeps the three-way funding split reading the gross", () => {
    // The split answers "who paid", so its whole is everything. Only the
    // share-of-my-year chart narrows to the personal total.
    const summary = activityBudgetSummary(snapshotWith([mine, dads, elsewhere]), 2026, 8);
    const split = fundingShares(summary.yearly);
    expect(split.personal).toBeCloseTo((600 / 2100) * 100, 6);
    expect(split.other).toBeCloseTo((1200 / 2100) * 100, 6);
    expect(split.outside).toBeCloseTo((300 / 2100) * 100, 6);
  });
});
