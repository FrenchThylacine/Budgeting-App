/**
 * What activities cost, and what they cost *this month*
 * =====================================================
 *
 * Two questions that sound like one and are not:
 *
 *  - **What does this commitment cost per month?** An accrual. €60 a year is
 *    €5 a month for the purpose of comparing it against a €12 subscription.
 *    That figure is the existing `monthlyEstimateNative`, and nothing here
 *    changes it.
 *
 *  - **How much money do I actually need in September?** A cash requirement.
 *    If Navigraph renews in September, September needs the whole €81.64 and
 *    the other eleven months need none of it. Dividing by twelve answers the
 *    first question and is simply wrong as an answer to the second.
 *
 * This module answers the second one, and it answers it from the schedule the
 * activity really carries — `domain/payments.ts` for the two payment-cycle
 * models, `domain/schedule.ts` for weekday and day-of-month rules. Where the
 * activity does not carry enough information to place a payment on a calendar,
 * the answer is **`unknown`**, never a month picked for it. An invented
 * renewal month is a figure the user never entered presented with the same
 * authority as one they did.
 *
 * Everything is expressed on the existing cost models. There is no second
 * arithmetic for what an activity costs, and in particular no "monthly × 12"
 * anywhere: `yearlyEstimateNative` already sums twelve real months for a
 * schedule and returns the stated annual amount for a yearly charge.
 */
import { estimateActivity, monthlyEstimateNative, yearlyEstimateNative } from "./calculations";
import { normalizeAmount } from "./currency";
import { activityFundingKind, FUNDING_KINDS, type FundingKind } from "./funding";
import { fixedYearlyAmount, paymentBaseline, paymentsBetween } from "./payments";
import { daysInMonth, hasSchedule, monthlyEstimateFromSchedule, occurrenceDatesInMonth, parseLocalDate } from "./schedule";
import type { Activity, BudgetSnapshot } from "./types";

/**
 * Whether a payment for this activity falls in the month being asked about.
 *
 *  - `due`     : it does, and this is how much.
 *  - `not-due` : it does not. A real, confident zero.
 *  - `unknown` : the activity costs money on some cadence the app cannot place
 *                on a calendar, because nobody has told it when. Not zero, and
 *                emphatically not "put it in this month".
 */
export type DueStatus = "due" | "not-due" | "unknown";

export interface ActivityMonthCost {
  activity: Activity;
  funding: FundingKind;
  /** The monthly accrual, in the activity's own currency. */
  monthlyNative: number;
  /** The yearly total from the real schedule, in the activity's own currency. */
  yearlyNative: number;
  /** The same two, converted to the display currency for totalling. */
  monthlyBase: number;
  yearlyBase: number;
  /** What this month genuinely requires, in the display currency. */
  dueBase: number | null;
  /** The same figure in the activity's own currency. */
  dueNative: number | null;
  status: DueStatus;
  /**
   * The dates the payments fall on, when the activity states them.
   *
   * Empty with `status: "due"` is a real case and an honest one: a fixed
   * monthly cost is due every month without naming a day. `datesKnown` says
   * which it is, so the interface can print "on the 14th" or stay silent
   * rather than inventing a day of the month.
   */
  dueDates: Date[];
  datesKnown: boolean;
  /**
   * Why the status is `unknown`, as a **translation key**.
   *
   * A sentence baked in here would print English inside every other language,
   * which is what it did. The caption resolves it through `t()`.
   */
  unknownReason?: string;
}

/** Totals across a set of activities, kept three ways plus the gross. */
export interface FundingTotals {
  personal: number;
  other: number;
  outside: number;
  /** Every activity, whoever funds it. `personal + other + outside`. */
  gross: number;
}

function emptyTotals(): FundingTotals {
  return { personal: 0, other: 0, outside: 0, gross: 0 };
}

function addTo(totals: FundingTotals, kind: FundingKind, amount: number): void {
  if (!Number.isFinite(amount)) return;
  totals[kind] += amount;
  totals.gross += amount;
}

export interface ActivityShare {
  activity: Activity;
  funding: FundingKind;
  yearlyBase: number;
  monthlyBase: number;
  /**
   * This activity's percentage of the **personal** yearly total, or null when
   * that total is zero — a share of nothing is not 0%, it is undefined.
   */
  share: number | null;
}

export interface ActivityBudgetSummary {
  /** One entry per active activity, in the order they are listed. */
  items: ActivityMonthCost[];
  /** Monthly accruals, split by who funds them. */
  monthly: FundingTotals;
  /** Yearly totals from the real schedules, split by who funds them. */
  yearly: FundingTotals;
  /**
   * What each funding kind actually requires **in this month**, from real
   * payment dates. Activities whose dates are unknown are excluded and
   * reported separately below — including them would be the exact error this
   * module exists to prevent.
   */
  requiredThisMonth: FundingTotals;
  /**
   * Activities that cost money on a cadence the app cannot place in a month.
   *
   * Listed rather than silently dropped, and never folded into
   * `requiredThisMonth`. The interface shows their monthly estimate and says
   * the exact month cannot be assigned.
   */
  unscheduled: ActivityMonthCost[];
  /** The unscheduled activities' monthly accrual, split by funding. */
  unscheduledMonthly: FundingTotals;
  /**
   * What the user's own year is made of: the activities **they** pay for,
   * largest first, each as a percentage of the personal yearly total.
   *
   * Activities somebody else pays for, and activities deliberately kept
   * outside this budget, are not in this list. They belong to the record and
   * to the funding split — but a chart headed "share of the yearly total"
   * answers *where does my money go*, and an activity that costs the user
   * nothing has no share of that. Including them once made a subscription a
   * parent pays look like a fifth of the user's spending.
   */
  shares: ActivityShare[];
  /** How many active activities are funded by somebody else or kept outside. */
  externallyFundedCount: number;
  /** Activities that exist but are switched off, for an honest empty state. */
  inactiveCount: number;
  year: number;
  month: number;
}

/**
 * What one activity costs, and what it requires in one specific month.
 *
 * The month is an input rather than an assumption: a schedule-driven activity
 * costs different amounts in different months, and a yearly one costs nothing
 * in eleven of them.
 */
export function activityMonthCost(
  activity: Activity,
  snapshot: BudgetSnapshot,
  year: number,
  month: number,
): ActivityMonthCost {
  const period = { year, month };
  const monthlyNative = monthlyEstimateNative(activity, period);
  const yearlyNative = yearlyEstimateNative(activity, monthlyNative, period);
  const funding = activityFundingKind(activity);

  const base = (value: number | null): number =>
    value == null ? 0 : normalizeAmount(value, activity.currency, snapshot.settings);

  const due = dueInMonth(activity, year, month, monthlyNative);

  return {
    activity,
    funding,
    monthlyNative,
    yearlyNative,
    monthlyBase: base(monthlyNative),
    yearlyBase: base(yearlyNative),
    dueNative: due.amountNative,
    dueBase: due.amountNative == null ? null : base(due.amountNative),
    status: due.status,
    dueDates: due.dates,
    datesKnown: due.datesKnown,
    unknownReason: due.reason,
  };
}

interface DueResult {
  status: DueStatus;
  /** In the activity's own currency. Null only when the status is `unknown`. */
  amountNative: number | null;
  dates: Date[];
  datesKnown: boolean;
  reason?: string;
}

const NOT_DUE: DueResult = { status: "not-due", amountNative: 0, dates: [], datesKnown: true };

/**
 * The cash a single activity requires in one calendar month.
 *
 * Every branch below answers from something the activity actually states. The
 * `unknown` branches are the point of the whole function: they are reached
 * precisely when the app would otherwise have to guess a month.
 */
function dueInMonth(activity: Activity, year: number, month: number, monthlyNative: number): DueResult {
  if (!activity.active) return NOT_DUE;

  const lastDay = daysInMonth(year, month);
  if (lastDay === 0) return NOT_DUE;
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month - 1, lastDay);

  const model = activity.costModel ?? "auto";

  // ── Models with a payment cycle of their own ──────────────────────────────
  //
  // `paymentsBetween` returns null for every other model, so this branch is
  // reached only by `fixedYearly` and `sessionPack`.
  const payments = paymentsBetween(activity, monthStart, monthEnd);
  if (payments) {
    if (!paymentBaseline(activity)) {
      return {
        status: "unknown",
        amountNative: null,
        dates: [],
        datesKnown: false,
        reason:
          model === "fixedYearly"
            ? "activities.unknown.noRenewalDate"
            : "activities.unknown.noFirstPayment",
      };
    }
    if (payments.length === 0) return { ...NOT_DUE, dates: [] };
    // A payment whose amount is not known is not a payment of zero.
    if (payments.some((payment) => payment.amountNative == null)) {
      return {
        status: "unknown",
        amountNative: null,
        dates: payments.map((payment) => payment.date),
        datesKnown: true,
        reason:
          model === "fixedYearly"
            ? "activities.unknown.yearlyAmountMissing"
            : "activities.unknown.paymentAmountMissing",
      };
    }
    return {
      status: "due",
      amountNative: payments.reduce((total, payment) => total + (payment.amountNative ?? 0), 0),
      dates: payments.map((payment) => payment.date),
      datesKnown: true,
    };
  }

  // ── A real weekday / day-of-month schedule ────────────────────────────────
  if (model === "schedule" || (model === "auto" && hasSchedule(activity))) {
    if (!hasSchedule(activity)) {
      return {
        status: "unknown",
        amountNative: null,
        dates: [],
        datesKnown: false,
        reason: "activities.unknown.noSchedule",
      };
    }
    const occurrences = occurrenceDatesInMonth(activity, year, month);
    const total = monthlyEstimateFromSchedule(activity, year, month);
    if (total == null) {
      return {
        status: "unknown",
        amountNative: null,
        dates: occurrences.map((occurrence) => occurrence.date),
        datesKnown: true,
        reason: "activities.unknown.occurrenceUnpriced",
      };
    }
    if (occurrences.length === 0) return { ...NOT_DUE, dates: [] };
    return {
      status: "due",
      amountNative: total,
      dates: occurrences.map((occurrence) => occurrence.date),
      datesKnown: true,
    };
  }

  // ── Cadences that genuinely fall every month ──────────────────────────────
  //
  // A fixed monthly cost, a per-session rate quoted per month, and a weekly or
  // session-based activity all require their money in *every* month. That is
  // not an average standing in for a charge: the money really does leave each
  // month. The day of the month may be unstated, which `datesKnown: false`
  // reports rather than inventing one.
  const everyMonth = (): DueResult => {
    const dayOfMonth = activity.dayOfMonth;
    const dates =
      dayOfMonth != null && dayOfMonth >= 1 && dayOfMonth <= lastDay ? [new Date(year, month - 1, dayOfMonth)] : [];
    return {
      status: monthlyNative === 0 ? "not-due" : "due",
      amountNative: monthlyNative,
      dates,
      datesKnown: dates.length > 0,
    };
  };

  if (model === "fixed" || model === "perSession") return everyMonth();

  // ── The automatic model, by recurrence type ───────────────────────────────
  switch (activity.recurrenceType) {
    case "yearly": {
      // An annual charge needs a real date and the app is not going to invent
      // one. `yearlyPaymentDates` is not used directly here because the
      // automatic model stores its amount in `yearlyEstimate`, which is what
      // `fixedYearlyAmount` reads.
      const baseline = paymentBaseline(activity);
      if (!baseline) {
        return {
          status: "unknown",
          amountNative: null,
          dates: [],
          datesKnown: false,
          reason: "activities.unknown.noRenewalDate",
        };
      }
      const dueDate = anniversaryIn(baseline, year, month);
      if (!dueDate) return { ...NOT_DUE, dates: [] };
      const amount = fixedYearlyAmount(activity);
      if (amount == null) {
        return {
          status: "unknown",
          amountNative: null,
          dates: [dueDate],
          datesKnown: true,
          reason: "activities.unknown.yearlyAmountMissing",
        };
      }
      return { status: "due", amountNative: amount, dates: [dueDate], datesKnown: true };
    }

    case "purchase": {
      // A one-off. It belongs to the month it happens in, and to no month at
      // all until somebody says when.
      const date = parseLocalDate(activity.nextRenewalDate) ?? parseLocalDate(activity.startDate);
      const amount = activity.pricePerPurchase ?? activity.estimatedCost;
      if (amount == null || amount === 0) return NOT_DUE;
      if (!date) {
        return {
          status: "unknown",
          amountNative: null,
          dates: [],
          datesKnown: false,
          reason: "activities.unknown.purchaseUndated",
        };
      }
      const inMonth = date.getFullYear() === year && date.getMonth() + 1 === month;
      return inMonth
        ? { status: "due", amountNative: amount, dates: [date], datesKnown: true }
        : { ...NOT_DUE, dates: [] };
    }

    case "none":
      return NOT_DUE;

    default:
      // weekly, monthly, session, custom — all quoted as a monthly commitment.
      return everyMonth();
  }
}

/** The same day of the year as `baseline`, if it falls in the given month. */
function anniversaryIn(baseline: Date, year: number, month: number): Date | null {
  if (baseline.getMonth() + 1 !== month) return null;
  // 29 February clamps to the 28th in a common year rather than rolling into
  // March, which is what every subscription service does with it.
  const day = Math.min(baseline.getDate(), daysInMonth(year, month));
  const candidate = new Date(year, month - 1, day);
  // A charge that started after this month had not begun yet.
  return candidate.getFullYear() < baseline.getFullYear() ? null : candidate;
}

/**
 * Every active activity, costed for one month, with the totals the Activities
 * tab and the reports both read.
 *
 * One function, one set of figures. The alternative — the panel summing one
 * way and the report another — is how two screens end up disagreeing about the
 * same budget.
 */
export function activityBudgetSummary(
  snapshot: BudgetSnapshot,
  year: number = snapshot.settings.selectedYear,
  month: number = snapshot.settings.selectedMonth,
): ActivityBudgetSummary {
  const record = snapshot.years[String(year)];
  const all = record?.activities ?? [];
  const active = all.filter((activity) => activity.active).sort((a, b) => a.order - b.order);

  const items = active.map((activity) => activityMonthCost(activity, snapshot, year, month));

  const monthly = emptyTotals();
  const yearly = emptyTotals();
  const requiredThisMonth = emptyTotals();
  const unscheduledMonthly = emptyTotals();
  const unscheduled: ActivityMonthCost[] = [];

  for (const item of items) {
    addTo(monthly, item.funding, item.monthlyBase);
    addTo(yearly, item.funding, item.yearlyBase);
    if (item.status === "unknown") {
      unscheduled.push(item);
      addTo(unscheduledMonthly, item.funding, item.monthlyBase);
      continue;
    }
    addTo(requiredThisMonth, item.funding, item.dueBase ?? 0);
  }

  // The denominator is the personal total, and the list is the personal
  // activities — the two have to agree, or the percentages describe a whole
  // that is not on screen.
  const personalYearly = yearly.personal;
  const shares: ActivityShare[] = items
    .filter((item) => item.funding === "personal")
    .map((item) => ({
      activity: item.activity,
      funding: item.funding,
      yearlyBase: item.yearlyBase,
      monthlyBase: item.monthlyBase,
      share: personalYearly > 0 ? (item.yearlyBase / personalYearly) * 100 : null,
    }))
    .sort((a, b) => b.yearlyBase - a.yearlyBase || a.activity.name.localeCompare(b.activity.name));

  return {
    items,
    monthly,
    yearly,
    requiredThisMonth,
    unscheduled,
    unscheduledMonthly,
    shares,
    externallyFundedCount: items.filter((item) => item.funding !== "personal").length,
    inactiveCount: all.length - active.length,
    year,
    month,
  };
}

/**
 * Percentage shares of a set of totals, guaranteed to sum to 100.
 *
 * Computed from the gross rather than from the sum of the three, so a rounding
 * artefact cannot make the parts add up to 99.9% of a whole they *are*. Null
 * where the whole is zero: a share of nothing is undefined, not 0%.
 */
export function fundingShares(totals: FundingTotals): Record<FundingKind, number | null> {
  const whole = totals.gross;
  const shares = {} as Record<FundingKind, number | null>;
  for (const kind of FUNDING_KINDS) {
    shares[kind] = whole > 0 ? (totals[kind] / whole) * 100 : null;
  }
  return shares;
}

