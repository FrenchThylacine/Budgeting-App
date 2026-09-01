/**
 * Payment cycles
 * ==============
 * When money actually leaves the account, as distinct from when the activity
 * happens.
 *
 * The two are not the same thing and the application used to assume they were.
 * A gym at two sessions a week, paid for ten sessions at a time, is *not* two
 * payments a week; an annual subscription is not a monthly one. Every model
 * below therefore states two separate facts:
 *
 *  - the **accrual**: what the commitment costs per month and per year, which
 *    is the figure a budget compares against other commitments;
 *  - the **payments**: dated amounts, which is what a bank statement shows.
 *
 * Nothing here reads the clock unless a date is passed in, so every function is
 * deterministic and directly testable.
 */
import {
  addDays,
  daysInMonth,
  hasSchedule,
  occurrencesInMonth,
  occurrencesInYear,
  parseLocalDate,
  startOfDay,
} from "./schedule";
import { numberLocale } from "./currency";
import type { Activity, IsoWeekday } from "./types";

/**
 * Weeks in an average month.
 *
 * 52 / 12, not 4. "Four weeks a month" loses a month of sessions a year, which
 * is the single most common arithmetic error in this whole area — the reason
 * the `schedule` model counts real calendar days instead of guessing at all.
 * This average is only used where the user has given a *rate* ("twice a week")
 * rather than actual weekdays, in which case an average is the honest answer
 * and a fabricated calendar would not be.
 */
export const WEEKS_PER_MONTH = 52 / 12;

/** How often the sessions happen, as a rate. */
export type SessionPeriod = "week" | "month";

/** A usable positive number, or null. Zero is not a frequency. */
function positive(value: number | null | undefined): number | null {
  if (value == null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

/** A usable count of sessions per payment: a whole number, at least one. */
export function normalizeSessionsPerPayment(value: number | null | undefined): number | null {
  const numeric = positive(value);
  if (numeric == null) return null;
  const rounded = Math.round(numeric);
  return rounded >= 1 ? rounded : null;
}

/** The stated frequency unit, defaulting to weekly — which is how people speak. */
export function normalizeSessionPeriod(value: string | null | undefined): SessionPeriod {
  return value === "month" ? "month" : "week";
}

/**
 * Sessions per week implied by the activity's own configuration.
 *
 * A real weekday schedule wins: "Monday and Thursday" is exactly two a week and
 * needs no averaging. Otherwise the stated rate is used, converted if it was
 * given per month. Null when the activity does not say — never a guess.
 */
export function sessionsPerWeek(activity: Activity): number | null {
  const weekdays = activity.weekdays;
  if (Array.isArray(weekdays) && weekdays.length > 0) {
    const unique = new Set<IsoWeekday>();
    for (const day of weekdays) {
      const numeric = Number(day);
      if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 7) unique.add(numeric as IsoWeekday);
    }
    if (unique.size > 0) return unique.size;
  }
  const rate = positive(activity.sessionsPerPeriod);
  if (rate != null) {
    return normalizeSessionPeriod(activity.sessionPeriod) === "week" ? rate : rate / WEEKS_PER_MONTH;
  }
  const perMonth = positive(activity.sessionsPerMonth);
  if (perMonth != null) return perMonth / WEEKS_PER_MONTH;
  return null;
}

/**
 * Sessions in one real calendar month.
 *
 * With weekdays set this is the true count — a month with five Mondays has
 * five. Otherwise it is the stated rate averaged over the month. Null when the
 * activity states no frequency at all.
 */
export function sessionsInMonth(activity: Activity, year: number, month: number): number | null {
  if (hasSchedule(activity)) return occurrencesInMonth(activity, year, month);
  const perWeek = sessionsPerWeek(activity);
  if (perWeek == null) return null;
  // Scaled by the month's real length, so February costs less than March
  // rather than every month costing the same notional 4.33 weeks.
  const days = daysInMonth(year, month);
  if (days === 0) return null;
  return (perWeek * days) / 7;
}

/** Sessions across a whole calendar year, by the same rules. */
export function sessionsInYear(activity: Activity, year: number): number | null {
  if (hasSchedule(activity)) return occurrencesInYear(activity, year);
  const perWeek = sessionsPerWeek(activity);
  if (perWeek == null) return null;
  const days = isLeapYear(year) ? 366 : 365;
  return (perWeek * days) / 7;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * What one payment is worth, in the activity's own currency.
 *
 * Ten sessions at €20 is a €200 payment. Null when either half is missing —
 * a payment of an unknown size is not a payment of zero.
 */
export function sessionPackPaymentAmount(activity: Activity): number | null {
  const price = activity.pricePerSession;
  const perPayment = normalizeSessionsPerPayment(activity.sessionsPerPayment);
  if (price == null || !Number.isFinite(price) || perPayment == null) return null;
  return price * perPayment;
}

/**
 * Days between one payment and the next.
 *
 * Ten sessions at two a week is a payment every five weeks — thirty-five days.
 * Null when the frequency or the pack size is unknown.
 */
export function sessionPackIntervalDays(activity: Activity): number | null {
  const perWeek = sessionsPerWeek(activity);
  const perPayment = normalizeSessionsPerPayment(activity.sessionsPerPayment);
  if (perWeek == null || perPayment == null) return null;
  const days = (perPayment / perWeek) * 7;
  if (!Number.isFinite(days) || days <= 0) return null;
  // Rounded to a whole day: a payment cannot fall at 3pm on a Thursday and a
  // half. Never below one, so a pathological rate cannot produce an infinite
  // series of same-day payments.
  return Math.max(1, Math.round(days));
}

/**
 * A dated payment: money genuinely leaving the account.
 *
 * `sessions` is set for a session pack, so the timeline can say *why* the
 * amount is what it is — "€200 · 10 sessions" rather than an unexplained €200.
 */
export interface PaymentOccurrence {
  date: Date;
  /** Amount in the activity's own currency. Null when it is not known. */
  amountNative: number | null;
  /** Sessions this payment covers, for a session pack. */
  sessions?: number;
  /** True when the date descends from a renewal date the user typed. */
  fromRenewalDate: boolean;
}

/**
 * The baseline a repeating payment counts from.
 *
 * The manual renewal date first, because it is a fact the user knows and no
 * rule can derive — an annual subscription renews on the day it was bought.
 * The start date second. Null when neither exists, in which case no dates are
 * produced at all: inventing 1 January, or today plus a year, would put a
 * figure on the calendar nobody entered.
 */
export function paymentBaseline(activity: Activity): Date | null {
  return parseLocalDate(activity.nextRenewalDate) ?? parseLocalDate(activity.startDate) ?? null;
}

/**
 * The same calendar day, `years` years later.
 *
 * 29 February is clamped to the 28th in a common year rather than rolling into
 * March, which is what every subscription service does with it.
 */
/**
 * The same day of the month, `months` later.
 *
 * Clamped to the month's length, so a plan starting on the 31st pays on the
 * 30th in April rather than slipping into May and dragging every later payment
 * with it.
 */
function addMonthsKeepingDay(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const day = Math.min(date.getDate(), daysInMonth(target.getFullYear(), target.getMonth() + 1));
  return new Date(target.getFullYear(), target.getMonth(), day);
}

function addYears(date: Date, years: number): Date {
  const year = date.getFullYear() + years;
  const month = date.getMonth();
  const day = Math.min(date.getDate(), daysInMonth(year, month + 1));
  return new Date(year, month, day);
}

/**
 * Yearly payment dates on and after `from`, anchored to the baseline.
 *
 * The baseline is the schedule, not a hint: a renewal on 14 September 2026
 * produces 14 September 2026, 2027, 2028 — never 1 January and never "today
 * plus 365 days". A baseline already in the past is rolled forward whole years
 * to the next occurrence, because an annual charge that happened last year
 * still happens this year on the same date.
 */
export function yearlyPaymentDates(activity: Activity, from: Date, count: number): Date[] {
  const baseline = paymentBaseline(activity);
  if (!baseline || !Number.isFinite(count) || count <= 0) return [];
  const start = startOfDay(from);

  let cursor = baseline;
  if (cursor.getTime() < start.getTime()) {
    // Straight to the right year rather than a loop, then corrected by at most
    // one step for a date earlier in the year than today's.
    const gap = start.getFullYear() - cursor.getFullYear();
    cursor = addYears(cursor, Math.max(0, gap));
    while (cursor.getTime() < start.getTime()) cursor = addYears(cursor, 1);
  }

  const dates: Date[] = [];
  for (let index = 0; index < Math.floor(count); index += 1) {
    dates.push(cursor);
    cursor = addYears(cursor, 1);
  }
  return dates;
}

/**
 * Payment dates for a session pack, on and after `from`.
 *
 * Every `sessionPackIntervalDays` from the baseline. Like the yearly case, a
 * baseline in the past is advanced to the next due payment rather than ignored.
 */
export function sessionPackPaymentDates(activity: Activity, from: Date, count: number): Date[] {
  const baseline = paymentBaseline(activity);
  const interval = sessionPackIntervalDays(activity);
  if (!baseline || interval == null || !Number.isFinite(count) || count <= 0) return [];
  const start = startOfDay(from);

  let cursor = baseline;
  if (cursor.getTime() < start.getTime()) {
    const elapsedDays = Math.floor((start.getTime() - cursor.getTime()) / 86_400_000);
    cursor = addDays(cursor, Math.ceil(elapsedDays / interval) * interval);
    // Daylight saving can leave the jump a day short; at most one correction.
    while (cursor.getTime() < start.getTime()) cursor = addDays(cursor, interval);
  }

  const dates: Date[] = [];
  for (let index = 0; index < Math.floor(count); index += 1) {
    dates.push(cursor);
    cursor = addDays(cursor, interval);
  }
  return dates;
}


/**
 * The dates an installment plan actually falls on.
 *
 * Bounded by `installmentCount`, which is the whole difference between this and
 * a recurring cost: a plan of twelve payments has a *last* one, and the month
 * after it costs nothing. A schedule that kept producing dates would report a
 * commitment the reader has finished paying.
 *
 * Dates are generated from the first payment forward and then filtered to the
 * window, rather than advanced to it, because "which installment number is
 * this" is only answerable by counting from the start.
 */
export function installmentPaymentDates(activity: Activity): Date[] {
  const baseline = paymentBaseline(activity);
  const count = normalizeInstallmentCount(activity.installmentCount);
  if (!baseline || count == null) return [];

  const frequency = activity.installmentFrequency ?? "monthly";
  const dates: Date[] = [];
  for (let index = 0; index < count; index += 1) {
    if (frequency === "monthly") {
      dates.push(addMonthsKeepingDay(baseline, index));
    } else if (frequency === "yearly") {
      dates.push(addMonthsKeepingDay(baseline, index * 12));
    } else {
      const interval = normalizeInstallmentInterval(activity.installmentIntervalDays);
      if (interval == null) return [];
      dates.push(addDays(baseline, index * interval));
    }
  }
  return dates;
}

/** A whole, positive number of installments, or null when it is not stated. */
export function normalizeInstallmentCount(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const whole = Math.floor(value);
  // One installment is a one-off payment expressed the long way round, and is
  // legal: somebody may plan two and pay the second early.
  return whole >= 1 && whole <= 600 ? whole : null;
}

/** A sane custom interval in days. */
export function normalizeInstallmentInterval(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const whole = Math.floor(value);
  return whole >= 1 && whole <= 3650 ? whole : null;
}

/** What one installment costs, in the activity's own currency. */
export function installmentAmount(activity: Activity): number | null {
  const amount = activity.installmentAmount;
  if (amount == null || !Number.isFinite(amount) || amount < 0) return null;
  return amount;
}

/**
 * What the whole plan costs: every installment, once.
 *
 * This is the figure the activity is *worth* — €3,000 of flying — as distinct
 * from what any one month requires, which is one installment or none.
 */
/**
 * How many months the plan runs for, from its first payment to its last.
 *
 * Used for the monthly accrual, which is a display figure: what a month
 * genuinely requires comes from the dates. At least one, so a single-payment
 * plan does not divide by zero.
 */
export function installmentPlanMonths(activity: Activity): number | null {
  const dates = installmentPaymentDates(activity);
  if (dates.length === 0) return null;
  const first = dates[0];
  const last = dates[dates.length - 1];
  const months =
    (last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth()) + 1;
  return Math.max(1, months);
}

export function installmentTotal(activity: Activity): number | null {
  const count = normalizeInstallmentCount(activity.installmentCount);
  const amount = installmentAmount(activity);
  if (count == null || amount == null) return null;
  return count * amount;
}

/**
 * Real payments for an activity in `[from, to]`, or null when this module does
 * not model the activity's payments.
 *
 * Null and an empty array mean different things: null is "ask the recurrence
 * rule", an empty array is "this model produces no payment in that window".
 */
export function paymentsBetween(activity: Activity, from: Date, to: Date): PaymentOccurrence[] | null {
  const model = activity.costModel;
  if (model !== "fixedYearly" && model !== "sessionPack" && model !== "installments") return null;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];

  const end = startOfDay(to).getTime();
  const fromRenewalDate = parseLocalDate(activity.nextRenewalDate) != null;

  if (model === "fixedYearly") {
    // At most two: a yearly charge cannot land three times in any window this
    // application shows.
    return yearlyPaymentDates(activity, from, 2)
      .filter((date) => date.getTime() <= end)
      .map((date) => ({
        date,
        amountNative: fixedYearlyAmount(activity),
        fromRenewalDate,
      }));
  }

  if (model === "installments") {
    const amount = installmentAmount(activity);
    return installmentPaymentDates(activity)
      .filter((date) => date.getTime() >= startOfDay(from).getTime() && date.getTime() <= end)
      .map((date) => ({ date, amountNative: amount, fromRenewalDate }));
  }

  const interval = sessionPackIntervalDays(activity);
  if (interval == null) return [];
  // Bounded by the window rather than by a fixed count, so a weekly pack in a
  // long window is not silently truncated.
  const span = Math.max(0, Math.ceil((end - startOfDay(from).getTime()) / 86_400_000));
  const maximum = Math.min(60, Math.floor(span / interval) + 1);
  const sessions = normalizeSessionsPerPayment(activity.sessionsPerPayment) ?? undefined;
  return sessionPackPaymentDates(activity, from, maximum)
    .filter((date) => date.getTime() <= end)
    .map((date) => ({
      date,
      amountNative: sessionPackPaymentAmount(activity),
      sessions,
      fromRenewalDate,
    }));
}

/**
 * The stated annual amount of a fixed-yearly activity.
 *
 * `yearlyEstimate` is the field that has always meant "what this costs in a
 * year", so a fixed-yearly activity stores its €60 there rather than in a
 * second field meaning the same thing. `estimatedCost` is accepted as a
 * fallback for an activity converted from the automatic model, which is where
 * an annual figure often ended up.
 */
export function fixedYearlyAmount(activity: Activity): number | null {
  const yearly = activity.yearlyEstimate;
  if (yearly != null && Number.isFinite(yearly)) return yearly;
  const estimate = activity.estimatedCost;
  if (estimate != null && Number.isFinite(estimate)) return estimate;
  return null;
}

/**
 * A sentence describing the payment cycle, for the card and the editor.
 *
 * Written to make the distinction the whole model exists for impossible to
 * miss: the sessions and the payments are stated as two separate facts.
 */
export function describePaymentCycle(
  activity: Activity,
  t: (key: string, params?: Record<string, string | number>) => string,
): string | null {
  /*
   * The translator is required.
   *
   * It used to be optional, with an English fallback beside every key "for a
   * test or an export". There is no such caller: both the card and the
   * upcoming list pass one, and the only code that took the other branch was
   * the test asserting the English. So the fallback was seven English
   * sentences kept alive by the test that checked them — and the audit found
   * them exactly the way it found the others.
   */
  if (activity.costModel === "fixedYearly") return t("payments.billedYearly");
  if (activity.costModel !== "sessionPack") return null;

  const perPayment = normalizeSessionsPerPayment(activity.sessionsPerPayment);
  const rate = positive(activity.sessionsPerPeriod);
  const period = normalizeSessionPeriod(activity.sessionPeriod);
  const cadence =
    rate != null
      ? t(period === "week" ? "payments.perWeek" : "payments.perMonth", { rate: trim(rate) })
      : null;

  if (perPayment == null) {
    if (!cadence) return null;
    return t("payments.paySession", { cadence });
  }

  const every = sessionPackIntervalDays(activity);
  const interval = every != null ? describeDays(every, t, true) : null;
  const core =
    interval != null
      ? t("payments.payEveryWithInterval", { count: perPayment, interval })
      : t("payments.payEvery", { count: perPayment });
  return cadence ? t("payments.cycle", { cadence, core }) : core;
}

/** "35 days" as "5 weeks" where that is the clearer unit. */
export function describeDays(
  days: number,
  t: (key: string, params?: Record<string, string | number>) => string,
  /**
   * Produce "every 5 weeks" rather than "5 weeks".
   *
   * One key rather than an article glued in front of another: in French the
   * article agrees with the noun — *tous les 35 jours*, *toutes les 5
   * semaines* — so a sentence that supplies "tous les" and interpolates
   * whichever unit came back is wrong half the time. It was.
   */
  every = false,
): string {
  /*
   * Four keys and no English. The English branches that used to sit beside
   * them chose their own plural — "1 week" / "2 weeks" — which is a rule that
   * belongs to English and to nothing else; the dictionaries answer with
   * `Intl.PluralRules`, which is why Arabic gets six forms and Japanese one.
   */
  if (days % 7 === 0) {
    return t(every ? "common.everyWeeks" : "common.weeks", { count: days / 7 });
  }
  return t(every ? "common.everyDays" : "common.days", { count: days });
}

/**
 * A number with at most two decimals, punctuated the way the reader's language
 * punctuates numbers.
 *
 * `String(8.86)` is "8.86" in every locale, which put a full stop in the middle
 * of a French sentence full of commas. `numberLocale()` is the one the language
 * selector set — see `domain/currency.ts` — so this agrees with every other
 * figure on the page.
 */
function trim(value: number): string {
  const rounded = Number.isInteger(value) ? value : Math.round(value * 100) / 100;
  return rounded.toLocaleString(numberLocale(), { maximumFractionDigits: 2 });
}

/**
 * True when the monthly figure for this activity is an **average** rather than
 * a charge that lands monthly.
 *
 * An annual subscription divided by twelve, and a session pack accrued month by
 * month, are both useful for comparing commitments and both wrong as a
 * description of when money leaves. Every place that prints a monthly figure
 * asks this so the label can say "avg." — the difference between a budgeting
 * average and a bill the user starts looking for.
 */
export function isAveragedMonthly(activity: Activity): boolean {
  const model = activity.costModel ?? "auto";
  if (model === "fixedYearly" || model === "sessionPack") return true;
  // The historical inference divides a yearly estimate by twelve too.
  return model === "auto" && activity.recurrenceType === "yearly";
}
