/**
 * Payment cycles: sessions are not payments, and a year is not a month.
 *
 * Every case below is one of the specification's own worked examples, checked
 * rather than assumed. The two errors these guard against are the ones that
 * would silently multiply somebody's budget:
 *
 *   - treating "two sessions a week" as "two payments a week", and
 *   - treating "€60 a year" as "€60 a month".
 */
import { describe, expect, it } from "vitest";
import {
  describeDays,
  describePaymentCycle,
  fixedYearlyAmount,
  isAveragedMonthly,
  normalizeSessionsPerPayment,
  paymentBaseline,
  paymentsBetween,
  sessionPackIntervalDays,
  sessionPackPaymentAmount,
  sessionPackPaymentDates,
  sessionsInMonth,
  sessionsInYear,
  sessionsPerWeek,
  yearlyPaymentDates,
} from "../src/domain/payments";
import { monthlyEstimateNative, yearlyEstimateNative } from "../src/domain/calculations";
import { upcomingSchedule } from "../src/domain/upcoming";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import type { Activity, BudgetSnapshot } from "../src/domain/types";
import { t } from "./lib/english";

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "act-test",
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

/** The brief's gym: €20 a session, twice a week, settled every ten sessions. */
const gym = activity({
  name: "Gym",
  costModel: "sessionPack",
  pricePerSession: 20,
  sessionsPerPeriod: 2,
  sessionPeriod: "week",
  sessionsPerPayment: 10,
  nextRenewalDate: "2026-09-01",
});

/** The brief's Nebula: €60 a year, renewing on 14 September. */
const nebula = activity({
  name: "Nebula",
  recurrenceType: "yearly",
  costModel: "fixedYearly",
  yearlyEstimate: 60,
  nextRenewalDate: "2026-09-14",
});

describe("session frequency is not payment frequency", () => {
  it("derives two sessions a week from the stated rate", () => {
    expect(sessionsPerWeek(gym)).toBe(2);
  });

  it("prices one payment at ten sessions, not one and not two", () => {
    expect(sessionPackPaymentAmount(gym)).toBe(200);
  });

  it("puts five weeks between payments, not half a week", () => {
    expect(sessionPackIntervalDays(gym)).toBe(35);
    expect(describeDays(35, t)).toBe("5 weeks");
  });

  it("counts the month's real sessions rather than a notional four weeks", () => {
    // August has 31 days: 2 × 31 / 7 sessions.
    expect(sessionsInMonth(gym, 2026, 8)).toBeCloseTo((2 * 31) / 7, 10);
    // February is shorter and costs less, which four-weeks-a-month hides.
    expect(sessionsInMonth(gym, 2026, 2)).toBeCloseTo((2 * 28) / 7, 10);
  });

  it("accrues the pack month by month rather than charging it when it is paid", () => {
    // The budget compares monthly commitments, so the monthly figure is the
    // sessions that fall in the month — not €200 in the month a payment lands
    // and €0 in the others.
    expect(monthlyEstimateNative(gym, { year: 2026, month: 8 })).toBeCloseTo((20 * 2 * 31) / 7, 6);
  });

  it("sums twelve real months to the year", () => {
    let total = 0;
    for (let month = 1; month <= 12; month += 1) {
      total += monthlyEstimateNative(gym, { year: 2026, month });
    }
    expect(total).toBeCloseTo(yearlyEstimateNative(gym, undefined, { year: 2026, month: 1 }), 6);
    expect(sessionsInYear(gym, 2026)).toBeCloseTo((2 * 365) / 7, 10);
  });

  it("says out loud that the sessions and the payments are counted separately", () => {
    expect(describePaymentCycle(gym, t)).toBe("2 / week · pay every 10 sessions (≈ every 5 weeks)");
  });

  it("produces one payment every five weeks from the baseline, not one per session", () => {
    const dates = sessionPackPaymentDates(gym, new Date(2026, 7, 21), 3);
    expect(dates.map((d) => d.toDateString())).toEqual([
      new Date(2026, 8, 1).toDateString(),
      new Date(2026, 9, 6).toDateString(),
      new Date(2026, 10, 10).toDateString(),
    ]);
  });

  it("advances a baseline already in the past instead of ignoring it", () => {
    const past = { ...gym, nextRenewalDate: "2026-01-01" };
    const [next] = sessionPackPaymentDates(past, new Date(2026, 7, 21), 1);
    // 2026-01-01 plus whole 35-day steps, first one on or after 21 August.
    expect(next.getTime()).toBeGreaterThanOrEqual(new Date(2026, 7, 21).getTime());
    const daysSinceBaseline = Math.round((next.getTime() - new Date(2026, 0, 1).getTime()) / 86_400_000);
    expect(daysSinceBaseline % 35).toBe(0);
  });

  it("states no dates at all when there is no baseline to count from", () => {
    // Never "today plus five weeks": a date nobody entered is not a date.
    const undated = { ...gym, nextRenewalDate: undefined, startDate: undefined };
    expect(paymentBaseline(undated)).toBeNull();
    expect(sessionPackPaymentDates(undated, new Date(2026, 7, 21), 3)).toEqual([]);
  });

  it("refuses a pack size that is not a whole count of at least one", () => {
    expect(normalizeSessionsPerPayment(0)).toBeNull();
    expect(normalizeSessionsPerPayment(-3)).toBeNull();
    expect(normalizeSessionsPerPayment(null)).toBeNull();
    expect(normalizeSessionsPerPayment(10)).toBe(10);
  });

  it("leaves the amount unknown rather than calling it zero", () => {
    expect(sessionPackPaymentAmount({ ...gym, pricePerSession: null })).toBeNull();
    expect(sessionPackPaymentAmount({ ...gym, sessionsPerPayment: null })).toBeNull();
  });

  it("prefers real weekdays over an averaged rate when both are present", () => {
    const scheduled = { ...gym, weekdays: [1, 4] as Activity["weekdays"] };
    expect(sessionsPerWeek(scheduled)).toBe(2);
    // Monday + Thursday in August 2026 is a real calendar count, not 8.86.
    expect(sessionsInMonth(scheduled, 2026, 8)).toBe(9);
  });
});

describe("a yearly charge is a yearly charge", () => {
  it("reports the stated annual amount as the year", () => {
    expect(fixedYearlyAmount(nebula)).toBe(60);
    expect(yearlyEstimateNative(nebula, undefined, { year: 2026, month: 8 })).toBe(60);
  });

  it("reports a twelfth as the month, and marks it as an average", () => {
    expect(monthlyEstimateNative(nebula, { year: 2026, month: 8 })).toBe(5);
    expect(isAveragedMonthly(nebula)).toBe(true);
  });

  it("uses the renewal date as the baseline, not 1 January or today plus a year", () => {
    const dates = yearlyPaymentDates(nebula, new Date(2026, 7, 21), 3);
    expect(dates.map((d) => d.toDateString())).toEqual([
      new Date(2026, 8, 14).toDateString(),
      new Date(2027, 8, 14).toDateString(),
      new Date(2028, 8, 14).toDateString(),
    ]);
  });

  it("follows the renewal date when the user changes it", () => {
    const moved = { ...nebula, nextRenewalDate: "2027-03-02" };
    expect(yearlyPaymentDates(moved, new Date(2026, 7, 21), 2).map((d) => d.toDateString())).toEqual([
      new Date(2027, 2, 2).toDateString(),
      new Date(2028, 2, 2).toDateString(),
    ]);
  });

  it("rolls a past renewal date forward whole years rather than dropping it", () => {
    const past = { ...nebula, nextRenewalDate: "2023-09-14" };
    expect(yearlyPaymentDates(past, new Date(2026, 7, 21), 1)[0].toDateString()).toBe(
      new Date(2026, 8, 14).toDateString(),
    );
  });

  it("clamps 29 February to the 28th in a common year instead of rolling into March", () => {
    const leap = { ...nebula, nextRenewalDate: "2024-02-29" };
    expect(yearlyPaymentDates(leap, new Date(2026, 0, 1), 1)[0].toDateString()).toBe(
      new Date(2026, 1, 28).toDateString(),
    );
  });

  it("states no date at all when no renewal date has been given", () => {
    const undated = { ...nebula, nextRenewalDate: undefined };
    expect(yearlyPaymentDates(undated, new Date(2026, 7, 21), 3)).toEqual([]);
  });

  it("never produces a monthly payment event", () => {
    // A whole year of the timeline: twelve monthly charges would show up here.
    const payments = paymentsBetween(nebula, new Date(2026, 7, 21), new Date(2027, 7, 21));
    expect(payments).not.toBeNull();
    expect(payments!.map((p) => p.date.toDateString())).toEqual([new Date(2026, 8, 14).toDateString()]);
    expect(payments![0].amountNative).toBe(60);
  });

  it("leaves every other cost model to the recurrence rule", () => {
    expect(paymentsBetween(activity({ costModel: "fixed" }), new Date(), new Date())).toBeNull();
    expect(paymentsBetween(activity(), new Date(), new Date())).toBeNull();
  });
});

describe("the dashboard timeline", () => {
  function snapshotWith(activities: Activity[]): BudgetSnapshot {
    const snapshot = createSeedBudgetSnapshot();
    const year = String(snapshot.settings.selectedYear);
    const categoryId = snapshot.categories[0].id;
    snapshot.years[year] = {
      ...snapshot.years[year],
      activities: activities.map((item) => ({ ...item, categoryId })),
    };
    return snapshot;
  }

  const from = new Date(2026, 7, 21);

  it("shows nothing for an annual charge that is not due in the window", () => {
    const snapshot = snapshotWith([nebula]);
    snapshot.settings.selectedYear = 2026;
    const { occurrences, undated } = upcomingSchedule(snapshot, t, from, 14);
    expect(occurrences).toEqual([]);
    // Not "undated" either: it has a date, and it is simply not due yet.
    expect(undated).toEqual([]);
  });

  it("shows one €60 charge — and only one — when the window reaches it", () => {
    const snapshot = snapshotWith([nebula]);
    snapshot.settings.selectedYear = 2026;
    const { occurrences } = upcomingSchedule(snapshot, t, from, 40);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].amountNative).toBe(60);
    expect(occurrences[0].kind).toBe("payment");
    expect(occurrences[0].date.toDateString()).toBe(new Date(2026, 8, 14).toDateString());
  });

  it("shows one €200 gym payment in a fortnight, not four €20 sessions", () => {
    const snapshot = snapshotWith([gym]);
    snapshot.settings.selectedYear = 2026;
    const { occurrences } = upcomingSchedule(snapshot, t, from, 14);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].amountNative).toBe(200);
    expect(occurrences[0].sessions).toBe(10);
    expect(occurrences[0].kind).toBe("payment");
  });

  it("lists a payment-cycle activity as undated only when it has no baseline", () => {
    const snapshot = snapshotWith([{ ...nebula, nextRenewalDate: undefined, startDate: undefined }]);
    snapshot.settings.selectedYear = 2026;
    const { occurrences, undated } = upcomingSchedule(snapshot, t, from, 40);
    expect(occurrences).toEqual([]);
    expect(undated).toHaveLength(1);
    // The figure offered is the monthly average, which the card labels as one.
    expect(undated[0].monthlyBase).toBeCloseTo(5, 6);
  });
});
