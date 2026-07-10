import { monthName, weeksInIsoYear, isMonthClosed, isWeekClosed } from "./dates";
import { normalizeAmount, roundAmount } from "./currency";
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
  const categoryMap = new Map(snapshot.categories.map((category) => [category.id, category]));

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
    totalSpend: sum(record.spendingEntries.map((entry) => normalizeEntry(entry, snapshot))),
    delta,
    rolloverDelta: delta,
    roundedMonthlyValue: roundAmount(includedBudget, snapshot.settings.roundingRule),
    wallet: summarizeWallet(record.walletEntries, snapshot),
    wishlist: summarizeWishlist(record.wishlistItems, snapshot),
    ytdTotal: sum(
      record.spendingEntries
        .filter((entry) => entry.month <= month)
        .map((entry) => normalizeEntry(entry, snapshot)),
    ),
    activityEstimates,
    categoryTotals: summarizeCategories(record.spendingEntries, snapshot.categories, categoryMap, snapshot, month),
    monthlyTrend,
    weeklyTrend,
  };
}

export function estimateActivity(activity: Activity, snapshot: BudgetSnapshot): ActivityEstimate {
  const category = snapshot.categories.find((item) => item.id === activity.categoryId);
  const bucket = category?.bucket ?? "general";
  const monthlyNative = monthlyEstimateNative(activity);
  const yearlyNative = yearlyEstimateNative(activity, monthlyNative);

  return {
    activity,
    monthlyBase: normalizeAmount(monthlyNative, activity.currency, snapshot.settings),
    yearlyBase: normalizeAmount(yearlyNative, activity.currency, snapshot.settings),
    bucket,
  };
}

export function monthlyEstimateNative(activity: Activity): number {
  if (!activity.active) return 0;
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

export function yearlyEstimateNative(activity: Activity, monthlyNative = monthlyEstimateNative(activity)): number {
  if (!activity.active) return 0;
  if (activity.yearlyEstimate != null) return activity.yearlyEstimate;
  if (activity.recurrenceType === "purchase") return activity.pricePerPurchase ?? activity.estimatedCost ?? 0;
  return monthlyNative * 12;
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

function summarizeCategories(
  entries: SpendingEntry[],
  categories: BudgetCategory[],
  categoryMap: Map<string, BudgetCategory>,
  snapshot: BudgetSnapshot,
  selectedMonth: number,
): CategoryTotal[] {
  const totals = new Map<string, number>();
  for (const entry of entries.filter((item) => item.month === selectedMonth)) {
    totals.set(entry.categoryId, (totals.get(entry.categoryId) ?? 0) + normalizeEntry(entry, snapshot));
  }
  return Array.from(totals.entries())
    .map(([categoryId, total]) => {
      const category = categoryMap.get(categoryId) ?? categories.find((item) => item.id === "cat-spending");
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
      entryCount: 0,
      isClosed,
    };
  }

  const generalEntries = entries.filter((entry) => !entry.isPiloting);
  const pilotingEntries = entries.filter((entry) => entry.isPiloting);
  const generalTotal = sum(generalEntries.map((entry) => normalizeEntry(entry, snapshot)));
  const pilotingTotal = sum(pilotingEntries.map((entry) => normalizeEntry(entry, snapshot)));
  const total = generalTotal + pilotingTotal;

  return {
    label,
    year,
    month,
    week,
    status: total === 0 ? "zero" : "value",
    total,
    generalTotal,
    pilotingTotal,
    entryCount: entries.length,
    isClosed,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}
