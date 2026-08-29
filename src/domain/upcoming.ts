import { estimateActivity } from "./calculations";
import { nextOccurrences, parseLocalDate } from "./schedule";
import { describePaymentCycle, paymentsBetween } from "./payments";
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
  /**
   * What the entry is.
   *
   * `occurrence` is the historical meaning — a session that is also its own
   * charge, or a subscription's renewal. `payment` is money leaving on a cycle
   * of its own, which for a session pack is *not* one per session. The two are
   * distinguished so the timeline can label a €200 gym payment as covering ten
   * sessions rather than implying a €200 session.
   */
  kind?: "occurrence" | "payment";
  /** Sessions a `payment` covers, when the model states one. */
  sessions?: number;
  /** A sentence describing the cycle, for entries whose cadence needs saying. */
  cycleNote?: string;
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

  // An annual charge on a known date costs the whole year on that date. The
  // timeline showed "—" for it, which is the app declining to state a figure it
  // has: the yearly estimate *is* the charge, and the renewal date is when it
  // lands. The month card still shows the twelfth, labelled as an average,
  // because that is the right figure for comparing commitments — this is the
  // right figure for the day the money leaves.
  if (activity.recurrenceType === "yearly" && activity.yearlyEstimate != null) {
    return activity.yearlyEstimate;
  }
  return null;
}

/** True when a payment-cycle model has a date to count from. */
function hasPaymentBaseline(activity: Activity): boolean {
  return parseLocalDate(activity.nextRenewalDate) != null || parseLocalDate(activity.startDate) != null;
}

export function upcomingSchedule(
  snapshot: BudgetSnapshot,
  from = new Date(),
  horizonDays = 14,
  /** Optional, so a test or an export gets the English wording as before. */
  t?: (key: string, params?: Record<string, string | number>) => string,
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
    /*
     * Models with a payment cycle of their own are asked first.
     *
     * A fixed-yearly activity is billed once a year on a date the user knows,
     * and a session pack is billed once every N sessions. Neither is derivable
     * from a recurrence rule, and running them through the rule below is
     * exactly how a €60/year subscription ends up looking like €60 a month.
     * `paymentsBetween` returns null for every other model, so nothing else
     * changes.
     */
    const payments = paymentsBetween(activity, startOfToday, horizon);
    if (payments) {
      if (payments.length === 0) {
        // No payment in the window is not the same as no schedule: an annual
        // charge eleven months out is dated and simply not due yet. It is only
        // "undated" when the activity carries no baseline at all.
        if (activity.recurrenceType === "none") continue;
        if (!hasPaymentBaseline(activity)) {
          undated.push({ activity, monthlyBase: estimateActivity(activity, snapshot).monthlyBase });
        }
        continue;
      }
      const cycleNote = describePaymentCycle(activity, t) ?? undefined;
      for (const payment of payments) {
        occurrences.push({
          activity,
          date: payment.date,
          amountNative: payment.amountNative,
          manual: payment.fromRenewalDate,
          kind: "payment",
          sessions: payment.sessions,
          cycleNote,
        });
      }
      continue;
    }

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
      occurrences.push({
        activity,
        date,
        amountNative,
        manual: manualUpcoming && index === 0,
        kind: "occurrence",
      });
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

/**
 * "Today", "Tomorrow", or a written date. Relative labels only where they help.
 *
 * The two relative words are the only strings here; the dates themselves go
 * through the caller's own formatter, so the whole application agrees on one
 * locale rather than this function using the browser's.
 */
export function dayLabel(
  date: Date,
  now = new Date(),
  t?: (key: string, params?: Record<string, string | number>) => string,
  formatDate?: (value: Date, options?: Intl.DateTimeFormatOptions) => string,
): string {
  const format = formatDate ?? ((value: Date, options?: Intl.DateTimeFormatOptions) => value.toLocaleDateString(undefined, options));
  const days = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000,
  );
  if (days === 0) return t ? t("upcoming.today") : "Today";
  if (days === 1) return t ? t("upcoming.tomorrow") : "Tomorrow";
  if (days > 1 && days < 7) return format(date, { weekday: "long" });
  return format(date, { weekday: "short", day: "numeric", month: "short" });
}
