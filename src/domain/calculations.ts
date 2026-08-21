import { monthName, weeksInIsoYear, isMonthClosed, isWeekClosed } from "./dates";
import { normalizeAmount, roundAmount } from "./currency";
import { monthlyEstimateFromSchedule, yearlyEstimateFromSchedule } from "./schedule";
import { findSeedCategory } from "./seedCategories";
import { externalEntries, personalEntries } from "./funding";
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

  const generalBudget = sum(activityEstimates.filter((item) => item.bucket !== "piloting").map((item) => item.monthlyBase));
  const pilotingBudget = sum(activityEstimates.filter((item) => item.bucket === "piloting").map((item) => item.monthlyBase));
  const combinedBudget = generalBudget + pilotingBudget;
  const includedBudget = snapshot.settings.pilotIncludedInBudget ? combinedBudget : generalBudget;
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
    generalBudget,
    pilotingBudget,
    combinedBudget,
    includedBudget,
    selectedMonthSpend,
    selectedWeekSpend,
    // Personal-budget figures. Externally funded spend is reported separately
    // below rather than folded in — see domain/funding.ts.
    totalSpend: sum(personalEntries(record.spendingEntries).map((entry) => normalizeEntry(entry, snapshot))),
    externalSpend: sum(externalEntries(record.spendingEntries).map((entry) => normalizeEntry(entry, snapshot))),
    delta,
    rolloverDelta: delta,
    roundedMonthlyValue: roundAmount(includedBudget, snapshot.settings.roundingRule),
    wallet: summarizeWallet(record.walletEntries, snapshot),
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

export function summarizeWallet(entries: WalletEntry[], snapshot: BudgetSnapshot): WalletSummary {
  const opening = entries.filter((entry) => entry.type === "opening");
  const personal = entries.filter((entry) => entry.type !== "budget");
  const rollover = entries.filter((entry) => entry.type === "rollover");
  return {
    walletTotal: sum(entries.map((entry) => normalizeEntry(entry, snapshot))),
    personalWalletTotal: sum(personal.map((entry) => normalizeEntry(entry, snapshot))),
    rolloverTotal: sum(rollover.map((entry) => normalizeEntry(entry, snapshot))),
    openingBalance: sum(opening.map((entry) => normalizeEntry(entry, snapshot))),
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

export function calculateSuggestedMonthlyBudget(snapshot: BudgetSnapshot): { recurringTotal: number; suggestedAmount: number } {
  const record = snapshot.years[String(snapshot.settings.selectedYear)] ?? emptyYearRecord(snapshot.settings.selectedYear);
  const categoryMap = new Map(snapshot.categories.map((category) => [category.id, category]));
  const recurringTotal = sum(
    record.activities
      .filter((activity) => activity.active && activity.visible)
      .filter((activity) => activity.recurrenceType !== "none" && activity.recurrenceType !== "purchase")
      .filter((activity) => categoryMap.get(activity.categoryId)?.bucket !== "piloting")
      .map((activity) => estimateActivity(activity, snapshot).monthlyBase),
  );
  return {
    recurringTotal,
    suggestedAmount: Math.ceil(recurringTotal / 100) * 100,
  };
}

export function createNextYearRecord(snapshot: BudgetSnapshot, targetYear: number, now = new Date()): YearRecord {
  const timestamp = now.toISOString();
  const sourceYear = Math.max(
    ...Object.values(snapshot.years)
      .map((record) => record.year)
      .filter((year) => year < targetYear),
  );
  const source = snapshot.years[String(sourceYear)] ?? emptyYearRecord(targetYear - 1, timestamp);
  const wallet = summarizeWallet(source.walletEntries, snapshot);
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
    walletEntries: [
      {
        id: `wallet-opening-${targetYear}`,
        year: targetYear,
        month: 1,
        amount: wallet.personalWalletTotal,
        currency: snapshot.settings.baseCurrency,
        source: `Opening from ${source.year}`,
        type: "opening",
        note: "Generated when switching into a new year. Prior year remains untouched.",
        createdAt: timestamp,
      },
    ],
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
      generalTotal: null,
      pilotingTotal: null,
      personalTotal: null,
      externalTotal: null,
      transactionTotal: null,
      externalCount: 0,
      entryCount: 0,
      isClosed,
    };
  }

  // `total` is the personal-budget figure, and only that. Money somebody else
  // paid is kept in full below, never added to this.
  const budgetEntries = personalEntries(entries);
  const externallyFunded = externalEntries(entries);

  const generalEntries = budgetEntries.filter((entry) => !entry.isPiloting);
  const pilotingEntries = budgetEntries.filter((entry) => entry.isPiloting);
  const generalTotal = sum(generalEntries.map((entry) => normalizeEntry(entry, snapshot)));
  const pilotingTotal = sum(pilotingEntries.map((entry) => normalizeEntry(entry, snapshot)));
  const total = generalTotal + pilotingTotal;

  const externalTotal = sum(externallyFunded.map((entry) => normalizeEntry(entry, snapshot)));

  return {
    label,
    year,
    month,
    week,
    status: total === 0 ? "zero" : "value",
    total,
    generalTotal,
    pilotingTotal,
    // The same number as `total`, named for the split display. Kept distinct so
    // a reader of `personalTotal` never has to know that `total` means the same
    // thing.
    personalTotal: total,
    externalTotal,
    transactionTotal: total + externalTotal,
    externalCount: externallyFunded.length,
    entryCount: entries.length,
    isClosed,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}
