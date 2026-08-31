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
import type { Activity, IsoWeekday, ScheduleOverride } from "./types";

/** Monday-first ISO weekday order, for pickers and labels. */
export const ISO_WEEKDAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

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


// ─── One-off exceptions ──────────────────────────────────────────────────────

/** A single occurrence, after any override that applies to it. */
export interface ScheduledOccurrence {
  date: Date;
  /**
   * Price for this occurrence in the activity's own currency, or null when it
   * cannot be derived. Null is never read as zero: an unpriced session is not
   * a free one.
   */
  price: number | null;
  /** Exists only because an `extra` override added it. */
  added: boolean;
  /** Displaced from the date the rule produced. */
  moved: boolean;
}

function normalizeOverrides(activity: Activity): ScheduleOverride[] {
  const overrides = activity.scheduleOverrides;
  if (!Array.isArray(overrides)) return [];
  // A malformed entry is dropped rather than throwing: one bad row must not
  // make the whole activity unschedulable.
  return overrides.filter(
    (o) => o && typeof o.date === "string" && parseLocalDate(o.date) != null,
  );
}

/** Dates the rule alone produces in [from, to], ignoring every override. */
function ruleDatesBetween(activity: Activity, from: Date, to: Date): Date[] {
  const weekdays = normalizeWeekdays(activity.weekdays);
  const dayOfMonth = normalizeDayOfMonth(activity.dayOfMonth);
  if (weekdays.length === 0 && dayOfMonth == null) return [];

  let cursor = startOfDay(from);
  const start = parseLocalDate(activity.startDate);
  if (start && start.getTime() > cursor.getTime()) cursor = start;
  const end = startOfDay(to);

  const out: Date[] = [];
  // Bounded by the range rather than by a step count, so a long window cannot
  // silently truncate and a pathological input cannot loop forever.
  const maxDays = 400;
  for (let day = 0; day <= maxDays && cursor.getTime() <= end.getTime(); day += 1) {
    if (weekdays.length > 0) {
      if (weekdays.includes(isoWeekdayOf(cursor))) out.push(new Date(cursor));
    } else if (dayOfMonth != null && cursor.getDate() === dayOfMonth) {
      out.push(new Date(cursor));
    }
    cursor = addDays(cursor, 1);
  }
  return out;
}

/**
 * Real occurrences in a date range, with one-off exceptions applied.
 *
 * This is the single place the rule and its exceptions are combined. Everything
 * else — the monthly count, the monthly and yearly estimates, the dashboard
 * timeline — is expressed on top of it, so an override cannot be honoured in
 * one view and ignored in another.
 */
export function occurrenceDatesBetween(activity: Activity, from: Date, to: Date): ScheduledOccurrence[] {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];
  // An exception to a rule that does not exist is not a schedule. Without this
  // an `extra` on an unscheduled activity would appear on the timeline while
  // contributing nothing to any total, because the estimates are gated on
  // hasSchedule() — the exact inconsistency overrides exist to avoid. A one-off
  // dated cost with no rule behind it is a spending entry, not a schedule.
  if (!hasSchedule(activity)) return [];

  const overrides = normalizeOverrides(activity);
  const basePrice = schedulePrice(activity);
  const rangeStart = startOfDay(from).getTime();
  const rangeEnd = startOfDay(to).getTime();

  const byRuleDate = new Map<string, ScheduleOverride>();
  const extras: ScheduleOverride[] = [];
  for (const override of overrides) {
    if (override.kind === "extra") extras.push(override);
    // Last one wins if two target the same date; the alternative is an
    // ambiguous combination nobody can predict.
    else byRuleDate.set(override.date, override);
  }

  const inRange = (date: Date): boolean => {
    const time = startOfDay(date).getTime();
    return time >= rangeStart && time <= rangeEnd;
  };

  const priceFor = (override: ScheduleOverride | undefined): number | null => {
    if (override && (override.kind === "price" || override.kind === "extra")) {
      // `undefined` means the override does not state a price, so the rule's
      // price still applies. An explicit `null` means "not known", and stays
      // unknown rather than falling back.
      if (override.amount !== undefined) return override.amount;
    }
    return basePrice;
  };

  const results: ScheduledOccurrence[] = [];

  // A move can pull an occurrence in from outside the window, so the rule is
  // generated over a widened range and then filtered by where things land.
  const widened = 40;
  const scanFrom = addDays(startOfDay(from), -widened);
  const scanTo = addDays(startOfDay(to), widened);

  for (const ruleDate of ruleDatesBetween(activity, scanFrom, scanTo)) {
    const key = toLocalDateInput(ruleDate);
    const override = byRuleDate.get(key);

    if (override?.kind === "skip") continue;

    if (override?.kind === "move") {
      const moved = parseLocalDate(override.movedTo ?? null);
      // A move with no destination is treated as a skip rather than silently
      // leaving the occurrence where it was — the user asked for it to not
      // happen then.
      if (!moved) continue;
      if (inRange(moved)) {
        results.push({ date: moved, price: priceFor(override), added: false, moved: true });
      }
      continue;
    }

    if (inRange(ruleDate)) {
      results.push({ date: ruleDate, price: priceFor(override), added: false, moved: false });
    }
  }

  for (const extra of extras) {
    const date = parseLocalDate(extra.date);
    if (!date || !inRange(date)) continue;
    results.push({ date, price: priceFor(extra), added: true, moved: false });
  }

  results.sort((a, b) => a.date.getTime() - b.date.getTime());
  return results;
}

/**
 * Real occurrences inside one calendar month, with exceptions applied.
 *
 * The month is expressed as a range so a moved occurrence lands in the month it
 * moved to, and leaves the one it moved from.
 */
export function occurrenceDatesInMonth(activity: Activity, year: number, month: number): ScheduledOccurrence[] {
  if (!Number.isInteger(month) || month < 1 || month > 12) return [];
  const lastDay = daysInMonth(year, month);
  if (lastDay === 0) return [];
  return occurrenceDatesBetween(activity, new Date(year, month - 1, 1), new Date(year, month - 1, lastDay));
}

/**
 * Real occurrences of an activity inside one calendar month.
 *
 * Counts actual matching days, so August with five Mondays returns five and a
 * 29-day February returns what February really holds. One-off exceptions are
 * included, because a skipped week is genuinely one fewer occurrence.
 */
export function occurrencesInMonth(activity: Activity, year: number, month: number): number {
  return occurrenceDatesInMonth(activity, year, month).length;
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
  if (!Number.isFinite(count) || count <= 0) return [];
  if (Number.isNaN(from.getTime())) return [];
  // Expressed on the override-aware core, so a skipped week does not appear on
  // the dashboard timeline while being correctly absent from the month's total.
  // The window bounds the work; 400 days covers thirteen monthly occurrences,
  // far more than any view asks for.
  const horizon = addDays(startOfDay(from), 400);
  return occurrenceDatesBetween(activity, from, horizon)
    .slice(0, Math.floor(count))
    .map((occurrence) => occurrence.date);
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
  return sumOccurrences(occurrenceDatesInMonth(activity, year, month));
}

/**
 * Total of a set of occurrences, or null when any of them has no price.
 *
 * A partial sum would understate the month while looking like a complete
 * figure, which is worse than admitting the total is not known. With no
 * overrides this is exactly price × count, so existing budgets are unchanged.
 */
function sumOccurrences(occurrences: ScheduledOccurrence[]): number | null {
  if (occurrences.length === 0) return 0;
  let total = 0;
  for (const occurrence of occurrences) {
    if (occurrence.price == null) return null;
    total += occurrence.price;
  }
  return total;
}

/**
 * Yearly cost implied by the schedule: the sum of twelve real months, never
 * one month multiplied by twelve. Those differ whenever weekdays are involved.
 */
export function yearlyEstimateFromSchedule(activity: Activity, year: number): number | null {
  if (!hasSchedule(activity)) return null;
  let total = 0;
  for (let month = 1; month <= 12; month += 1) {
    const monthly = monthlyEstimateFromSchedule(activity, year, month);
    if (monthly == null) return null;
    total += monthly;
  }
  return total;
}

/**
 * Short human summary of a schedule, e.g. "Mon, Wed" or "Day 15 monthly".
 *
 * The translator is required: everything this returns is read on a screen, and
 * an optional one meant an English sentence sitting beside every key for the
 * benefit of callers that turned out not to exist. Tests pass the
 * application's own English translator — `tests/lib/english.ts`.
 */
export function describeSchedule(
  activity: Activity,
  t: (key: string, params?: Record<string, string | number>) => string,
  weekdayNames: Record<IsoWeekday, string> = WEEKDAY_SHORT_LABELS,
): string {
  const weekdays = normalizeWeekdays(activity.weekdays);
  if (weekdays.length > 0) return weekdays.map((day) => weekdayNames[day]).join(", ");
  const dayOfMonth = normalizeDayOfMonth(activity.dayOfMonth);
  if (dayOfMonth != null) {
    return t("activity.dayMonthly", { day: dayOfMonth });
  }
  return t("activity.noSchedule");
}

/**
 * Midnight local time on the given date.
 *
 * Exported because the payment module counts in whole days from the same
 * origin; two private copies of this would be two places for a timezone bug
 * to hide.
 */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** `days` calendar days later, in local time, DST included. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
