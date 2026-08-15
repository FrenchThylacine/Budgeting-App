/**
 * Recurring-activity schedules
 * ----------------------------
 * Pure calendar maths for activities that happen on real dates rather than on
 * a hand-waved "about four times a month". Nothing here reads the clock unless
 * the caller passes a date in, so every function is deterministic and testable.
 *
 * Two schedule shapes are supported:
 *
 *  - `weekdays`   : the activity happens on given ISO weekdays (1 = Monday …
 *                   7 = Sunday). A month is counted day by day, so a month with
 *                   five Mondays yields five occurrences, not four.
 *  - `dayOfMonth` : the activity happens once a month on a fixed day, e.g. a
 *                   subscription renewal on the 15th. A day that does not exist
 *                   in a month (the 31st of February) yields zero occurrences
 *                   for that month — it is never silently moved to the 28th,
 *                   because inventing a date would invent money.
 *
 * When both are present `weekdays` wins: it is the more specific rule.
 *
 * `startDate` clips the schedule: occurrences strictly before it never count.
 *
 * Dates are handled in local time throughout. `YYYY-MM-DD` strings are parsed
 * field by field rather than through `new Date(string)`, which would treat them
 * as UTC and shift the day for anyone west of Greenwich.
 */
import type { Activity, IsoWeekday } from "./types";

/** Monday-first ISO weekday order, for pickers and labels. */
export const ISO_WEEKDAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

export const WEEKDAY_LABELS: Record<IsoWeekday, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

export const WEEKDAY_SHORT_LABELS: Record<IsoWeekday, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

/** Number of days in a 1-indexed month, leap years included. */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) return 0;
  // Day 0 of the next month is the last day of this one.
  return new Date(year, month, 0).getDate();
}

/** ISO weekday of a date: 1 = Monday … 7 = Sunday. */
export function isoWeekdayOf(date: Date): IsoWeekday {
  const day = date.getDay();
  return (day === 0 ? 7 : day) as IsoWeekday;
}

/** Parses `YYYY-MM-DD` as a local calendar date. Returns null when unusable. */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return new Date(year, month - 1, day);
}

/** Formats a date as `YYYY-MM-DD` in local time. */
export function toLocalDateInput(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Drops duplicates and out-of-range values, then sorts Monday-first. */
export function normalizeWeekdays(weekdays: IsoWeekday[] | null | undefined): IsoWeekday[] {
  if (!Array.isArray(weekdays)) return [];
  const unique = new Set<number>();
  for (const value of weekdays) {
    const day = Number(value);
    if (Number.isInteger(day) && day >= 1 && day <= 7) unique.add(day);
  }
  return (Array.from(unique) as IsoWeekday[]).sort((a, b) => a - b);
}

/** A usable day-of-month rule, or null when absent or nonsensical. */
export function normalizeDayOfMonth(dayOfMonth: number | null | undefined): number | null {
  if (dayOfMonth == null) return null;
  const day = Number(dayOfMonth);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  return day;
}

/** True when the activity carries a schedule this module can count. */
export function hasSchedule(activity: Activity): boolean {
  return normalizeWeekdays(activity.weekdays).length > 0 || normalizeDayOfMonth(activity.dayOfMonth) != null;
}

/**
 * Real occurrences of an activity inside one calendar month.
 *
 * Counts actual matching days, so August with five Mondays returns five and a
 * 29-day February returns what February really holds.
 */
export function occurrencesInMonth(activity: Activity, year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) return 0;
  const weekdays = normalizeWeekdays(activity.weekdays);
  const dayOfMonth = normalizeDayOfMonth(activity.dayOfMonth);
  if (weekdays.length === 0 && dayOfMonth == null) return 0;

  const lastDay = daysInMonth(year, month);
  if (lastDay === 0) return 0;

  // `startDate` clips the month: before it, the schedule was not yet running.
  let firstDay = 1;
  const start = parseLocalDate(activity.startDate);
  if (start) {
    const startYear = start.getFullYear();
    const startMonth = start.getMonth() + 1;
    if (startYear > year || (startYear === year && startMonth > month)) return 0;
    if (startYear === year && startMonth === month) firstDay = start.getDate();
  }

  if (weekdays.length > 0) {
    let count = 0;
    for (let day = firstDay; day <= lastDay; day += 1) {
      if (weekdays.includes(isoWeekdayOf(new Date(year, month - 1, day)))) count += 1;
    }
    return count;
  }

  // Day-of-month: exactly one occurrence, and only when the day exists.
  return dayOfMonth != null && dayOfMonth >= firstDay && dayOfMonth <= lastDay ? 1 : 0;
}

/** Real occurrences across a whole calendar year. */
export function occurrencesInYear(activity: Activity, year: number): number {
  let total = 0;
  for (let month = 1; month <= 12; month += 1) {
    total += occurrencesInMonth(activity, year, month);
  }
  return total;
}

/**
 * The next `count` occurrences on or after `from`, in chronological order.
 * Returns an empty list when the activity has no schedule.
 */
export function nextOccurrences(activity: Activity, from: Date, count: number): Date[] {
  const results: Date[] = [];
  if (!Number.isFinite(count) || count <= 0) return results;
  if (Number.isNaN(from.getTime())) return results;

  const weekdays = normalizeWeekdays(activity.weekdays);
  const dayOfMonth = normalizeDayOfMonth(activity.dayOfMonth);
  if (weekdays.length === 0 && dayOfMonth == null) return results;

  const wanted = Math.floor(count);
  let cursor = startOfDay(from);
  const start = parseLocalDate(activity.startDate);
  if (start && start.getTime() > cursor.getTime()) cursor = start;

  if (weekdays.length > 0) {
    // At most seven days separate two hits, so this bound can never cut a
    // reachable occurrence short while still guaranteeing termination.
    const maxSteps = wanted * 7 + 7;
    for (let step = 0; step < maxSteps && results.length < wanted; step += 1) {
      if (weekdays.includes(isoWeekdayOf(cursor))) results.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }
    return results;
  }

  // Day-of-month: walk month by month, skipping months that lack the day.
  let year = cursor.getFullYear();
  let month = cursor.getMonth() + 1;
  const maxMonths = wanted * 12 + 24;
  for (let step = 0; step < maxMonths && results.length < wanted; step += 1) {
    if (dayOfMonth != null && dayOfMonth <= daysInMonth(year, month)) {
      const candidate = new Date(year, month - 1, dayOfMonth);
      if (candidate.getTime() >= cursor.getTime()) results.push(candidate);
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return results;
}

/** Price used by the schedule model: per-session first, estimate as a fallback. */
export function schedulePrice(activity: Activity): number | null {
  const price = activity.pricePerSession ?? activity.estimatedCost;
  if (price == null || !Number.isFinite(price)) return null;
  return price;
}

/**
 * Monthly cost implied by the schedule, or null when the activity has no
 * schedule or no usable price. Null means "cannot be derived" — never zero,
 * because zero is a real budget value.
 */
export function monthlyEstimateFromSchedule(activity: Activity, year: number, month: number): number | null {
  if (!hasSchedule(activity)) return null;
  const price = schedulePrice(activity);
  if (price == null) return null;
  return price * occurrencesInMonth(activity, year, month);
}

/**
 * Yearly cost implied by the schedule: the sum of twelve real months, never
 * one month multiplied by twelve. Those differ whenever weekdays are involved.
 */
export function yearlyEstimateFromSchedule(activity: Activity, year: number): number | null {
  if (!hasSchedule(activity)) return null;
  const price = schedulePrice(activity);
  if (price == null) return null;
  return price * occurrencesInYear(activity, year);
}

/** Short human summary of a schedule, e.g. "Mon, Wed" or "Day 15 monthly". */
export function describeSchedule(activity: Activity): string {
  const weekdays = normalizeWeekdays(activity.weekdays);
  if (weekdays.length > 0) return weekdays.map((day) => WEEKDAY_SHORT_LABELS[day]).join(", ");
  const dayOfMonth = normalizeDayOfMonth(activity.dayOfMonth);
  if (dayOfMonth != null) return `Day ${dayOfMonth} monthly`;
  return "No schedule set";
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
