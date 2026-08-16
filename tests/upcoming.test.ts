/**
 * The upcoming-schedule selector.
 *
 * The dashboard card this feeds used to list the five most expensive recurring
 * activities and call them "upcoming" — no dates, no order in time. These tests
 * pin the two properties that matter: dates are real, and activities that have
 * none are never given invented ones.
 */

import { describe, expect, it } from "vitest";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import { dayLabel, groupByDay, upcomingSchedule } from "../src/domain/upcoming";
import type { Activity, BudgetSnapshot } from "../src/domain/types";

// A Thursday, so weekday maths is not accidentally aligned to a Monday.
const NOW = new Date(2026, 7, 20, 9, 0, 0);

function snapshotWith(activities: Partial<Activity>[]): BudgetSnapshot {
  const snapshot = createSeedBudgetSnapshot(NOW);
  const year = String(snapshot.settings.selectedYear);
  const categoryId = snapshot.categories[0].id;
  snapshot.years[year].activities = activities.map((partial, index) => ({
    id: `act-${index}`,
    name: partial.name ?? `Activity ${index}`,
    categoryId,
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
    order: index,
    notes: "",
    ...partial,
  }));
  return snapshot;
}

describe("upcomingSchedule", () => {
  it("dates activities that carry a schedule", () => {
    const snapshot = snapshotWith([
      { name: "Gym", weekdays: [1, 4], pricePerSession: 20 }, // Mondays, Thursdays
    ]);
    const { occurrences } = upcomingSchedule(snapshot, NOW, 14);

    expect(occurrences.length).toBeGreaterThan(0);
    // Every date is a Monday (1) or a Thursday (4).
    for (const occurrence of occurrences) {
      const isoWeekday = occurrence.date.getDay() === 0 ? 7 : occurrence.date.getDay();
      expect([1, 4]).toContain(isoWeekday);
    }
  });

  it("returns occurrences in chronological order", () => {
    const snapshot = snapshotWith([
      { name: "Gym", weekdays: [1, 4], pricePerSession: 20 },
      { name: "Rent", dayOfMonth: 1, pricePerMonth: 900 },
      { name: "Lesson", weekdays: [3], pricePerSession: 35 },
    ]);
    const { occurrences } = upcomingSchedule(snapshot, NOW, 30);

    const times = occurrences.map((o) => o.date.getTime());
    // The whole point of the card: what happens first appears first, across
    // activities rather than within one.
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("never dates an activity that has no schedule", () => {
    const snapshot = snapshotWith([
      { name: "Subscription", recurrenceType: "monthly", pricePerMonth: 12 },
    ]);
    const { occurrences, undated } = upcomingSchedule(snapshot, NOW, 30);

    // A monthly charge with no day set has no knowable date. Guessing one would
    // put a figure on the calendar the user never entered.
    expect(occurrences).toEqual([]);
    expect(undated.map((u) => u.activity.name)).toEqual(["Subscription"]);
  });

  it("leaves one-off activities out of both lists", () => {
    const snapshot = snapshotWith([{ name: "Once", recurrenceType: "none", pricePerMonth: 50 }]);
    const { occurrences, undated } = upcomingSchedule(snapshot, NOW, 30);
    expect(occurrences).toEqual([]);
    expect(undated).toEqual([]);
  });

  it("ignores inactive and hidden activities", () => {
    const snapshot = snapshotWith([
      { name: "Paused", weekdays: [1], pricePerSession: 10, active: false },
      { name: "Hidden", weekdays: [1], pricePerSession: 10, visible: false },
    ]);
    const { occurrences, undated } = upcomingSchedule(snapshot, NOW, 30);
    expect(occurrences).toEqual([]);
    expect(undated).toEqual([]);
  });

  it("stops at the horizon", () => {
    const snapshot = snapshotWith([{ name: "Gym", weekdays: [1, 4], pricePerSession: 20 }]);
    const { occurrences } = upcomingSchedule(snapshot, NOW, 7);
    const limit = new Date(NOW.getTime() + 7 * 86_400_000);
    for (const occurrence of occurrences) {
      expect(occurrence.date.getTime()).toBeLessThanOrEqual(limit.getTime());
    }
  });

  it("prices a monthly charge that falls on one day of the month", () => {
    const snapshot = snapshotWith([{ name: "Rent", dayOfMonth: 1, pricePerMonth: 900 }]);
    const { occurrences } = upcomingSchedule(snapshot, NOW, 40);
    // Arithmetic, not a guess: a monthly amount charged once a month costs that
    // amount on the day it falls.
    expect(occurrences[0].amountNative).toBe(900);
  });

  it("refuses to invent a per-occurrence price it cannot derive", () => {
    const snapshot = snapshotWith([
      // Twice a week with only a monthly total: the number of sessions in a
      // given month is not something the user stated, so dividing would be
      // fabrication.
      { name: "Classes", weekdays: [1, 4], pricePerMonth: 200 },
    ]);
    const { occurrences } = upcomingSchedule(snapshot, NOW, 14);
    expect(occurrences.length).toBeGreaterThan(0);
    expect(occurrences.every((o) => o.amountNative === null)).toBe(true);
  });

  it("sorts undated activities by monthly cost", () => {
    const snapshot = snapshotWith([
      { name: "Small", recurrenceType: "monthly", pricePerMonth: 5 },
      { name: "Large", recurrenceType: "monthly", pricePerMonth: 500 },
      { name: "Medium", recurrenceType: "monthly", pricePerMonth: 50 },
    ]);
    const { undated } = upcomingSchedule(snapshot, NOW, 30);
    expect(undated.map((u) => u.activity.name)).toEqual(["Large", "Medium", "Small"]);
  });
});

describe("grouping and labelling", () => {
  it("groups occurrences by local calendar day", () => {
    const snapshot = snapshotWith([
      { name: "A", weekdays: [1], pricePerSession: 1 },
      { name: "B", weekdays: [1], pricePerSession: 2 },
    ]);
    const { occurrences } = upcomingSchedule(snapshot, NOW, 8);
    const days = groupByDay(occurrences);
    // Two activities on the same Monday are one heading with two rows, not two
    // headings.
    expect(days[0].items).toHaveLength(2);
  });

  it("uses relative labels only where they help", () => {
    const today = new Date(2026, 7, 20);
    expect(dayLabel(today, today)).toBe("Today");
    expect(dayLabel(new Date(2026, 7, 21), today)).toBe("Tomorrow");
    // Beyond a week, a weekday name alone is ambiguous — "Monday" could be any
    // of several — so the date is spelled out.
    expect(dayLabel(new Date(2026, 8, 15), today)).toMatch(/15/);
  });

  it("files a late-evening occurrence under its own local day", () => {
    // Keyed on the local calendar date: formatting in UTC would move an
    // evening event to tomorrow for anyone east of Greenwich.
    const evening = new Date(2026, 7, 20, 23, 30);
    const morning = new Date(2026, 7, 20, 7, 0);
    const days = groupByDay([
      { activity: { id: "a", name: "A" } as Activity, date: evening, amountNative: null },
      { activity: { id: "b", name: "B" } as Activity, date: morning, amountNative: null },
    ]);
    expect(days).toHaveLength(1);
  });
});
