import { describe, expect, it } from "vitest";
import {
  daysInMonth,
  describeSchedule,
  hasSchedule,
  isoWeekdayOf,
  monthlyEstimateFromSchedule,
  nextOccurrences,
  normalizeWeekdays,
  occurrencesInMonth,
  occurrencesInYear,
  parseLocalDate,
  toLocalDateInput,
  yearlyEstimateFromSchedule,
} from "../src/domain/schedule";
import { estimateActivity, monthlyEstimateNative, yearlyEstimateNative } from "../src/domain/calculations";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import { activityPayloadFromDraft, activityToDraft, draftToActivity } from "../src/utils/formatters";
import type { Activity, IsoWeekday } from "../src/domain/types";

const NOW = new Date("2026-07-09T12:00:00+03:00");

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "act-test",
    name: "Test activity",
    categoryId: "cat-other",
    currency: "EUR",
    recurrenceType: "weekly",
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

/** Independent day-by-day count, so tests never lean on the code under test. */
function bruteForceWeekdayCount(year: number, month: number, weekdays: IsoWeekday[]): number {
  let count = 0;
  const last = new Date(year, month, 0).getDate();
  for (let day = 1; day <= last; day += 1) {
    const iso = new Date(year, month - 1, day).getDay() || 7;
    if (weekdays.includes(iso as IsoWeekday)) count += 1;
  }
  return count;
}

describe("calendar primitives", () => {
  it("counts days per month including leap years", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29); // leap year
    expect(daysInMonth(2100, 2)).toBe(28); // century, not a leap year
    expect(daysInMonth(2000, 2)).toBe(29); // divisible by 400, leap year
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("rejects impossible months", () => {
    expect(daysInMonth(2026, 0)).toBe(0);
    expect(daysInMonth(2026, 13)).toBe(0);
  });

  it("maps weekdays to ISO numbering with Sunday as 7", () => {
    expect(isoWeekdayOf(new Date(2026, 0, 5))).toBe(1); // Monday 5 Jan 2026
    expect(isoWeekdayOf(new Date(2026, 0, 10))).toBe(6);
    expect(isoWeekdayOf(new Date(2026, 0, 11))).toBe(7); // Sunday, not 0
  });

  it("parses YYYY-MM-DD in local time, not UTC", () => {
    const parsed = parseLocalDate("2026-03-01");
    expect(parsed).not.toBeNull();
    // A UTC parse would shift this to 28 February for anyone west of Greenwich.
    expect(parsed!.getFullYear()).toBe(2026);
    expect(parsed!.getMonth()).toBe(2);
    expect(parsed!.getDate()).toBe(1);
    expect(toLocalDateInput(parsed!)).toBe("2026-03-01");
  });

  it("refuses dates that do not exist", () => {
    expect(parseLocalDate("2026-02-30")).toBeNull();
    expect(parseLocalDate("2026-13-01")).toBeNull();
    expect(parseLocalDate("not a date")).toBeNull();
    expect(parseLocalDate("")).toBeNull();
    expect(parseLocalDate(undefined)).toBeNull();
  });

  it("normalises weekday lists", () => {
    expect(normalizeWeekdays([3, 1, 3] as IsoWeekday[])).toEqual([1, 3]);
    expect(normalizeWeekdays([0, 8] as unknown as IsoWeekday[])).toEqual([]);
    expect(normalizeWeekdays(undefined)).toEqual([]);
  });
});

describe("occurrencesInMonth — weekday schedules", () => {
  it("counts five Mondays in a month that really has five", () => {
    // March 2026 starts on a Sunday and has 31 days: Mondays fall on 2, 9, 16, 23, 30.
    const monday = activity({ weekdays: [1] });
    expect(occurrencesInMonth(monday, 2026, 3)).toBe(5);
    expect(occurrencesInMonth(monday, 2026, 3)).toBe(bruteForceWeekdayCount(2026, 3, [1]));
  });

  it("counts four Mondays in a month that only has four", () => {
    // February 2026 has 28 days starting on a Sunday: Mondays on 2, 9, 16, 23.
    const monday = activity({ weekdays: [1] });
    expect(occurrencesInMonth(monday, 2026, 2)).toBe(4);
  });

  it("never assumes four weeks per month across a whole year", () => {
    const monday = activity({ weekdays: [1] });
    const counts = Array.from({ length: 12 }, (_, index) => occurrencesInMonth(monday, 2026, index + 1));
    // March, June, August, and November 2026 each hold five Mondays.
    expect(counts).toEqual([4, 4, 5, 4, 4, 5, 4, 5, 4, 4, 5, 4]);
    expect(counts).toEqual(Array.from({ length: 12 }, (_, index) => bruteForceWeekdayCount(2026, index + 1, [1])));
    // 2026 holds 52 Mondays; a "four weeks a month" model would claim 48.
    expect(counts.reduce((total, value) => total + value, 0)).toBe(52);
    expect(occurrencesInYear(monday, 2026)).toBe(52);
  });

  it("handles February in a leap year", () => {
    const saturday = activity({ weekdays: [6] });
    // February 2024 has 29 days and starts on a Thursday: Saturdays on 3, 10, 17, 24.
    expect(occurrencesInMonth(saturday, 2024, 2)).toBe(4);
    const thursday = activity({ weekdays: [4] });
    // The extra leap day is a Thursday, giving a fifth one.
    expect(occurrencesInMonth(thursday, 2024, 2)).toBe(5);
    expect(occurrencesInMonth(thursday, 2024, 2)).toBe(bruteForceWeekdayCount(2024, 2, [4]));
  });

  it("counts several weekdays together", () => {
    const monWed = activity({ weekdays: [1, 3] });
    expect(occurrencesInMonth(monWed, 2026, 3)).toBe(bruteForceWeekdayCount(2026, 3, [1, 3]));
    expect(occurrencesInMonth(monWed, 2026, 3)).toBe(9);
  });

  it("counts every day when all seven weekdays are selected", () => {
    const daily = activity({ weekdays: [1, 2, 3, 4, 5, 6, 7] });
    expect(occurrencesInMonth(daily, 2026, 1)).toBe(31);
    expect(occurrencesInMonth(daily, 2024, 2)).toBe(29);
  });

  it("returns zero without a schedule", () => {
    expect(occurrencesInMonth(activity(), 2026, 3)).toBe(0);
    expect(hasSchedule(activity())).toBe(false);
  });

  it("guards against impossible month numbers", () => {
    const monday = activity({ weekdays: [1] });
    expect(occurrencesInMonth(monday, 2026, 0)).toBe(0);
    expect(occurrencesInMonth(monday, 2026, 13)).toBe(0);
  });
});

describe("occurrencesInMonth — startDate clipping", () => {
  it("ignores months before the schedule begins", () => {
    const item = activity({ weekdays: [1], startDate: "2026-03-10" });
    expect(occurrencesInMonth(item, 2026, 2)).toBe(0);
    expect(occurrencesInMonth(item, 2025, 12)).toBe(0);
  });

  it("counts only from the start date within the starting month", () => {
    // March 2026 Mondays: 2, 9, 16, 23, 30. Starting on the 10th leaves 16, 23, 30.
    const item = activity({ weekdays: [1], startDate: "2026-03-10" });
    expect(occurrencesInMonth(item, 2026, 3)).toBe(3);
    // Starting exactly on a Monday keeps that Monday.
    expect(occurrencesInMonth(activity({ weekdays: [1], startDate: "2026-03-09" }), 2026, 3)).toBe(4);
  });

  it("counts the full month once the schedule is running", () => {
    const item = activity({ weekdays: [1], startDate: "2026-03-10" });
    expect(occurrencesInMonth(item, 2026, 4)).toBe(bruteForceWeekdayCount(2026, 4, [1]));
  });

  it("skips a day-of-month occurrence that precedes the start date", () => {
    const item = activity({ dayOfMonth: 5, startDate: "2026-03-10" });
    expect(occurrencesInMonth(item, 2026, 3)).toBe(0);
    expect(occurrencesInMonth(item, 2026, 4)).toBe(1);
  });
});

describe("occurrencesInMonth — day-of-month schedules", () => {
  it("returns one when the day exists", () => {
    const item = activity({ dayOfMonth: 15 });
    expect(occurrencesInMonth(item, 2026, 1)).toBe(1);
    expect(occurrencesInMonth(item, 2026, 2)).toBe(1);
  });

  it("returns zero for a day the month does not have", () => {
    const item = activity({ dayOfMonth: 31 });
    expect(occurrencesInMonth(item, 2026, 1)).toBe(1); // January has 31 days
    expect(occurrencesInMonth(item, 2026, 2)).toBe(0); // February never does
    expect(occurrencesInMonth(item, 2026, 4)).toBe(0); // April has 30
    expect(occurrencesInYear(item, 2026)).toBe(7); // seven 31-day months
  });

  it("handles 29 February across leap and common years", () => {
    const item = activity({ dayOfMonth: 29 });
    expect(occurrencesInMonth(item, 2024, 2)).toBe(1);
    expect(occurrencesInMonth(item, 2026, 2)).toBe(0);
  });

  it("ignores nonsense day numbers", () => {
    expect(occurrencesInMonth(activity({ dayOfMonth: 0 }), 2026, 1)).toBe(0);
    expect(occurrencesInMonth(activity({ dayOfMonth: 32 }), 2026, 1)).toBe(0);
    expect(occurrencesInMonth(activity({ dayOfMonth: 1.5 }), 2026, 1)).toBe(0);
  });

  it("lets weekdays win when both rules are present", () => {
    const item = activity({ weekdays: [1], dayOfMonth: 15 });
    expect(occurrencesInMonth(item, 2026, 3)).toBe(5);
  });
});

describe("nextOccurrences", () => {
  it("lists upcoming weekday dates in chronological order", () => {
    const item = activity({ weekdays: [1, 3] }); // Mondays and Wednesdays
    const dates = nextOccurrences(item, new Date(2026, 2, 1), 4); // Sunday 1 March 2026
    expect(dates.map(toLocalDateInput)).toEqual(["2026-03-02", "2026-03-04", "2026-03-09", "2026-03-11"]);
    for (let index = 1; index < dates.length; index += 1) {
      expect(dates[index].getTime()).toBeGreaterThan(dates[index - 1].getTime());
    }
  });

  it("includes the from-date when it is itself an occurrence", () => {
    const item = activity({ weekdays: [1] });
    const [first] = nextOccurrences(item, new Date(2026, 2, 2), 1); // Monday
    expect(toLocalDateInput(first)).toBe("2026-03-02");
  });

  it("crosses a month boundary", () => {
    const item = activity({ weekdays: [1] });
    const dates = nextOccurrences(item, new Date(2026, 2, 24), 3);
    expect(dates.map(toLocalDateInput)).toEqual(["2026-03-30", "2026-04-06", "2026-04-13"]);
  });

  it("crosses a year boundary", () => {
    const item = activity({ weekdays: [4] }); // Thursdays
    const dates = nextOccurrences(item, new Date(2026, 11, 28), 3);
    expect(dates.map(toLocalDateInput)).toEqual(["2026-12-31", "2027-01-07", "2027-01-14"]);
  });

  it("skips months without the requested day", () => {
    const item = activity({ dayOfMonth: 31 });
    const dates = nextOccurrences(item, new Date(2026, 0, 1), 4);
    expect(dates.map(toLocalDateInput)).toEqual(["2026-01-31", "2026-03-31", "2026-05-31", "2026-07-31"]);
  });

  it("waits for the start date", () => {
    const item = activity({ weekdays: [1], startDate: "2026-04-01" });
    const dates = nextOccurrences(item, new Date(2026, 0, 1), 2);
    expect(dates.map(toLocalDateInput)).toEqual(["2026-04-06", "2026-04-13"]);
  });

  it("returns nothing without a schedule or a positive count", () => {
    expect(nextOccurrences(activity(), new Date(2026, 0, 1), 3)).toEqual([]);
    expect(nextOccurrences(activity({ weekdays: [1] }), new Date(2026, 0, 1), 0)).toEqual([]);
    expect(nextOccurrences(activity({ weekdays: [1] }), new Date(2026, 0, 1), -5)).toEqual([]);
    expect(nextOccurrences(activity({ weekdays: [1] }), new Date("nonsense"), 3)).toEqual([]);
  });

  it("describes a schedule in words", () => {
    expect(describeSchedule(activity({ weekdays: [1, 3] }))).toBe("Mon, Wed");
    expect(describeSchedule(activity({ dayOfMonth: 15 }))).toBe("Day 15 monthly");
    expect(describeSchedule(activity())).toBe("No schedule set");
  });
});

describe("monthlyEstimateFromSchedule", () => {
  it("prices real occurrences per month", () => {
    const item = activity({ weekdays: [1], pricePerSession: 30 });
    expect(monthlyEstimateFromSchedule(item, 2026, 3)).toBe(150); // five Mondays
    expect(monthlyEstimateFromSchedule(item, 2026, 2)).toBe(120); // four Mondays
  });

  it("falls back to the estimated cost when no session price exists", () => {
    const item = activity({ weekdays: [1], estimatedCost: 10 });
    expect(monthlyEstimateFromSchedule(item, 2026, 2)).toBe(40);
  });

  it("returns null rather than zero when it cannot be derived", () => {
    expect(monthlyEstimateFromSchedule(activity({ pricePerSession: 30 }), 2026, 3)).toBeNull();
    expect(monthlyEstimateFromSchedule(activity({ weekdays: [1] }), 2026, 3)).toBeNull();
  });

  it("treats a zero price as a real value", () => {
    const item = activity({ weekdays: [1], pricePerSession: 0 });
    expect(monthlyEstimateFromSchedule(item, 2026, 3)).toBe(0);
  });

  it("sums twelve real months for the year", () => {
    const item = activity({ weekdays: [1], pricePerSession: 30 });
    expect(yearlyEstimateFromSchedule(item, 2026)).toBe(52 * 30);
    // A month × 12 model would have said 150 × 12 = 1800, over by 240.
    expect(yearlyEstimateFromSchedule(item, 2026)).not.toBe(monthlyEstimateFromSchedule(item, 2026, 3)! * 12);
  });

  it("returns null for a yearly estimate it cannot derive", () => {
    expect(yearlyEstimateFromSchedule(activity({ weekdays: [1] }), 2026)).toBeNull();
    expect(yearlyEstimateFromSchedule(activity({ pricePerSession: 5 }), 2026)).toBeNull();
  });
});

describe("cost models", () => {
  const period = { year: 2026, month: 3 };

  it("perSession multiplies the session price by sessions per month", () => {
    const item = activity({ costModel: "perSession", pricePerSession: 30, sessionsPerMonth: 8 });
    expect(monthlyEstimateNative(item, period)).toBe(240);
    expect(yearlyEstimateNative(item, monthlyEstimateNative(item, period), period)).toBe(2880);
  });

  it("perSession is zero when either side is missing", () => {
    expect(monthlyEstimateNative(activity({ costModel: "perSession", pricePerSession: 30 }), period)).toBe(0);
    expect(monthlyEstimateNative(activity({ costModel: "perSession", sessionsPerMonth: 8 }), period)).toBe(0);
  });

  it("schedule prices the actual month and sums the real year", () => {
    const item = activity({ costModel: "schedule", weekdays: [1], pricePerSession: 30 });
    expect(monthlyEstimateNative(item, { year: 2026, month: 3 })).toBe(150);
    expect(monthlyEstimateNative(item, { year: 2026, month: 2 })).toBe(120);
    const yearly = yearlyEstimateNative(item, monthlyEstimateNative(item, period), period);
    expect(yearly).toBe(1560);
    expect(yearly).not.toBe(150 * 12);
  });

  it("schedule ignores an explicit yearly estimate — the calendar is the source of truth", () => {
    const item = activity({ costModel: "schedule", weekdays: [1], pricePerSession: 30, yearlyEstimate: 99999 });
    expect(yearlyEstimateNative(item, monthlyEstimateNative(item, period), period)).toBe(1560);
  });

  it("fixed uses the monthly amount", () => {
    const item = activity({ costModel: "fixed", pricePerMonth: 42, pricePerSession: 999 });
    expect(monthlyEstimateNative(item, period)).toBe(42);
    expect(yearlyEstimateNative(item, monthlyEstimateNative(item, period), period)).toBe(504);
  });

  it("keeps zero as a real monthly amount", () => {
    const item = activity({ costModel: "fixed", pricePerMonth: 0 });
    expect(monthlyEstimateNative(item, period)).toBe(0);
  });

  it("returns nothing for an inactive activity whatever the model", () => {
    for (const costModel of ["auto", "perSession", "schedule", "fixed"] as const) {
      const item = activity({ costModel, active: false, pricePerMonth: 50, pricePerSession: 50, sessionsPerMonth: 4, weekdays: [1] });
      expect(monthlyEstimateNative(item, period)).toBe(0);
      expect(yearlyEstimateNative(item, 0, period)).toBe(0);
    }
  });
});

describe("legacy activities stay byte-identical", () => {
  const period = { year: 2026, month: 3 };

  /** The exact pre-cost-model implementation, kept as a regression oracle. */
  function legacyMonthly(item: Activity): number {
    if (!item.active) return 0;
    if (item.pricePerMonth != null) return item.pricePerMonth;
    switch (item.recurrenceType) {
      case "weekly":
        return (item.pricePerSession ?? item.estimatedCost ?? 0) * item.recurrenceInterval * 4;
      case "monthly":
        return (item.estimatedCost ?? item.pricePerPurchase ?? item.pricePerSession ?? 0) * item.recurrenceInterval;
      case "yearly":
        return (item.yearlyEstimate ?? item.estimatedCost ?? 0) / 12;
      case "session":
        return (item.pricePerSession ?? 0) * item.recurrenceInterval;
      case "custom":
        return item.estimatedCost ?? 0;
      default:
        return 0;
    }
  }

  function legacyYearly(item: Activity, monthly = legacyMonthly(item)): number {
    if (!item.active) return 0;
    if (item.yearlyEstimate != null) return item.yearlyEstimate;
    if (item.recurrenceType === "purchase") return item.pricePerPurchase ?? item.estimatedCost ?? 0;
    return monthly * 12;
  }

  const cases: Activity[] = [
    activity({ recurrenceType: "weekly", pricePerSession: 25, recurrenceInterval: 2 }),
    activity({ recurrenceType: "weekly", estimatedCost: 12 }),
    activity({ recurrenceType: "monthly", estimatedCost: 80, recurrenceInterval: 3 }),
    activity({ recurrenceType: "monthly", pricePerPurchase: 60 }),
    activity({ recurrenceType: "yearly", yearlyEstimate: 1200 }),
    activity({ recurrenceType: "yearly", estimatedCost: 600 }),
    activity({ recurrenceType: "session", pricePerSession: 15, recurrenceInterval: 6 }),
    activity({ recurrenceType: "custom", estimatedCost: 33 }),
    activity({ recurrenceType: "purchase", pricePerPurchase: 400 }),
    activity({ recurrenceType: "purchase", estimatedCost: 250 }),
    activity({ recurrenceType: "none" }),
    activity({ recurrenceType: "monthly", pricePerMonth: 0 }),
    activity({ recurrenceType: "monthly", pricePerMonth: 99.99 }),
    activity({ recurrenceType: "weekly", pricePerSession: 25, active: false }),
  ];

  it("reproduces the historical monthly and yearly numbers exactly", () => {
    for (const item of cases) {
      expect(monthlyEstimateNative(item, period)).toBe(legacyMonthly(item));
      expect(yearlyEstimateNative(item, monthlyEstimateNative(item, period), period)).toBe(legacyYearly(item));
    }
  });

  it("is unaffected by which month is being viewed", () => {
    for (const item of cases) {
      expect(monthlyEstimateNative(item, { year: 2026, month: 2 })).toBe(monthlyEstimateNative(item, { year: 2031, month: 11 }));
    }
  });

  it("ignores schedule fields while the cost model is automatic", () => {
    const item = activity({ recurrenceType: "weekly", pricePerSession: 25, weekdays: [1, 3], dayOfMonth: 15 });
    expect(monthlyEstimateNative(item, period)).toBe(100); // 25 × interval 1 × 4, exactly as before
  });
});

describe("estimateActivity", () => {
  it("prices a schedule against the selected month, not today", () => {
    const snapshot = createSeedBudgetSnapshot(NOW);
    snapshot.settings.baseCurrency = "EUR";
    const item = activity({ costModel: "schedule", weekdays: [1], pricePerSession: 30, currency: "EUR" });

    snapshot.settings.selectedYear = 2026;
    snapshot.settings.selectedMonth = 3;
    expect(estimateActivity(item, snapshot).monthlyBase).toBe(150);

    snapshot.settings.selectedMonth = 2;
    expect(estimateActivity(item, snapshot).monthlyBase).toBe(120);
  });

  it("accepts an explicit period override", () => {
    const snapshot = createSeedBudgetSnapshot(NOW);
    snapshot.settings.baseCurrency = "EUR";
    const item = activity({ costModel: "schedule", weekdays: [1], pricePerSession: 30, currency: "EUR" });
    expect(estimateActivity(item, snapshot, { year: 2026, month: 6 }).monthlyBase).toBe(150);
    expect(estimateActivity(item, snapshot, { year: 2026, month: 6 }).yearlyBase).toBe(1560);
  });
});

describe("activity drafts carry every field", () => {
  it("round-trips the new recurrence fields", () => {
    const snapshot = createSeedBudgetSnapshot(NOW);
    const source = activity({
      icon: "Volleyball",
      color: "#FF375F",
      costModel: "schedule",
      sessionsPerMonth: 8,
      weekdays: [3, 1],
      dayOfMonth: 15,
      startDate: "2026-03-10",
      pricePerPurchase: 120,
      yearlyEstimate: 600,
      visible: false,
      seasonalTag: "summer",
    });

    const draft = activityToDraft(source, snapshot);
    expect(draft.icon).toBe("Volleyball");
    expect(draft.color).toBe("#FF375F");
    expect(draft.costModel).toBe("schedule");
    expect(draft.sessionsPerMonth).toBe("8");
    expect(draft.weekdays).toEqual([1, 3]);
    expect(draft.dayOfMonth).toBe("15");
    expect(draft.startDate).toBe("2026-03-10");
    expect(draft.pricePerPurchase).toBe("120");
    expect(draft.yearlyEstimate).toBe("600");
    expect(draft.visible).toBe(false);
    expect(draft.seasonalTag).toBe("summer");

    const payload = activityPayloadFromDraft(draft);
    expect(payload.weekdays).toEqual([1, 3]);
    expect(payload.dayOfMonth).toBe(15);
    expect(payload.startDate).toBe("2026-03-10");
    expect(payload.pricePerPurchase).toBe(120);
    expect(payload.yearlyEstimate).toBe(600);
    expect(payload.costModel).toBe("schedule");
  });

  it("stores no cost model for automatic activities", () => {
    const snapshot = createSeedBudgetSnapshot(NOW);
    const draft = activityToDraft(null, snapshot);
    expect(draft.costModel).toBe("auto");
    expect(activityPayloadFromDraft(draft).costModel).toBeUndefined();
  });

  it("drops empty icon, colour, and schedule values instead of storing blanks", () => {
    const snapshot = createSeedBudgetSnapshot(NOW);
    const payload = activityPayloadFromDraft({ ...activityToDraft(null, snapshot), icon: "  ", color: "", startDate: "" });
    expect(payload.icon).toBeUndefined();
    expect(payload.color).toBeUndefined();
    expect(payload.weekdays).toBeUndefined();
    expect(payload.startDate).toBeUndefined();
  });

  it("rejects an out-of-range day of month", () => {
    const snapshot = createSeedBudgetSnapshot(NOW);
    const base = activityToDraft(null, snapshot);
    expect(activityPayloadFromDraft({ ...base, dayOfMonth: "0" }).dayOfMonth).toBeNull();
    expect(activityPayloadFromDraft({ ...base, dayOfMonth: "45" }).dayOfMonth).toBeNull();
    expect(activityPayloadFromDraft({ ...base, dayOfMonth: "28" }).dayOfMonth).toBe(28);
  });

  it("prices a draft through the same maths as a saved activity", () => {
    const snapshot = createSeedBudgetSnapshot(NOW);
    const draft = {
      ...activityToDraft(null, snapshot),
      name: "Padel",
      costModel: "perSession" as const,
      pricePerSession: "30",
      sessionsPerMonth: "8",
    };
    const preview = draftToActivity(draft);
    expect(monthlyEstimateNative(preview, { year: 2026, month: 3 })).toBe(240);
    expect(yearlyEstimateNative(preview, 240, { year: 2026, month: 3 })).toBe(2880);
  });
});
