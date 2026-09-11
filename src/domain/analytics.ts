import type {
  BudgetCategory,
  BudgetSnapshot,
  PeriodSummary,
  Settings,
  SpendingEntry,
} from "./types";
import { normalizeAmount } from "./currency";
import { normalizeEntry } from "./calculations";
import { externalEntries, otherFundedEntries, outsideBudgetEntries, personalEntries } from "./funding";
import { movePeriod, periodLabel, selectedIsoWeekYear } from "./periods";
import { dateInputValue, weekYear, weeksInIsoYear, startOfIsoWeek } from "./dates";
import { activityBudgetSummary } from "./activityBudget";

/**
 * Shared, period-aware analytics selectors.
 *
 * Both the Dashboard and the dedicated Analytics page derive their figures
 * from these helpers so the two surfaces can never disagree. All helpers
 * follow the project's financial rules:
 *  - 0 is a real value and is never treated as missing;
 *  - periods without recorded entries yield `null` totals (missing ≠ 0);
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

/**
 * Entries counted against the personal budget.
 *
 * Externally funded spending is excluded unconditionally — see
 * `domain/funding.ts` for why this is a rule rather than a preference. The
 * `settings` argument is kept so every call site reads the same and so the
 * signature does not churn; it is deliberately unused.
 */
export function budgetRelevantEntries(entries: SpendingEntry[], _settings?: Settings): SpendingEntry[] {
  return personalEntries(entries);
}

export interface FundingSplit {
  /** Spend charged to this budget. `null` when the period holds no entries at all. */
  personal: number | null;
  /**
   * Everything this budget did not pay for — paid-by-other **and**
   * outside-budget together. Kept for callers that only need the exclusion.
   */
  external: number | null;
  /** Spend somebody else paid for. `null` when there are none. */
  otherFunded: number | null;
  /** The user's own spend, deliberately kept outside this budget. */
  outsideBudget: number | null;
  /** Every transaction in the period, all three kinds together. */
  transactions: number | null;
  personalCount: number;
  externalCount: number;
  otherFundedCount: number;
  outsideBudgetCount: number;
}

/**
 * The funding breakdown of a set of entries.
 *
 * Four figures, because there are three ways something can be funded and one
 * gross total. The user needs them side by side to trust that a €200 dinner
 * somebody else paid for is both recorded *and* not charged to them — and to
 * see that separately from the €150 they spent from another account on
 * purpose. `external` is the two exclusions added together, for the callers
 * that genuinely only need "not mine".
 */
export function fundingSplit(entries: SpendingEntry[], snapshot: BudgetSnapshot): FundingSplit {
  const personal = personalEntries(entries);
  const external = externalEntries(entries);
  const otherFunded = otherFundedEntries(entries);
  const outsideBudget = outsideBudgetEntries(entries);
  const total = (list: SpendingEntry[]) => list.reduce((sum, entry) => sum + normalizeEntry(entry, snapshot), 0);
  return {
    personal: personal.length > 0 ? total(personal) : null,
    external: external.length > 0 ? total(external) : null,
    otherFunded: otherFunded.length > 0 ? total(otherFunded) : null,
    outsideBudget: outsideBudget.length > 0 ? total(outsideBudget) : null,
    transactions: entries.length > 0 ? total(entries) : null,
    personalCount: personal.length,
    externalCount: external.length,
    otherFundedCount: otherFunded.length,
    outsideBudgetCount: outsideBudget.length,
  };
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
 * Personal activity payments the schedule says fall later this month.
 *
 * Dated strictly after today, so a payment that has already been recorded is
 * counted once — in what has been spent — rather than twice. Activities with
 * no known payment date contribute nothing: the application does not invent a
 * date for them anywhere else and a projection is a poor place to start.
 */
function upcomingPersonalCharges(snapshot: BudgetSnapshot, now: Date): number {
  const settings = snapshot.settings;
  const summary = activityBudgetSummary(snapshot, settings.selectedYear, settings.selectedMonth);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  let total = 0;
  for (const item of summary.items) {
    if (item.funding !== "personal" || item.status !== "due" || item.dueBase == null) continue;
    if (!item.datesKnown || item.dueDates.length === 0) continue;
    const later = item.dueDates.filter((date) => date.getTime() > today).length;
    // The month's requirement is spread across the dates it names, so a pack
    // paid twice this month contributes half per remaining date.
    total += (item.dueBase / item.dueDates.length) * later;
  }
  return total;
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

  /*
   * Where the month is heading, from what is actually known about it
   * -----------------------------------------------------------------
   *
   * This used to be `spent ÷ elapsed × total`, which treats a budget as a tap
   * running at a steady rate. Two things make that wrong in opposite
   * directions on the same screen:
   *
   *  - **A recurring charge is an event, not a rate.** A €200 gym block paid
   *    on the 3rd is a fifth of the month's spending by the 4th, and
   *    extrapolating it says the reader is on course to pay it fifteen times.
   *    So recurring and activity-linked transactions are taken *out* of the
   *    rate: they have already happened, they are in `spent`, and they will
   *    not happen again this month at that cadence.
   *  - **A charge the application already knows is coming is not a guess.**
   *    An annual subscription renewing on the 28th is in the schedule, in the
   *    reader's own data, with a date on it. Straight-line pacing ignores it
   *    entirely and then reports a surprise on the 28th.
   *
   * So: what has been spent, plus the discretionary rate over the days that
   * remain, plus the payments the schedule says fall in those days. Only
   * *personal* charges are added — an activity somebody else pays for will not
   * touch this budget when it falls due — and only ones dated after today, so
   * a payment already recorded is counted once, in `spent`.
   */
  const discretionarySpent = entries
    .filter((entry) => !entry.activityId && (!entry.recurrenceType || entry.recurrenceType === "none"))
    .reduce((total, entry) => total + normalizeEntry(entry, snapshot), 0);
  const discretionaryRate = elapsedDays > 0 ? discretionarySpent / elapsedDays : 0;

  const upcoming = upcomingPersonalCharges(snapshot, now);
  const projectedTotal =
    elapsedDays > 0 ? spent + discretionaryRate * daysLeft + upcoming : null;

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
  /** % of the period's spend, or null when there is none to take a share of. */
  share: number | null;
  /**
   * The category's monthly cap in base currency, or null when none is set.
   * Caps are defined per month, so they only apply in month mode.
   */
  cap: number | null;
  /** Spend as a % of the cap; null when no cap applies. */
  capUsage: number | null;
  /** True when spending has exceeded the cap. */
  overCap: boolean;
}

/**
 * Category totals for a period, including cap tracking.
 *
 * `applyCaps` should be false for week and year views: a monthly cap cannot be
 * meaningfully compared against a week's or a year's spend, and pretending
 * otherwise would report a false breach.
 */
export function categoryBreakdown(
  entries: SpendingEntry[],
  snapshot: BudgetSnapshot,
  applyCaps = (snapshot.settings.selectedPeriodMode ?? "month") === "month",
): CategoryStat[] {
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

  /*
   * Every category takes a share of the same total.
   *
   * The `piloting` bucket used to be subtracted from the denominator and given
   * a null share, so one category was visible in the chart and absent from the
   * percentages — which is the only reason the shares needed a footnote
   * explaining why they did not add up. Piloting is a category like any other.
   */
  const normalTotal = stats.reduce((sum, s) => sum + s.total, 0);

  return stats
    .map((s) => {
      // A cap of 0 is a real limit ("spend nothing here"), so only a missing
      // cap disables tracking.
      const rawCap = s.category?.monthlyCap;
      const cap = applyCaps && rawCap != null && Number.isFinite(rawCap) ? rawCap : null;
      return {
        ...s,
        share: normalTotal <= 0 ? null : (s.total / normalTotal) * 100,
        cap,
        capUsage: cap != null && cap > 0 ? (s.total / cap) * 100 : cap === 0 ? (s.total > 0 ? 100 : 0) : null,
        overCap: cap != null && s.total > cap,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/**
 * Categories that have a cap set and are at or over it, for the selected
 * period. Drives the dashboard alert.
 */
export function categoriesOverCap(stats: CategoryStat[]): CategoryStat[] {
  return stats.filter((s) => s.overCap);
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
  /*
   * The reader's language, not the browser's.
   *
   * Omitting it hands `Intl` the browser locale, which is how an English
   * interface came to head a card "VS JUILLET 2026". The parameter is optional
   * only so the server and the tests can call this without a language; every
   * caller that has one passes it.
   */
  locale?: string,
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
    previousLabel: periodLabel(previousSettings, locale),
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

/**
 * The twelve short month names, supplied by the caller.
 *
 * They used to be a constant here — "Jan, Feb, Mar" — which put English under
 * every bar of the trend chart in every language. `useTranslation` already
 * exposes `monthNames("short")`, which asks `Intl` and so answers "janv." in
 * French and "ene." in Spanish, and the chart passes it in.
 */
export type ShortMonthNames = readonly string[];

/**
 * How this language marks a week number under a bar.
 *
 * "W28" is English. French writes *S28*, German *KW28* — and the chart used to
 * write W in all three. A function rather than a prefix, because where the
 * number goes is part of the answer.
 */
export type WeekAxisLabel = (week: number) => string;

function summaryValue(summary: PeriodSummary): number | null {
  return summary.status === "value" || summary.status === "zero" ? summary.total ?? 0 : null;
}

/** 12 monthly bars for the selected calendar year, highlighting the selected month. */
export function monthlyTrendBars(
  monthlyTrend: PeriodSummary[],
  selectedMonth: number,
  shortMonths: ShortMonthNames,
): TrendBar[] {
  return monthlyTrend.map((summary, i) => ({
    label: shortMonths[i] ?? String(i + 1),
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
  weekLabel: WeekAxisLabel,
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
      label: weekLabel(week),
      value: summaryValue(summary),
      highlight: week === selectedWeek,
    };
  });
}

/**
 * Compact period label for a chart axis, where the full one ("Week 28 · Jul
 * 6–Jul 12") is far too long to sit under a bar.
 *
 * The month names come from the caller for the same reason as everywhere else
 * in this file: `Intl` knows how to shorten a month in seventy languages and a
 * constant array of twelve English strings does not. The week form stays a
 * number with a marker, which is what a narrow axis has room for.
 */
function compactAxisLabel(
  settings: Settings,
  shortMonths: ShortMonthNames,
  weekLabel: WeekAxisLabel,
): string {
  const mode = settings.selectedPeriodMode ?? "month";
  if (mode === "year") return String(settings.selectedYear);
  if (mode === "week") return weekLabel(settings.selectedWeek);
  return shortMonths[settings.selectedMonth - 1] ?? String(settings.selectedMonth);
}

// ─── Daily calendar (heatmap source) ─────────────────────────────────────────

export interface DailySpendCell {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** Day of month, 1..31. */
  day: number;
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: number;
  /**
   * Base-currency spend for the day.
   *
   * `0` means "recorded, nothing spent" and is a real value. `null` means the
   * day is unknown: either the period holds no records at all, or the day has
   * not happened yet. The two must never be conflated.
   */
  value: number | null;
}

/**
 * Day-by-day totals for the selected period, ready for a calendar heatmap.
 *
 * Returns `null` in year mode: a 365-cell grid answers no question the
 * monthly trend does not answer better.
 */
export function dailySpendingCalendar(
  entries: SpendingEntry[],
  snapshot: BudgetSnapshot,
  settings: Settings,
  now = new Date(),
): DailySpendCell[] | null {
  const mode = settings.selectedPeriodMode ?? "month";
  if (mode === "year") return null;

  const days: Date[] = [];
  if (mode === "week") {
    const start = startOfIsoWeek(selectedIsoWeekYear(settings), settings.selectedWeek);
    for (let offset = 0; offset < 7; offset += 1) {
      const day = new Date(start);
      day.setUTCDate(start.getUTCDate() + offset);
      days.push(day);
    }
  } else {
    const total = daysInMonth(settings.selectedYear, settings.selectedMonth);
    for (let day = 1; day <= total; day += 1) {
      days.push(new Date(Date.UTC(settings.selectedYear, settings.selectedMonth - 1, day)));
    }
  }

  // A period with no records at all stays unknown end to end — a wall of
  // zeroes would claim the user spent nothing, which is not what we know.
  const hasRecords = entries.length > 0;

  const totals = new Map<string, number>();
  for (const entry of entries) {
    const key = (entry.date ?? "").slice(0, 10);
    if (key.length !== 10) continue;
    totals.set(key, (totals.get(key) ?? 0) + normalizeEntry(entry, snapshot));
  }

  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  return days.map((date) => {
    const key = dateInputValue(date);
    const recorded = totals.get(key);
    const elapsed = date.getTime() <= todayUtc;
    return {
      date: key,
      day: date.getUTCDate(),
      // getUTCDay() is 0 = Sunday; ISO weekdays run 1 = Monday … 7 = Sunday.
      weekday: ((date.getUTCDay() + 6) % 7) + 1,
      value: recorded != null ? recorded : hasRecords && elapsed ? 0 : null,
    };
  });
}

// ─── Category evolution (multi-line) ─────────────────────────────────────────

export interface CategoryMonthlySeries {
  categoryId: string;
  name: string;
  color: string;
  /** One value per calendar month; `null` where that month holds no records. */
  values: (number | null)[];
  /** Year-to-date total, used to rank the series. */
  total: number;
}

/**
 * Monthly totals for the biggest categories of the selected calendar year.
 *
 * A month with records but no spend in a given category is a real `0` for
 * that category; a month with no records at all stays `null` for every
 * category, so the lines break instead of dropping to the axis.
 */
export function categoryMonthlySeries(
  snapshot: BudgetSnapshot,
  settings: Settings,
  shortMonths: ShortMonthNames,
  topN = 4,
): { labels: string[]; series: CategoryMonthlySeries[] } {
  const record = snapshot.years[String(settings.selectedYear)];
  const entries = budgetRelevantEntries(record?.spendingEntries ?? [], settings);

  const monthHasRecords = new Array<boolean>(12).fill(false);
  const monthly = new Map<string, number[]>();
  const yearTotals = new Map<string, number>();

  for (const entry of entries) {
    const index = entry.month - 1;
    if (index < 0 || index > 11) continue;
    monthHasRecords[index] = true;
    const amount = normalizeEntry(entry, snapshot);
    const slots = monthly.get(entry.categoryId) ?? new Array<number>(12).fill(0);
    slots[index] += amount;
    monthly.set(entry.categoryId, slots);
    yearTotals.set(entry.categoryId, (yearTotals.get(entry.categoryId) ?? 0) + amount);
  }

  const categoryMap = new Map(snapshot.categories.map((category) => [category.id, category]));
  const series = [...yearTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(0, Math.floor(topN)))
    .map(([categoryId, total]) => {
      const slots = monthly.get(categoryId) ?? new Array<number>(12).fill(0);
      const category = categoryMap.get(categoryId);
      return {
        categoryId,
        name: category?.name ?? "Uncategorized",
        color: category?.color ?? "#64748B",
        total,
        values: monthHasRecords.map((hasRecords, index) => (hasRecords ? slots[index] : null)),
      };
    });

  return { labels: [...shortMonths], series };
}

// ─── Recurring vs one-off over time ──────────────────────────────────────────

export interface RecurringSplitSeries {
  labels: string[];
  /** Committed spend (weekly / monthly / yearly / session) per month. */
  recurring: (number | null)[];
  /** Discretionary spend per month. */
  oneOff: (number | null)[];
  /**
   * The selected month's committed spend, for a headline figure.
   * `null` when that month has no records — missing is not zero.
   */
  committedMonthly: number | null;
}

/**
 * Monthly recurring / one-off split for the selected calendar year, for the
 * stacked view of how much of each month was already committed.
 *
 * Months without records stay `null` on both series so the column renders as
 * "?" rather than as an empty (zero-looking) stack.
 */
export function recurringMonthlySplit(
  snapshot: BudgetSnapshot,
  settings: Settings,
  shortMonths: ShortMonthNames,
): RecurringSplitSeries {
  const record = snapshot.years[String(settings.selectedYear)];
  const entries = budgetRelevantEntries(record?.spendingEntries ?? [], settings);

  const recurring = new Array<number>(12).fill(0);
  const oneOff = new Array<number>(12).fill(0);
  const hasRecords = new Array<boolean>(12).fill(false);

  for (const entry of entries) {
    const index = entry.month - 1;
    if (index < 0 || index > 11) continue;
    hasRecords[index] = true;
    const amount = normalizeEntry(entry, snapshot);
    if (RECURRING_TYPES.has(entry.recurrenceType)) recurring[index] += amount;
    else oneOff[index] += amount;
  }

  const selectedIndex = settings.selectedMonth - 1;
  return {
    labels: [...shortMonths],
    recurring: hasRecords.map((has, index) => (has ? recurring[index] : null)),
    oneOff: hasRecords.map((has, index) => (has ? oneOff[index] : null)),
    committedMonthly:
      selectedIndex >= 0 && selectedIndex < 12 && hasRecords[selectedIndex] ? recurring[selectedIndex] : null,
  };
}

// ─── Recent periods (comparison bars) ────────────────────────────────────────

/**
 * Totals for the last `count` periods of the current mode, ending on the
 * selected one. Periods without records stay `null` so the chart shows a "?"
 * instead of a zero-height bar.
 */
export function recentPeriodTotals(
  snapshot: BudgetSnapshot,
  settings: Settings,
  shortMonths: ShortMonthNames,
  weekLabel: WeekAxisLabel,
  count = 6,
): TrendBar[] {
  const size = Math.max(1, Math.floor(count));
  const walk: Settings[] = [settings];
  let cursor = settings;
  for (let step = 1; step < size; step += 1) {
    cursor = { ...cursor, ...movePeriod(cursor, -1) };
    walk.push(cursor);
  }
  walk.reverse();

  return walk.map((periodSettings, index) => {
    const entries = budgetRelevantEntries(entriesForSelectedPeriod(snapshot, periodSettings), settings);
    return {
      label: compactAxisLabel(periodSettings, shortMonths, weekLabel),
      value: entries.length > 0 ? entries.reduce((sum, e) => sum + normalizeEntry(e, snapshot), 0) : null,
      highlight: index === walk.length - 1,
    };
  });
}

// ─── Cumulative spend & forecast ─────────────────────────────────────────────

export interface ForecastSeries {
  /** Day-of-period labels. */
  labels: string[];
  /** Cumulative actual spend; `null` for days that are not yet known. */
  actual: (number | null)[];
  /**
   * Straight-line projection at the current pace, starting from the last
   * known day so the two lines meet. `null` everywhere else, and empty when
   * the period is already complete — there is nothing left to project.
   */
  projected: (number | null)[];
  /** Projected end-of-period total, or `null` when the period is complete. */
  projectedTotal: number | null;
  /** Budget ceiling in base currency; `null` when no monthly budget applies. */
  budget: number | null;
}

/**
 * Cumulative spend for the selected period plus a pace-based projection to
 * its end — the "actual → projected → ceiling" view.
 *
 * Returns `null` when there is nothing to draw (year mode, or a period with
 * no records at all).
 */
export function cumulativeForecast(
  entries: SpendingEntry[],
  snapshot: BudgetSnapshot,
  settings: Settings,
  now = new Date(),
): ForecastSeries | null {
  const calendar = dailySpendingCalendar(entries, snapshot, settings, now);
  if (!calendar || calendar.every((cell) => cell.value == null)) return null;

  let running = 0;
  let lastKnown = -1;
  const actual = calendar.map((cell, index) => {
    if (cell.value == null) return null;
    running += cell.value;
    lastKnown = index;
    return running;
  });

  const total = calendar.length;
  const elapsed = lastKnown + 1;
  const projected = new Array<number | null>(total).fill(null);
  let projectedTotal: number | null = null;

  if (lastKnown >= 0 && elapsed < total) {
    const perDay = running / elapsed;
    projectedTotal = perDay * total;
    for (let index = lastKnown; index < total; index += 1) {
      projected[index] = running + perDay * (index - lastKnown);
    }
  }

  const mode = settings.selectedPeriodMode ?? "month";
  const budgetBase =
    mode === "month" ? normalizeAmount(settings.monthlyBudget, settings.monthlyBudgetCurrency, settings) : 0;

  return {
    labels: calendar.map((cell) => String(cell.day)),
    actual,
    projected,
    projectedTotal,
    budget: budgetBase > 0 ? budgetBase : null,
  };
}

// ─── Financial health score ──────────────────────────────────────────────────

export interface HealthFactor {
  id: string;
  /**
   * Translation key for the factor's name, not the name.
   *
   * This module is a leaf and has no translator; it also feeds the printed
   * report, which is written in the reader's language rather than in the
   * interface's. Returning keys is what lets both resolve the same fact in
   * their own language, and is why `detailParams` carries the numbers instead
   * of a sentence with the numbers already baked into it.
   */
  labelKey: string;
  /** 0–100 for this factor alone. */
  score: number;
  /** Relative importance within the composite. */
  weight: number;
  detailKey?: string;
  detailParams?: Record<string, string | number>;
}

/** A stable identifier for the grade band, never a word shown to anybody. */
export type HealthGrade = "excellent" | "good" | "fair" | "at-risk";

export interface FinancialHealth {
  /** 0–100, or `null` when nothing measurable is available for the period. */
  score: number | null;
  grade: HealthGrade | null;
  /** Only the factors that could actually be computed. */
  factors: HealthFactor[];
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Composite 0–100 health score for the selected period.
 *
 * Takes already-derived figures rather than the snapshot so it stays pure and
 * cheap. Only computable factors contribute, and the weights are renormalised
 * over them — a period without a budget is scored on what is known, never on
 * an invented budget of zero. When nothing is computable the score is `null`,
 * not 0.
 */
export function financialHealth(input: {
  pacing: BudgetPacing | null;
  categories: CategoryStat[];
  comparison: PeriodComparison;
  stats: SpendingStats;
}): FinancialHealth {
  const { pacing, categories, comparison, stats } = input;
  const factors: HealthFactor[] = [];

  // `budgetPacing` reports spend 0 for a period with no records at all, which
  // would score a blank period as perfect adherence. A period we know nothing
  // about is not a well-run one, so it earns no factor.
  if (pacing != null && pacing.budget > 0 && stats.total != null) {
    // Pace matters more than the snapshot: mid-month, the projection is the
    // honest signal of where this period lands.
    const projected = pacing.projectedTotal ?? pacing.spent;
    const ratio = projected / pacing.budget;
    const score =
      ratio <= 0.8
        ? 100
        : ratio <= 1
        ? 100 - ((ratio - 0.8) / 0.2) * 25
        : ratio >= 1.3
        ? 0
        : 75 - ((ratio - 1) / 0.3) * 75;
    factors.push({
      id: "budget",
      labelKey: "health.budget",
      weight: 40,
      score: clampScore(score),
      detailKey: "health.budget.detail",
      detailParams: { percent: Math.round(ratio * 100) },
    });
  }

  const capped = categories.filter((category) => category.capUsage != null);
  if (capped.length > 0) {
    const scores = capped.map((category) => clampScore(100 - Math.max(0, (category.capUsage as number) - 100) * 2));
    const breaches = capped.filter((category) => category.overCap).length;
    factors.push({
      id: "caps",
      labelKey: "health.caps",
      weight: 20,
      score: scores.reduce((sum, value) => sum + value, 0) / scores.length,
      detailKey: breaches === 0 ? "health.caps.respected" : "health.caps.exceeded",
      detailParams: { count: breaches === 0 ? capped.length : breaches, total: capped.length },
    });
  }

  if (comparison.deltaPct != null) {
    factors.push({
      id: "trend",
      labelKey: "health.trend",
      weight: 20,
      score: clampScore(100 - Math.max(0, comparison.deltaPct) * 2),
      detailKey: "health.trend.detail",
      detailParams: {
        // The sign is part of the fact and is carried here rather than by the
        // sentence, so a language that puts it elsewhere still gets it.
        change: `${comparison.deltaPct > 0 ? "+" : ""}${comparison.deltaPct.toFixed(1)}%`,
        period: comparison.previousLabel,
      },
    });
  }

  if (stats.recurringShare != null) {
    // A period dominated by commitments leaves little room to react.
    factors.push({
      id: "flexibility",
      labelKey: "health.flexibility",
      weight: 20,
      score: clampScore(((90 - stats.recurringShare) / 50) * 100),
      detailKey: "health.flexibility.detail",
      detailParams: { percent: Math.round(stats.recurringShare) },
    });
  }

  if (factors.length === 0) return { score: null, grade: null, factors };

  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const score = Math.round(
    factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0) / totalWeight,
  );

  return {
    score,
    /*
     * A stable identifier, not a word.
     *
     * It used to be the English adjective, which meant a French dashboard read
     * "Excellent" (by luck) and a German one read "Fair" (by accident). It is
     * also a lookup key for the colour, and a lookup key that changes with the
     * interface language is a colour that stops working when the language does.
     */
    grade: score >= 85 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "fair" : "at-risk",
    factors,
  };
}

// ─── Which currencies the money was actually in ──────────────────────────────

/**
 * One currency's share of what was spent.
 *
 * The same distinction the wallet makes, for the same reason: **`amount` is the
 * fact and `converted` is a lens.** Somebody who paid ‎$120 and €80 did not
 * spend "€190.45 in two currencies" — they spent a hundred and twenty dollars
 * and eighty euros, and the euro figure exists only so the two can be put on
 * one bar next to each other.
 *
 * `count` is here because a distribution without it misleads in a specific way:
 * one $2,000 flight and forty €12 lunches make dollars look like the currency
 * this budget lives in, and they are not.
 */
export interface CurrencySlice {
  currency: string;
  /** Spent in that currency, exactly as recorded. Never converted. */
  amount: number;
  /** The same total in the display currency, for comparison only. */
  converted: number;
  /** Its share of the converted total, 0–100, or null when the total is zero. */
  share: number | null;
  /** How many transactions were recorded in it. */
  count: number;
}

/**
 * What was spent, grouped by the currency it was spent in.
 *
 * Ordered by converted value so the largest reads first, which is the only
 * ordering that survives a budget with nine currencies. A currency with a zero
 * total is still listed if anything was recorded in it: zero is a real value
 * here, and "you recorded three things in yen and they came to nothing" is
 * information, while a missing row is not.
 */
export function currencyDistribution(entries: SpendingEntry[], snapshot: BudgetSnapshot): CurrencySlice[] {
  const totals = new Map<string, { amount: number; count: number }>();
  for (const entry of entries) {
    const currency = entry.currency ?? snapshot.settings.baseCurrency;
    const running = totals.get(currency) ?? { amount: 0, count: 0 };
    // Accumulated in the entry's own currency: this is the number the reader
    // typed, and it stays that number.
    running.amount += entry.amount ?? 0;
    running.count += 1;
    totals.set(currency, running);
  }

  const slices = [...totals.entries()].map(([currency, { amount, count }]) => ({
    currency,
    amount,
    converted: normalizeAmount(amount, currency as never, snapshot.settings),
    share: null as number | null,
    count,
  }));

  const total = slices.reduce((sum, slice) => sum + slice.converted, 0);
  for (const slice of slices) slice.share = total === 0 ? null : (slice.converted / total) * 100;
  return slices.sort((a, b) => b.converted - a.converted || a.currency.localeCompare(b.currency));
}
