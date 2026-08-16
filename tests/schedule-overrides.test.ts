/**
 * One-off exceptions to a recurring schedule.
 *
 * Real life does not follow the rule exactly: a week is skipped, a lesson moves,
 * an extra session happens, one occurrence costs something different. Editing
 * the rule to record any of those corrupts every other month it produces, so
 * exceptions override individual occurrences and leave the rule untouched.
 *
 * These tests exist because the app's totals are derived from the schedule. An
 * override that is honoured on the dashboard but ignored in the monthly total —
 * or vice versa — is a wrong number in a financial application.
 */

import { describe, expect, it } from "vitest";
import {
  monthlyEstimateFromSchedule,
  nextOccurrences,
  occurrenceDatesInMonth,
  occurrencesInMonth,
  toLocalDateInput,
  yearlyEstimateFromSchedule,
} from "../src/domain/schedule";
import type { Activity, ScheduleOverride } from "../src/domain/types";

/** March 2026: Sundays fall on the 1st, so the 2nd is a Monday. */
const YEAR = 2026;
const MONTH = 3;

function activity(partial: Partial<Activity> = {}): Activity {
  return {
    id: "act-1",
    name: "Lesson",
    categoryId: "cat-1",
    currency: "EUR",
    recurrenceType: "weekly",
    recurrenceInterval: 1,
    pricePerSession: 30,
    pricePerPurchase: null,
    pricePerMonth: null,
    estimatedCost: null,
    yearlyEstimate: null,
    active: true,
    visible: true,
    seasonalTag: "normal",
    order: 0,
    notes: "",
    costModel: "schedule",
    weekdays: [1], // Mondays
    ...partial,
  };
}

const dates = (act: Activity, year = YEAR, month = MONTH): string[] =>
  occurrenceDatesInMonth(act, year, month).map((o) => toLocalDateInput(o.date));

function override(partial: Partial<ScheduleOverride> & { kind: ScheduleOverride["kind"]; date: string }): ScheduleOverride {
  return { id: `ovr-${partial.date}-${partial.kind}`, ...partial };
}

describe("the rule alone", () => {
  it("produces every matching weekday in the month", () => {
    // Baseline: March 2026 has Mondays on the 2nd, 9th, 16th, 23rd and 30th.
    expect(dates(activity())).toEqual(["2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23", "2026-03-30"]);
    expect(occurrencesInMonth(activity(), YEAR, MONTH)).toBe(5);
  });

  it("prices the month as the sum of its occurrences", () => {
    expect(monthlyEstimateFromSchedule(activity(), YEAR, MONTH)).toBe(150);
  });
});

describe("skip", () => {
  it("removes exactly that occurrence", () => {
    const act = activity({ scheduleOverrides: [override({ kind: "skip", date: "2026-03-16" })] });
    expect(dates(act)).toEqual(["2026-03-02", "2026-03-09", "2026-03-23", "2026-03-30"]);
  });

  it("lowers the month's total by one occurrence, not by a guess", () => {
    const act = activity({ scheduleOverrides: [override({ kind: "skip", date: "2026-03-16" })] });
    expect(monthlyEstimateFromSchedule(act, YEAR, MONTH)).toBe(120);
  });

  it("leaves every other month untouched", () => {
    const act = activity({ scheduleOverrides: [override({ kind: "skip", date: "2026-03-16" })] });
    // The whole point of an exception: April is unaffected. Editing the rule to
    // record a skipped week would have changed all twelve months.
    expect(occurrencesInMonth(act, YEAR, 4)).toBe(occurrencesInMonth(activity(), YEAR, 4));
  });
});

describe("move", () => {
  it("puts the occurrence on its new date", () => {
    const act = activity({
      scheduleOverrides: [override({ kind: "move", date: "2026-03-16", movedTo: "2026-03-18" })],
    });
    expect(dates(act)).toEqual(["2026-03-02", "2026-03-09", "2026-03-18", "2026-03-23", "2026-03-30"]);
  });

  it("does not change the month's total when it stays inside the month", () => {
    const act = activity({
      scheduleOverrides: [override({ kind: "move", date: "2026-03-16", movedTo: "2026-03-18" })],
    });
    expect(monthlyEstimateFromSchedule(act, YEAR, MONTH)).toBe(150);
  });

  it("moves the cost with the occurrence when it crosses a month boundary", () => {
    const act = activity({
      scheduleOverrides: [override({ kind: "move", date: "2026-03-30", movedTo: "2026-04-01" })],
    });
    // It leaves March...
    expect(dates(act)).toEqual(["2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23"]);
    expect(monthlyEstimateFromSchedule(act, YEAR, 3)).toBe(120);
    // ...and arrives in April, rather than vanishing from the budget entirely.
    expect(dates(act, YEAR, 4)).toContain("2026-04-01");
  });

  it("treats a move with no destination as a skip", () => {
    const act = activity({ scheduleOverrides: [override({ kind: "move", date: "2026-03-16" })] });
    // The user said it does not happen then. Leaving it in place would be the
    // one outcome they explicitly ruled out.
    expect(dates(act)).not.toContain("2026-03-16");
    expect(dates(act)).toHaveLength(4);
  });
});

describe("extra", () => {
  it("adds an occurrence the rule never produces", () => {
    const act = activity({ scheduleOverrides: [override({ kind: "extra", date: "2026-03-11" })] });
    expect(dates(act)).toEqual([
      "2026-03-02", "2026-03-09", "2026-03-11", "2026-03-16", "2026-03-23", "2026-03-30",
    ]);
  });

  it("charges the rule's price unless the extra states its own", () => {
    const standard = activity({ scheduleOverrides: [override({ kind: "extra", date: "2026-03-11" })] });
    expect(monthlyEstimateFromSchedule(standard, YEAR, MONTH)).toBe(180);

    const priced = activity({
      scheduleOverrides: [override({ kind: "extra", date: "2026-03-11", amount: 45 })],
    });
    expect(monthlyEstimateFromSchedule(priced, YEAR, MONTH)).toBe(195);
  });
});

describe("price", () => {
  it("changes one occurrence without touching the others", () => {
    const act = activity({
      scheduleOverrides: [override({ kind: "price", date: "2026-03-16", amount: 50 })],
    });
    expect(dates(act)).toHaveLength(5);
    // Four at 30, one at 50.
    expect(monthlyEstimateFromSchedule(act, YEAR, MONTH)).toBe(170);
  });

  it("accepts zero, because a free session is a real fact", () => {
    const act = activity({
      scheduleOverrides: [override({ kind: "price", date: "2026-03-16", amount: 0 })],
    });
    expect(monthlyEstimateFromSchedule(act, YEAR, MONTH)).toBe(120);
    expect(occurrenceDatesInMonth(act, YEAR, MONTH).find((o) => toLocalDateInput(o.date) === "2026-03-16")!.price).toBe(0);
  });

  it("refuses to total a month containing an occurrence with no known price", () => {
    const act = activity({
      scheduleOverrides: [override({ kind: "price", date: "2026-03-16", amount: null })],
    });
    // A partial sum would understate the month while looking complete. Null
    // says the total is not known, which is the truth.
    expect(monthlyEstimateFromSchedule(act, YEAR, MONTH)).toBeNull();
  });
});

describe("everything else derives from the same source", () => {
  it("reflects overrides in the yearly estimate", () => {
    const plain = activity();
    const withSkip = activity({ scheduleOverrides: [override({ kind: "skip", date: "2026-03-16" })] });
    expect(yearlyEstimateFromSchedule(withSkip, YEAR)!).toBe(yearlyEstimateFromSchedule(plain, YEAR)! - 30);
  });

  it("reflects overrides in the dashboard timeline", () => {
    const act = activity({ scheduleOverrides: [override({ kind: "skip", date: "2026-03-09" })] });
    const upcoming = nextOccurrences(act, new Date(2026, 2, 3), 3).map(toLocalDateInput);
    // A skipped week must not appear on the timeline while being correctly
    // absent from the month's total — the two views read the same function.
    expect(upcoming).toEqual(["2026-03-16", "2026-03-23", "2026-03-30"]);
  });
});

describe("bad input", () => {
  it("ignores an override with an unusable date", () => {
    const act = activity({
      scheduleOverrides: [
        override({ kind: "skip", date: "not-a-date" }),
        override({ kind: "skip", date: "2026-03-16" }),
      ],
    });
    // The valid one still applies. One malformed entry must not disable the
    // whole activity's schedule.
    expect(dates(act)).toHaveLength(4);
  });

  it("ignores overrides on an activity with no schedule", () => {
    const act = activity({
      weekdays: undefined,
      dayOfMonth: null,
      scheduleOverrides: [override({ kind: "extra", date: "2026-03-11" })],
    });
    // An exception to a rule that does not exist is not a schedule. Honouring
    // it would give an unscheduled activity a phantom occurrence.
    expect(dates(act)).toEqual([]);
    expect(monthlyEstimateFromSchedule(act, YEAR, MONTH)).toBeNull();
  });

  it("lets the last override win when two target the same date", () => {
    const act = activity({
      scheduleOverrides: [
        { id: "a", kind: "price", date: "2026-03-16", amount: 40 },
        { id: "b", kind: "skip", date: "2026-03-16" },
      ],
    });
    // Deterministic beats an ambiguous combination nobody can predict.
    expect(dates(act)).toHaveLength(4);
  });
});
