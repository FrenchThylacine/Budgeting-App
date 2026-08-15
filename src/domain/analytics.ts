import type {
  BudgetCategory,
  BudgetSnapshot,
  PeriodSummary,
  Settings,
  SpendingEntry,
} from "./types";
import { normalizeAmount } from "./currency";
import { normalizeEntry } from "./calculations";
import { movePeriod, periodLabel, selectedIsoWeekYear } from "./periods";
import { weekYear, weeksInIsoYear, startOfIsoWeek } from "./dates";

/**
 * Shared, period-aware analytics selectors.
 *
 * Both the Dashboard and the dedicated Analytics page derive their figures
 * from these helpers so the two surfaces can never disagree. All helpers
 * follow the project's financial rules:
 *  - 0 is a real value and is never treated as missing;
 *  - periods without recorded entries yield `null` totals (missing ≠ 0);
 *  - piloting spend stays visible but is excluded from category share %.
 */

// ─── Period filtering ────────────────────────────────────────────────────────

/** All spending entries that fall inside the globally selected period. */
export function entriesForSelectedPeriod(snapshot: BudgetSnapshot, settings: Settings): SpendingEntry[] {
  const mode = settings.selectedPeriodMode ?? "month";
  const allEntries = Object.values(snapshot.years).flatMap((yr) => yr.spendingEntries);
  if (mode === "week") {
    const isoYear = selectedIsoWeekYear(settings);
    return allEntries.filter(
      (e) => e.week === settings.selectedWeek && weekYear(new Date(`${e.date}T12:00:00`)) === isoYear,
    );
  }
  if (mode === "year") {
    return allEntries.filter((e) => e.year === settings.selectedYear);
  }
  return allEntries.filter(
    (e) => e.year === settings.selectedYear && e.month === settings.selectedMonth,
  );
}

/** Entries counted against the personal budget (honours ignoreNonBudgetSpending). */
export function budgetRelevantEntries(entries: SpendingEntry[], settings: Settings): SpendingEntry[] {
  if (!settings.ignoreNonBudgetSpending) return entries;
  return entries.filter((e) => (e.source ?? "personal") === "personal");
}

// ─── Period geometry (for pacing / projections) ──────────────────────────────

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export interface PeriodWindow {
  /** Total number of days in the selected period. */
  totalDays: number;
  /** Days already elapsed (1..totalDays inside the period, totalDays once past, 0 before it starts). */
  elapsedDays: number;
}

/** Day counts for the selected period, used for daily averages and projections. */
export function selectedPeriodWindow(settings: Settings, now = new Date()): PeriodWindow {
  const mode = settings.selectedPeriodMode ?? "month";
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  let startUtc: number;
  let totalDays: number;
  if (mode === "week") {
    const start = startOfIsoWeek(selectedIsoWeekYear(settings), settings.selectedWeek);
    startUtc = start.getTime();
    totalDays = 7;
  } else if (mode === "year") {
    startUtc = Date.UTC(settings.selectedYear, 0, 1);
    totalDays = isLeapYear(settings.selectedYear) ? 366 : 365;
  } else {
    startUtc = Date.UTC(settings.selectedYear, settings.selectedMonth - 1, 1);
    totalDays = daysInMonth(settings.selectedYear, settings.selectedMonth);
  }

  const dayMs = 86400000;
  const elapsed = Math.floor((todayUtc - startUtc) / dayMs) + 1;
  return {
    totalDays,
    elapsedDays: Math.min(Math.max(elapsed, 0), totalDays),
  };
}

// ─── Spending statistics ─────────────────────────────────────────────────────

const RECURRING_TYPES = new Set(["weekly", "monthly", "yearly", "session"]);

export interface SpendingStats {
  /** Total spend in base currency; null when the period has no recorded entries. */
  total: number | null;
  count: number;
  average: number | null;
  median: number | null;
  largest: number | null;
  recurringTotal: number;
  oneOffTotal: number;
  recurringCount: number;
  oneOffCount: number;
  /** Share of recurring spend as % of total (null when total is 0 or missing). */
  recurringShare: number | null;
}

export function spendingStats(entries: SpendingEntry[], snapshot: BudgetSnapshot): SpendingStats {
  if (entries.length === 0) {
    return {
      total: null,
      count: 0,
      average: null,
      median: null,
      largest: null,
      recurringTotal: 0,
      oneOffTotal: 0,
      recurringCount: 0,
      oneOffCount: 0,
      recurringShare: null,
    };
  }

  const amounts = entries.map((e) => normalizeEntry(e, snapshot));
  const total = amounts.reduce((s, v) => s + v, 0);
  const sorted = [...amounts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  let recurringTotal = 0;
  let oneOffTotal = 0;
  let recurringCount = 0;
  let oneOffCount = 0;
  entries.forEach((e, i) => {
    if (RECURRING_TYPES.has(e.recurrenceType)) {
      recurringTotal += amounts[i];
      recurringCount += 1;
    } else {
      oneOffTotal += amounts[i];
      oneOffCount += 1;
    }
  });

  return {
    total,
    count: entries.length,
    average: total / entries.length,
    median,
    largest: sorted[sorted.length - 1],
    recurringTotal,
    oneOffTotal,
    recurringCount,
    oneOffCount,
    recurringShare: total > 0 ? (recurringTotal / total) * 100 : null,
  };
}

// ─── Budget pacing (month mode) ──────────────────────────────────────────────

export interface BudgetPacing {
  budget: number;
  spent: number;
  remaining: number;
  /** % of budget consumed. */
  utilisation: number | null;
  /** Average spend per elapsed day. */
  dailyAverage: number | null;
  /** Projected total spend at the current pace. */
  projectedTotal: number | null;
  /** Projected remaining budget at end of period (negative = overspend). */
  projectedRemaining: number | null;
  /** Max spend per remaining day to finish exactly on budget. */
  requiredDailyPace: number | null;
  daysLeft: number;
}

/**
 * Budget pacing for the selected month. Returns null outside month mode —
 * the app's budget is defined monthly, so weekly/yearly views have no
 * authoritative budget figure to pace against.
 */
export function budgetPacing(
  snapshot: BudgetSnapshot,
  entries: SpendingEntry[],
  now = new Date(),
): BudgetPacing | null {
  const settings = snapshot.settings;
  if ((settings.selectedPeriodMode ?? "month") !== "month") return null;

  const budget = normalizeAmount(settings.monthlyBudget, settings.monthlyBudgetCurrency, settings);
  if (!(budget > 0)) return null;

  const spent = entries.reduce((s, e) => s + normalizeEntry(e, snapshot), 0);
  const remaining = budget - spent;
  const { totalDays, elapsedDays } = selectedPeriodWindow(settings, now);
  const daysLeft = Math.max(totalDays - elapsedDays, 0);

  const dailyAverage = elapsedDays > 0 ? spent / elapsedDays : null;
  const projectedTotal = dailyAverage != null ? dailyAverage * totalDays : null;

  return {
    budget,
    spent,
    remaining,
    utilisation: (spent / budget) * 100,
    dailyAverage,
    projectedTotal,
    projectedRemaining: projectedTotal != null ? budget - projectedTotal : null,
    requiredDailyPace: daysLeft > 0 ? Math.max(remaining, 0) / daysLeft : null,
    daysLeft,
  };
}

// ─── Category breakdown ──────────────────────────────────────────────────────

export interface CategoryStat {
  category: BudgetCategory | undefined;
  categoryId: string;
  total: number;
  count: number;
  /** % of non-piloting spend; null for piloting categories (excluded from shares). */
  share: number | null;
}

export function categoryBreakdown(entries: SpendingEntry[], snapshot: BudgetSnapshot): CategoryStat[] {
  const categoryMap = new Map(snapshot.categories.map((c) => [c.id, c]));
  const totals = new Map<string, { total: number; count: number }>();
  for (const e of entries) {
    const current = totals.get(e.categoryId) ?? { total: 0, count: 0 };
    current.total += normalizeEntry(e, snapshot);
    current.count += 1;
    totals.set(e.categoryId, current);
  }

  const stats = [...totals.entries()].map(([categoryId, { total, count }]) => ({
    category: categoryMap.get(categoryId),
    categoryId,
    total,
    count,
  }));

  const normalTotal = stats
    .filter((s) => s.category?.bucket !== "piloting")
    .reduce((sum, s) => sum + s.total, 0);

  return stats
    .map((s) => ({
      ...s,
      share:
        s.category?.bucket === "piloting" || normalTotal <= 0
          ? null
          : (s.total / normalTotal) * 100,
    }))
    .sort((a, b) => b.total - a.total);
}

// ─── Period-over-period comparison ───────────────────────────────────────────

export interface PeriodComparison {
  currentTotal: number | null;
  previousTotal: number | null;
  previousLabel: string;
  /** % change vs the previous period; null when either side is missing or previous is 0. */
  deltaPct: number | null;
  /** Absolute change; null when either side is missing. */
  deltaAbs: number | null;
}

/**
 * Compare the selected period's spend against the immediately preceding
 * period of the same mode. Periods with no recorded entries stay `null`
 * (missing data is never coerced to zero).
 */
export function periodComparison(
  snapshot: BudgetSnapshot,
  settings: Settings,
): PeriodComparison {
  const previousSettings: Settings = { ...settings, ...movePeriod(settings, -1) };

  const currentEntries = budgetRelevantEntries(entriesForSelectedPeriod(snapshot, settings), settings);
  const previousEntries = budgetRelevantEntries(entriesForSelectedPeriod(snapshot, previousSettings), settings);

  const currentTotal =
    currentEntries.length > 0
      ? currentEntries.reduce((s, e) => s + normalizeEntry(e, snapshot), 0)
      : null;
  const previousTotal =
    previousEntries.length > 0
      ? previousEntries.reduce((s, e) => s + normalizeEntry(e, snapshot), 0)
      : null;

  const comparable = currentTotal != null && previousTotal != null;
  return {
    currentTotal,
    previousTotal,
    previousLabel: periodLabel(previousSettings),
    deltaAbs: comparable ? currentTotal - previousTotal : null,
    deltaPct: comparable && previousTotal !== 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : null,
  };
}

// ─── Trend chart windows ─────────────────────────────────────────────────────

export interface TrendBar {
  label: string;
  value: number | null;
  highlight: boolean;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function summaryValue(summary: PeriodSummary): number | null {
  return summary.status === "value" || summary.status === "zero" ? summary.total ?? 0 : null;
}

/** 12 monthly bars for the selected calendar year, highlighting the selected month. */
export function monthlyTrendBars(monthlyTrend: PeriodSummary[], selectedMonth: number): TrendBar[] {
  return monthlyTrend.map((summary, i) => ({
    label: SHORT_MONTHS[i] ?? String(i + 1),
    value: summaryValue(summary),
    highlight: i + 1 === selectedMonth,
  }));
}

/**
 * A window of weekly bars that always contains the selected week (previous
 * implementations always showed weeks 1..N and hid the selected week for
 * most of the year).
 */
export function weeklyTrendBars(
  weeklyTrend: PeriodSummary[],
  selectedWeek: number,
  windowSize = 12,
): TrendBar[] {
  const totalWeeks = weeklyTrend.length;
  if (totalWeeks === 0) return [];
  const size = Math.min(windowSize, totalWeeks);
  // Try to place the selected week near the end of the window so recent
  // history leads up to it.
  let start = selectedWeek - size + 2;
  start = Math.max(1, Math.min(start, totalWeeks - size + 1));
  return weeklyTrend.slice(start - 1, start - 1 + size).map((summary, i) => {
    const week = start + i;
    return {
      label: `W${week}`,
      value: summaryValue(summary),
      highlight: week === selectedWeek,
    };
  });
}

/** Number of ISO weeks in the selected week-year (needed by weekly windows). */
export function weeksInSelectedWeekYear(settings: Settings): number {
  return weeksInIsoYear(selectedIsoWeekYear(settings));
}
