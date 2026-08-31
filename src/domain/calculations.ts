import { monthName, weeksInIsoYear, isMonthClosed, isWeekClosed } from "./dates";
import { normalizeAmount, roundAmount } from "./currency";
import { monthlyEstimateFromSchedule, yearlyEstimateFromSchedule } from "./schedule";
import { fixedYearlyAmount, sessionsInMonth, sessionsInYear, installmentTotal, installmentPlanMonths } from "./payments";
import { findSeedCategory } from "./seedCategories";
import { monthlyBudgetPlan, walletState } from "./wallet";
import {
  activityFundingKind,
  externalEntries,
  otherFundedEntries,
  outsideBudgetEntries,
  personalEntries,
} from "./funding";
import type {
  Activity,
  ActivityEstimate,
  BudgetBucket,
  BudgetCategory,
  BudgetSnapshot,
  CategoryTotal,
  PeriodSummary,
  SpendingEntry,
  WalletEntry,
  WalletSummary,
  WishlistItem,
  WishlistSummary,
  YearCalculation,
  YearRecord,
} from "./types";

export function calculateYear(snapshot: BudgetSnapshot, now = new Date()): YearCalculation {
  const year = snapshot.settings.selectedYear;
  const month = snapshot.settings.selectedMonth;
  const week = snapshot.settings.selectedWeek;
  const record = snapshot.years[String(year)] ?? emptyYearRecord(year, now.toISOString());

  const activityEstimates = record.activities
    .filter((activity) => activity.active)
    .map((activity) => estimateActivity(activity, snapshot))
    .sort((a, b) => a.activity.order - b.activity.order);

  /*
   * The gross cost of everything, whoever pays for it.
   *
   * This used to be split into "general" and "piloting" by the category's
   * bucket, with a setting deciding whether the second half counted. That
   * assumed every budget has a piloting category, gave one category powers no
   * other category had, and answered a question — "what does flying cost me" —
   * that the activity list already answers for any category. Whether an
   * activity costs *this* budget anything is decided by its funding, which is
   * a property every activity has.
   */
  const combinedBudget = sum(activityEstimates.map((item) => item.monthlyBase));
  /*
   * What the personal budget actually has to carry.
   *
   * Only activities funded "paid by me" consume it: an activity somebody else
   * pays for, or one the user keeps outside this budget, costs real money and
   * costs *this budget* nothing. It was the gross figure before, which
   * overstated the commitment by everything a parent, a club or an employer
   * was paying for.
   */
  const personalEstimates = activityEstimates.filter((item) => item.funding === "personal");
  const includedBudget = sum(personalEstimates.map((item) => item.monthlyBase));
  const monthlyBudgetBase = normalizeAmount(
    snapshot.settings.monthlyBudget,
    snapshot.settings.monthlyBudgetCurrency,
    snapshot.settings,
  );

  const monthlyTrend = Array.from({ length: 12 }, (_, index) =>
    summarizeMonth(record.spendingEntries, snapshot, year, index + 1, now),
  );
  const weeklyTrend = Array.from({ length: weeksInIsoYear(year) }, (_, index) =>
    summarizeWeek(record.spendingEntries, snapshot, year, index + 1, now),
  );
  const selectedMonthSpend = monthlyTrend[month - 1] ?? summarizeMonth([], snapshot, year, month, now);
  const selectedWeekSpend = weeklyTrend[week - 1] ?? summarizeWeek([], snapshot, year, week, now);
  const selectedSpendValue = selectedMonthSpend.total ?? 0;
  const canCalculateDelta = selectedMonthSpend.status === "value" || selectedMonthSpend.status === "zero";
  const delta = canCalculateDelta ? monthlyBudgetBase - selectedSpendValue : null;

  return {
    year,
    month,
    week,
    monthlyBudgetBase,
    combinedBudget,
    includedBudget,
    selectedMonthSpend,
    selectedWeekSpend,
    // Personal-budget figures. Externally funded spend is reported separately
    // below rather than folded in — see domain/funding.ts.
    totalSpend: sum(personalEntries(record.spendingEntries).map((entry) => normalizeEntry(entry, snapshot))),
    externalSpend: sum(externalEntries(record.spendingEntries).map((entry) => normalizeEntry(entry, snapshot))),
    // Paid-by-other and outside-budget behave identically against the budget
    // and are two different facts, so both are reported. See domain/funding.ts.
    otherFundedSpend: sum(otherFundedEntries(record.spendingEntries).map((entry) => normalizeEntry(entry, snapshot))),
    outsideBudgetSpend: sum(outsideBudgetEntries(record.spendingEntries).map((entry) => normalizeEntry(entry, snapshot))),
    delta,
    rolloverDelta: delta,
    roundedMonthlyValue: roundAmount(includedBudget, snapshot.settings.roundingRule),
    wallet: summarizeWallet(snapshot),
    wishlist: summarizeWishlist(record.wishlistItems, snapshot),
    ytdTotal: sum(
      personalEntries(record.spendingEntries)
        .filter((entry) => entry.month <= month)
        .map((entry) => normalizeEntry(entry, snapshot)),
    ),
    externalYtdTotal: sum(
      externalEntries(record.spendingEntries)
        .filter((entry) => entry.month <= month)
        .map((entry) => normalizeEntry(entry, snapshot)),
    ),
    otherFundedYtdTotal: sum(
      otherFundedEntries(record.spendingEntries)
        .filter((entry) => entry.month <= month)
        .map((entry) => normalizeEntry(entry, snapshot)),
    ),
    outsideBudgetYtdTotal: sum(
      outsideBudgetEntries(record.spendingEntries)
        .filter((entry) => entry.month <= month)
        .map((entry) => normalizeEntry(entry, snapshot)),
    ),
    activityEstimates,
    monthlyTrend,
    weeklyTrend,
  };
}

/**
 * The calendar month an estimate is asked about. Schedule-driven activities
 * cost different amounts in different months, so the month is an input rather
 * than an assumption.
 */
export interface EstimatePeriod {
  year: number;
  month: number;
}

export function estimateActivity(
  activity: Activity,
  snapshot: BudgetSnapshot,
  period?: EstimatePeriod,
): ActivityEstimate {
  const category = snapshot.categories.find((item) => item.id === activity.categoryId);
  const bucket = category?.bucket ?? "general";
  // Estimates describe the period the user is looking at, not today.
  const reference = period ?? {
    year: snapshot.settings.selectedYear,
    month: snapshot.settings.selectedMonth,
  };
  const monthlyNative = monthlyEstimateNative(activity, reference);
  const yearlyNative = yearlyEstimateNative(activity, monthlyNative, reference);

  return {
    activity,
    monthlyBase: normalizeAmount(monthlyNative, activity.currency, snapshot.settings),
    yearlyBase: normalizeAmount(yearlyNative, activity.currency, snapshot.settings),
    bucket,
    funding: activityFundingKind(activity),
  };
}

/**
 * Monthly cost in the activity's own currency.
 *
 * `costModel` selects the maths:
 *  - `perSession`: price per session × sessions per month.
 *  - `schedule`  : price per session × the occurrences that really fall in the
 *                  given month.
 *  - `fixed`     : the explicit monthly amount.
 *  - `sessionPack`: price per session × the sessions that fall in the month.
 *                  **The payment cycle is deliberately absent from this
 *                  figure.** Paying for ten sessions at a time changes when
 *                  money leaves, not what the commitment costs per month, and
 *                  a budget compares monthly costs. The payments themselves are
 *                  a separate dated series — see `domain/payments.ts`.
 *  - `fixedYearly`: the annual amount divided by twelve. An **average**, never
 *                  a monthly charge; every caller that displays it says so, and
 *                  no monthly payment event is generated anywhere.
 *  - `auto`      : the historical inference, kept byte-for-byte. Activities
 *                  saved before cost models existed have no `costModel` and so
 *                  land here, unchanged.
 */
export function monthlyEstimateNative(activity: Activity, period: EstimatePeriod = currentPeriod()): number {
  if (!activity.active) return 0;
  switch (activity.costModel ?? "auto") {
    case "perSession":
      return (activity.pricePerSession ?? 0) * (activity.sessionsPerMonth ?? 0);
    case "schedule":
      return monthlyEstimateFromSchedule(activity, period.year, period.month) ?? 0;
    case "fixed":
      return activity.pricePerMonth ?? 0;
    case "sessionPack": {
      const sessions = sessionsInMonth(activity, period.year, period.month);
      if (sessions == null || activity.pricePerSession == null) return 0;
      return activity.pricePerSession * sessions;
    }
    case "fixedYearly":
      return (fixedYearlyAmount(activity) ?? 0) / 12;
    case "installments": {
      /*
       * The plan spread over the months it actually runs for.
       *
       * A monthly *accrual*, which is what this function produces everywhere —
       * it is what the row prints as "avg/mo" and it is never a payment. What
       * a given month genuinely requires comes from `dueInMonth`, which reads
       * the real instalment dates; a plan of three payments demands one of them
       * in three months and nothing in the other nine.
       *
       * Divided by the plan's own length rather than by twelve: six monthly
       * payments of €500 is €500 a month for half a year, not €250 a month for
       * a year that does not exist.
       */
      const total = installmentTotal(activity);
      const months = installmentPlanMonths(activity);
      if (total == null || months == null || months <= 0) return 0;
      return total / months;
    }
    case "auto":
    default:
      return autoMonthlyEstimate(activity);
  }
}

export function yearlyEstimateNative(
  activity: Activity,
  monthlyNative = monthlyEstimateNative(activity),
  period: EstimatePeriod = currentPeriod(),
): number {
  if (!activity.active) return 0;
  switch (activity.costModel ?? "auto") {
    case "schedule":
      // Twelve real months. A weekday schedule does not repeat evenly, so
      // multiplying one month by twelve would be wrong by up to a month's cost.
      return yearlyEstimateFromSchedule(activity, period.year) ?? 0;
    case "sessionPack": {
      // The year's real sessions, not one month multiplied by twelve: with
      // weekdays set those differ by up to a month's worth, and the whole point
      // of counting sessions is that they are counted.
      const sessions = sessionsInYear(activity, period.year);
      if (sessions == null || activity.pricePerSession == null) return 0;
      return activity.pricePerSession * sessions;
    }
    case "fixedYearly":
      // The stated annual amount, unchanged. Deriving it from the monthly
      // average would round a real payment through a division and a
      // multiplication for no reason.
      return fixedYearlyAmount(activity) ?? 0;
    case "installments":
      /*
       * The whole plan, not a year of it.
       *
       * "Yearly" is the wrong word for an instalment plan and the right figure
       * is the one somebody means when they say what the activity costs: the
       * total. A €3,000 licence paid in three instalments costs €3,000, whether
       * the payments fall inside one year or across two — and reporting a
       * twelve-month slice of it would invent an annual commitment that ends.
       */
      return installmentTotal(activity) ?? 0;
    case "perSession":
    case "fixed":
      return monthlyNative * 12;
    case "auto":
    default:
      if (activity.yearlyEstimate != null) return activity.yearlyEstimate;
      if (activity.recurrenceType === "purchase") return activity.pricePerPurchase ?? activity.estimatedCost ?? 0;
      return monthlyNative * 12;
  }
}

/** The pre-cost-model inference, preserved exactly as it always behaved. */
function autoMonthlyEstimate(activity: Activity): number {
  if (activity.pricePerMonth != null) return activity.pricePerMonth;
  switch (activity.recurrenceType) {
    case "weekly":
      return (activity.pricePerSession ?? activity.estimatedCost ?? 0) * activity.recurrenceInterval * 4;
    case "monthly":
      return (activity.estimatedCost ?? activity.pricePerPurchase ?? activity.pricePerSession ?? 0) * activity.recurrenceInterval;
    case "yearly":
      return (activity.yearlyEstimate ?? activity.estimatedCost ?? 0) / 12;
    case "session":
      return (activity.pricePerSession ?? 0) * activity.recurrenceInterval;
    case "custom":
      return activity.estimatedCost ?? 0;
    case "purchase":
    case "none":
    default:
      return 0;
  }
}

function currentPeriod(now = new Date()): EstimatePeriod {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function summarizeMonth(
  entries: SpendingEntry[],
  snapshot: BudgetSnapshot,
  year: number,
  month: number,
  now = new Date(),
): PeriodSummary {
  const monthEntries = entries.filter((entry) => entry.year === year && entry.month === month);
  return summarizePeriod({
    entries: monthEntries,
    snapshot,
    year,
    month,
    label: monthName(month),
    isClosed: isMonthClosed(year, month, now),
  });
}

export function summarizeWeek(
  entries: SpendingEntry[],
  snapshot: BudgetSnapshot,
  year: number,
  week: number,
  now = new Date(),
): PeriodSummary {
  const weekEntries = entries.filter((entry) => entry.year === year && entry.week === week);
  return summarizePeriod({
    entries: weekEntries,
    snapshot,
    year,
    week,
    label: `Week ${week}`,
    isClosed: isWeekClosed(year, week, now),
  });
}

export function normalizeEntry(entry: SpendingEntry | WalletEntry, snapshot: BudgetSnapshot): number {
  return normalizeAmount(entry.amount, entry.currency, snapshot.settings);
}

export function summarizeWishlist(items: WishlistItem[], snapshot: BudgetSnapshot): WishlistSummary {
  const activeItems = items.filter((item) => item.active && item.inWishlist && !item.bought);
  const boughtItems = items.filter((item) => item.bought);
  return {
    activeTotal: sum(activeItems.map((item) => normalizeAmount(item.actualPrice, item.currency, snapshot.settings))),
    boughtTotal: sum(boughtItems.map((item) => normalizeAmount(item.actualPrice, item.currency, snapshot.settings))),
    historyTotal: sum(items.map((item) => normalizeAmount(item.actualPrice, item.currency, snapshot.settings))),
    activeCount: activeItems.length,
    boughtCount: boughtItems.length,
  };
}

/**
 * The three balances, from the whole ledger.
 *
 * Takes the snapshot rather than one year's entries because a treasury does
 * not restart in January: the money in a wallet on 1 January is the money that
 * was in it on 31 December. Every figure is derived — see `domain/wallet.ts`
 * for the model and for why nothing here is stored.
 */
export function summarizeWallet(snapshot: BudgetSnapshot): WalletSummary {
  const state = walletState(snapshot);
  const entries = Object.values(snapshot.years).flatMap((record) => record.walletEntries ?? []);
  const totalOf = (predicate: (entry: WalletEntry) => boolean) =>
    sum(entries.filter(predicate).map((entry) => normalizeEntry(entry, snapshot)));

  return {
    walletTotal: state.walletBalance,
    budgetRemaining: state.budgetRemaining,
    personalBalance: state.personalBalance,
    rolloverTotal: totalOf((entry) => entry.type === "rollover"),
    openingBalance: totalOf((entry) => entry.type === "opening"),
    allocatedTotal: state.allocatedTotal,
    budgetSpent: state.budgetSpent,
  };
}

export function calculateRolloverDelta(snapshot: BudgetSnapshot, year: number, month: number, now = new Date()): number | null {
  const record = snapshot.years[String(year)];
  if (!record) return null;
  const summary = summarizeMonth(record.spendingEntries, snapshot, year, month, now);
  if (summary.status !== "value" && summary.status !== "zero") return null;
  const monthlyBudgetBase = normalizeAmount(
    snapshot.settings.monthlyBudget,
    snapshot.settings.monthlyBudgetCurrency,
    snapshot.settings,
  );
  return monthlyBudgetBase - (summary.total ?? 0);
}

/**
 * The month's suggested budget.
 *
 * Delegates to `monthlyBudgetPlan`, which is the single place the planning
 * arithmetic lives: the activity expenses genuinely required in this month,
 * from real payment dates, rounded up to the next hundred. This function used
 * to sum monthly *accruals* instead, which quietly averaged an annual
 * subscription across twelve months and so suggested a budget that was too
 * small in the month it renewed and too large in the other eleven.
 *
 * `recurringTotal` is kept in the returned shape — the dashboard's approval
 * card states it beside the suggestion — and is now the requirement rather
 * than the accrual.
 */
export function calculateSuggestedMonthlyBudget(snapshot: BudgetSnapshot): { recurringTotal: number; suggestedAmount: number } {
  const plan = monthlyBudgetPlan(snapshot);
  return { recurringTotal: plan.requirement, suggestedAmount: plan.suggested };
}

export function createNextYearRecord(snapshot: BudgetSnapshot, targetYear: number, now = new Date()): YearRecord {
  const timestamp = now.toISOString();
  const sourceYear = Math.max(
    ...Object.values(snapshot.years)
      .map((record) => record.year)
      .filter((year) => year < targetYear),
  );
  const source = snapshot.years[String(sourceYear)] ?? emptyYearRecord(targetYear - 1, timestamp);
  const wishlistItems = snapshot.settings.autoWishlistFlushEnabled
    ? source.wishlistItems.filter((item) => item.active && item.inWishlist && !item.bought)
    : source.wishlistItems;

  return {
    year: targetYear,
    activities: source.activities.map((activity) => ({ ...activity })),
    spendingEntries: [],
    wishlistItems: wishlistItems.map((item) => ({
      ...item,
      id: `${item.id}-${targetYear}`,
      dateAdded: timestamp,
      datePurchased: undefined,
      bought: false,
      effectiveValue: item.actualPrice ?? 0,
    })),
    /*
     * No opening entry.
     *
     * A new year used to be given one, equal to the previous year's balance —
     * which was right while the wallet was a per-year figure and is a straight
     * double count now that it is a continuous ledger. The money in the wallet
     * on 1 January is the money that was in it on 31 December, and the ledger
     * already says so. See `domain/wallet.ts`.
     */
    walletEntries: [],
    closedMonths: [],
    monthlyNotes: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function emptyYearRecord(year: number, timestamp = new Date().toISOString()): YearRecord {
  return {
    year,
    activities: [],
    spendingEntries: [],
    wishlistItems: [],
    walletEntries: [],
    closedMonths: [],
    monthlyNotes: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Category totals for one month of a year record.
 *
 * This used to be computed inside `calculateYear` on every recalculation and
 * read by nothing: the dashboard, the analytics page and the reports all go
 * through `categoryBreakdown` in `domain/analytics.ts`, which is period-aware
 * and tracks caps. It is exported rather than deleted because it is the
 * cheapest correct answer when a caller already has a year record and wants
 * one month's totals, and because the funding rule below is worth having in
 * exactly one place.
 */
export function summarizeCategories(
  entries: SpendingEntry[],
  categories: BudgetCategory[],
  snapshot: BudgetSnapshot,
  selectedMonth: number,
): CategoryTotal[] {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const totals = new Map<string, number>();
  // Category totals are budget figures, so externally funded spend is out —
  // otherwise a €200 dinner someone else paid would show as €200 charged to
  // "Eating out" and blow through that category's cap.
  const filteredEntries = personalEntries(entries).filter((item) => item.month === selectedMonth);
  for (const entry of filteredEntries) {
    totals.set(entry.categoryId, (totals.get(entry.categoryId) ?? 0) + normalizeEntry(entry, snapshot));
  }
  return Array.from(totals.entries())
    .map(([categoryId, total]) => {
      const category = categoryMap.get(categoryId) ?? findSeedCategory(categories, "cat-spending");
      return {
        categoryId,
        categoryName: category?.name ?? "Uncategorized",
        bucket: category?.bucket ?? "general",
        color: category?.color ?? "#64748B",
        total,
      };
    })
    .sort((a, b) => b.total - a.total);
}

function summarizePeriod({
  entries,
  snapshot,
  year,
  month,
  week,
  label,
  isClosed,
}: {
  entries: SpendingEntry[];
  snapshot: BudgetSnapshot;
  year: number;
  month?: number;
  week?: number;
  label: string;
  isClosed: boolean;
}): PeriodSummary {
  if (entries.length === 0) {
    return {
      label,
      year,
      month,
      week,
      status: isClosed ? "nan" : "pending",
      total: null,
      personalTotal: null,
      externalTotal: null,
      otherFundedTotal: null,
      outsideBudgetTotal: null,
      transactionTotal: null,
      externalCount: 0,
      otherFundedCount: 0,
      outsideBudgetCount: 0,
      entryCount: 0,
      isClosed,
    };
  }

  // `total` is the personal-budget figure, and only that. Money somebody else
  // paid is kept in full below, never added to this.
  const budgetEntries = personalEntries(entries);
  const externallyFunded = externalEntries(entries);
  const otherFunded = otherFundedEntries(entries);
  const outsideBudget = outsideBudgetEntries(entries);

  const total = sum(budgetEntries.map((entry) => normalizeEntry(entry, snapshot)));

  const externalTotal = sum(externallyFunded.map((entry) => normalizeEntry(entry, snapshot)));
  // Reported apart, never merged: "somebody else paid" and "I keep this off
  // this budget" answer different questions in every report and statistic.
  const otherFundedTotal = sum(otherFunded.map((entry) => normalizeEntry(entry, snapshot)));
  const outsideBudgetTotal = sum(outsideBudget.map((entry) => normalizeEntry(entry, snapshot)));

  return {
    label,
    year,
    month,
    week,
    status: total === 0 ? "zero" : "value",
    total,
    // The same number as `total`, named for the split display. Kept distinct so
    // a reader of `personalTotal` never has to know that `total` means the same
    // thing.
    personalTotal: total,
    externalTotal,
    otherFundedTotal,
    outsideBudgetTotal,
    transactionTotal: total + externalTotal,
    externalCount: externallyFunded.length,
    otherFundedCount: otherFunded.length,
    outsideBudgetCount: outsideBudget.length,
    entryCount: entries.length,
    isClosed,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}
