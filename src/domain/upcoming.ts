import { estimateActivity } from "./calculations";
import { describeSchedule, nextOccurrences, parseLocalDate } from "./schedule";
import type { Activity, BudgetSnapshot } from "./types";

/**
 * What is actually coming up, and what merely recurs.
 *
 * The dashboard used to show the five most expensive recurring activities and
 * call it "Upcoming recurring" — no dates, no order in time, and the same five
 * every month. It answered "what costs the most", which the budget card already
 * answers, rather than "what is about to happen", which nothing did.
 *
 * Only activities with a real schedule can have dates. The rest are not given
 * invented ones: a monthly subscription with no day set has no knowable date,
 * and guessing one would put a figure on the calendar the user never entered.
 * They are returned separately so the UI can show them honestly — and offer to
 * fix the omission.
 */

export interface UpcomingOccurrence {
  activity: Activity;
  date: Date;
  /** Cost of this single occurrence in the activity's own currency, when known. */
  amountNative: number | null;
  /**
   * True when the date came from the activity's manual renewal date rather
   * than from its recurrence rule, so the timeline can say which it is.
   */
  manual?: boolean;
}

export interface UpcomingSchedule {
  /** Chronological, across all activities, within the horizon. */
  occurrences: UpcomingOccurrence[];
  /**
   * Activities that recur but carry no schedule, so no date can be derived.
   * Sorted by monthly cost, because that is the only ordering available.
   */
  undated: { activity: Activity; monthlyBase: number }[];
  /** How far ahead `occurrences` looks. */
  horizonDays: number;
}

/**
 * The per-occurrence price, or null when the activity does not state one.
 *
 * A monthly total divided by a guessed number of sessions would be a fabricated
 * figure, so it is left absent instead.
 */
function occurrenceAmount(activity: Activity): number | null {
  if (activity.pricePerSession != null) return activity.pricePerSession;
  if (activity.recurrenceType === "purchase") return activity.pricePerPurchase ?? null;

  // A monthly charge falling on one day of the month costs its monthly price on
  // that day. That is arithmetic, not a guess — unlike dividing a monthly total
  // by a number of sessions nobody entered, which is why the weekday case below
  // still returns null.
  if (activity.recurrenceType === "monthly" && activity.dayOfMonth != null && activity.pricePerMonth != null) {
    return activity.pricePerMonth;
  }
  return null;
}

export function upcomingSchedule(
  snapshot: BudgetSnapshot,
  from = new Date(),
  horizonDays = 14,
): UpcomingSchedule {
  const record = snapshot.years[String(snapshot.settings.selectedYear)];
  const activities = (record?.activities ?? []).filter((a) => a.active && a.visible);

  const horizon = new Date(from.getTime());
  horizon.setDate(horizon.getDate() + horizonDays);

  const occurrences: UpcomingOccurrence[] = [];
  const undated: { activity: Activity; monthlyBase: number }[] = [];

  // Midnight today, so a renewal dated today is still upcoming rather than
  // being cut off by the time of day the page happened to be opened.
  const startOfToday = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  for (const activity of activities) {
    // Ask for a generous count and then cut by date: a daily schedule produces
    // far more hits in the window than a monthly one, and a fixed count would
    // silently truncate the frequent ones.
    let dates = nextOccurrences(activity, from, 40).filter((date) => date <= horizon);

    /*
     * A manual renewal date replaces the calculated next one.
     *
     * It is the only date some activities can have — an annual subscription
     * renews on the day it was bought, which no recurrence rule knows — and
     * where a rule does produce a date, the one the user typed is the better
     * answer. A date already in the past is ignored rather than shown: the
     * renewal has happened, and the rule is right again from here.
     */
    const manualDate = parseLocalDate(activity.nextRenewalDate);
    const manualUpcoming = manualDate != null && manualDate >= startOfToday && manualDate <= horizon;
    if (manualUpcoming) dates = [manualDate as Date, ...dates.slice(1)];

    if (dates.length === 0) {
      if (activity.recurrenceType === "none") continue;
      undated.push({ activity, monthlyBase: estimateActivity(activity, snapshot).monthlyBase });
      continue;
    }

    const amountNative = occurrenceAmount(activity);
    dates.forEach((date, index) => {
      occurrences.push({ activity, date, amountNative, manual: manualUpcoming && index === 0 });
    });
  }

  occurrences.sort((a, b) => {
    const byDate = a.date.getTime() - b.date.getTime();
    // Same-day items keep a stable order rather than shuffling between renders.
    return byDate !== 0 ? byDate : a.activity.name.localeCompare(b.activity.name);
  });
  undated.sort((a, b) => b.monthlyBase - a.monthlyBase || a.activity.name.localeCompare(b.activity.name));

  return { occurrences, undated, horizonDays };
}

/** "Every Monday", "The 15th", … — for activities that do carry a schedule. */
export function scheduleSummary(activity: Activity): string {
  return describeSchedule(activity);
}

/**
 * Group occurrences under a day heading.
 *
 * Keyed by local calendar date rather than by the ISO timestamp: an occurrence
 * at 00:00 local is the same day as one at 23:00, and formatting the key in UTC
 * would file evening events under tomorrow for anyone east of Greenwich.
 */
export function groupByDay(occurrences: UpcomingOccurrence[]): { key: string; date: Date; items: UpcomingOccurrence[] }[] {
  const groups = new Map<string, { key: string; date: Date; items: UpcomingOccurrence[] }>();
  for (const occurrence of occurrences) {
    const key = localDayKey(occurrence.date);
    const existing = groups.get(key);
    if (existing) existing.items.push(occurrence);
    else groups.set(key, { key, date: occurrence.date, items: [occurrence] });
  }
  return [...groups.values()];
}

export function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "Today", "Tomorrow", or a written date. Relative labels only where they help. */
export function dayLabel(date: Date, now = new Date()): string {
  const days = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000,
  );
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1 && days < 7) {
    return date.toLocaleDateString(undefined, { weekday: "long" });
  }
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
