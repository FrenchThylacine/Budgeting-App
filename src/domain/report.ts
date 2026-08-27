import type { BudgetSnapshot, Settings } from "./types";
import { activityBudgetSummary, type FundingTotals } from "./activityBudget";
import { FUNDING_KINDS, FUNDING_META, type FundingKind } from "./funding";
import { monthName as monthNameOf } from "./dates";
import { en } from "../i18n/en";
import { calculateYear, normalizeEntry } from "./calculations";
import { formatMoney } from "./currency";
import { monthName } from "./dates";
import {
  budgetPacing,
  budgetRelevantEntries,
  categoryBreakdown,
  entriesForSelectedPeriod,
  financialHealth,
  fundingSplit,
  periodComparison,
  spendingStats,
  type CategoryStat,
} from "./analytics";

/**
 * Period report model.
 *
 * Built from the same shared analytics selectors as the screen, so a printed
 * report can never state a different number than the dashboard. Rendering is
 * kept separate (see `reportHtml`) so the data can also be tested on its own.
 */

export interface ReportSection {
  label: string;
  value: string;
  detail?: string;
}

/** One line of the funding breakdown. */
export interface FundingLine {
  kind: FundingKind;
  label: string;
  /** A non-colour mark, so the table survives a black-and-white printer. */
  glyph: string;
  amount: number | null;
  count: number;
  /** Percentage of the gross, or null when the gross is zero. */
  share: number | null;
}

/** One activity's contribution, for the report's activity table. */
export interface ActivityLine {
  name: string;
  category: string;
  funding: FundingKind;
  fundingLabel: string;
  glyph: string;
  monthly: number;
  yearly: number;
  share: number | null;
  /** What this month genuinely requires, or null when the date is unknown. */
  dueThisMonth: number | null;
  dueNote: string;
}

export interface PeriodReport {
  title: string;
  subtitle: string;
  generatedAt: string;
  currency: string;
  summary: ReportSection[];
  categories: CategoryStat[];
  monthly: { label: string; value: number | null }[];
  health: { score: number | null; grade: string | null; factors: { label: string; score: number; detail?: string }[] };
  /** Who funded the period's transactions, three ways plus the gross. */
  funding: { lines: FundingLine[]; gross: number | null };
  /** What the budget's activities cost, and what this month needs. */
  activities: {
    lines: ActivityLine[];
    monthly: FundingTotals;
    yearly: FundingTotals;
    requiredThisMonth: FundingTotals;
    unscheduled: number;
    monthLabel: string;
  };
  notes: string[];
}

/**
 * What a report covers.
 *
 * `month` and `year` follow the period currently selected in the app. A
 * `{ from, to }` range is a report the user asked for explicitly — a quarter,
 * a trip, the six weeks a renovation took — and is answered from the dates on
 * the transactions rather than from the period selector.
 */
export type ReportScope = "month" | "year" | CustomRange;

export interface CustomRange {
  /** Inclusive, YYYY-MM-DD. */
  from: string;
  /** Inclusive, YYYY-MM-DD. */
  to: string;
}

export function isCustomRange(scope: ReportScope): scope is CustomRange {
  return typeof scope === "object" && scope !== null;
}

/** Written form of a range, e.g. "1 Mar – 15 Apr 2026". */
function rangeTitle(range: CustomRange): string {
  const start = new Date(`${range.from}T12:00:00`);
  const end = new Date(`${range.to}T12:00:00`);
  const sameYear = start.getFullYear() === end.getFullYear();
  const startText = start.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const endText = end.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return `${startText} – ${endText}`;
}

/** Whole days between two ISO dates, inclusive of both ends. */
function inclusiveDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

/** The range of equal length immediately before this one, for comparison. */
function precedingRange(range: CustomRange): CustomRange {
  const length = inclusiveDays(range.from, range.to);
  const end = new Date(Date.parse(`${range.from}T00:00:00Z`) - 86_400_000);
  const start = new Date(end.getTime() - (length - 1) * 86_400_000);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return { from: iso(start), to: iso(end) };
}

/** Every transaction dated inside a range, across all years. */
function entriesInRange(snapshot: BudgetSnapshot, range: CustomRange) {
  return Object.values(snapshot.years)
    .flatMap((record) => record.spendingEntries)
    .filter((entry) => entry.date >= range.from && entry.date <= range.to);
}

export function buildPeriodReport(
  snapshot: BudgetSnapshot,
  scope: ReportScope,
  now = new Date(),
): PeriodReport {
  const custom = isCustomRange(scope) ? scope : null;
  const settings: Settings = {
    ...snapshot.settings,
    // A custom range is not a period mode. The month view is used only so the
    // helpers that need *some* mode have a defined one; every figure below
    // comes from the range's own entries.
    selectedPeriodMode: custom ? "month" : (scope as "month" | "year"),
  };
  const scoped: BudgetSnapshot = { ...snapshot, settings };

  const calc = calculateYear(scoped, now);
  const allEntries = custom ? entriesInRange(scoped, custom) : entriesForSelectedPeriod(scoped, settings);
  const entries = budgetRelevantEntries(allEntries, settings);
  const funding = fundingSplit(allEntries, scoped);
  const stats = spendingStats(entries, scoped);
  /*
   * No pacing for a custom range.
   *
   * The budget is defined per month. Prorating it across six weeks would
   * produce a "budget" the user never set and a "remaining" measured against
   * it — a fabricated figure presented with the same authority as a real one,
   * which is exactly what the project's rules forbid. The report says so
   * instead.
   */
  const pacing = custom ? null : budgetPacing(scoped, entries, now);
  const categories = categoryBreakdown(entries, scoped, custom ? false : undefined);
  const comparison = custom
    ? rangeComparison(scoped, custom)
    : periodComparison(scoped, settings);
  const health = financialHealth({ pacing, categories, comparison, stats });

  const money = (value: number | null | undefined) =>
    value == null || !Number.isFinite(value) ? "—" : formatMoney(value, settings.baseCurrency, settings.currencyDisplayMode);

  const title = custom
    ? rangeTitle(custom)
    : scope === "month"
      ? `${monthName(settings.selectedMonth)} ${settings.selectedYear}`
      : String(settings.selectedYear);

  const summary: ReportSection[] = [
    {
      label: "Total spending",
      value: stats.total != null ? money(stats.total) : "No data recorded",
      detail: funding.externalCount > 0 ? "Charged to your budget" : undefined,
    },
    { label: "Transactions", value: String(stats.count) },
    { label: "Average transaction", value: stats.average != null ? money(stats.average) : "—" },
    { label: "Largest transaction", value: stats.largest != null ? money(stats.largest) : "—" },
    { label: "Recurring", value: money(stats.recurringTotal), detail: stats.recurringShare != null ? `${stats.recurringShare.toFixed(1)}% of spend` : undefined },
    { label: "One-off", value: money(stats.oneOffTotal) },
  ];

  // Named only when there is something to name, so an ordinary month is not
  // padded with a line reading "—".
  if (funding.otherFundedCount > 0) {
    summary.push({
      label: "Paid by other",
      value: money(funding.otherFunded),
      detail: `${funding.otherFundedCount} transaction${funding.otherFundedCount === 1 ? "" : "s"}, never charged to you`,
    });
  }
  if (funding.outsideBudgetCount > 0) {
    summary.push({
      label: "Outside budget",
      value: money(funding.outsideBudget),
      detail: `${funding.outsideBudgetCount} transaction${
        funding.outsideBudgetCount === 1 ? "" : "s"
      }, your money kept off this budget`,
    });
  }
  if (funding.externalCount > 0) {
    summary.push({
      label: "All transactions",
      value: money(funding.transactions),
      detail: "Every kind of funding together",
    });
  }

  if (pacing) {
    summary.push(
      { label: "Budget", value: money(pacing.budget) },
      { label: "Remaining", value: money(pacing.remaining), detail: `${Math.round(pacing.utilisation ?? 0)}% used` },
    );
  }

  summary.push(
    // The three treasury figures, never collapsed into one. See domain/wallet.ts.
    { label: "Wallet balance", value: money(calc.wallet.walletTotal), detail: "Actual money held" },
    { label: "Remaining budget", value: money(calc.wallet.budgetRemaining), detail: "Budget money still available" },
    { label: "Personal balance", value: money(calc.wallet.personalBalance), detail: "Money outside the budget" },
    {
      label: `vs ${comparison.previousLabel}`,
      value: comparison.deltaAbs != null ? money(comparison.deltaAbs) : "No comparable data",
      detail: comparison.deltaPct != null ? `${comparison.deltaPct > 0 ? "+" : ""}${comparison.deltaPct.toFixed(1)}%` : undefined,
    },
  );

  const monthly = (custom
    ? calc.monthlyTrend.filter((_, index) => {
        const month = index + 1;
        const startMonth = Number(custom.from.slice(5, 7));
        const endMonth = Number(custom.to.slice(5, 7));
        const startYear = Number(custom.from.slice(0, 4));
        const endYear = Number(custom.to.slice(0, 4));
        // Only meaningful when the range sits inside one calendar year; a
        // range that crosses new year is shown in full rather than clipped to
        // a misleading slice of one of them.
        if (startYear !== endYear) return true;
        return month >= startMonth && month <= endMonth;
      })
    : calc.monthlyTrend
  ).map((period, index) => ({
    label: monthName(index + 1).slice(0, 3),
    // A month with no records stays null: the report must not print a
    // fabricated zero for a month we know nothing about.
    value: period.status === "value" || period.status === "zero" ? period.total ?? 0 : null,
  }));

  /*
   * The funding breakdown.
   *
   * Three lines and a gross, always in the same order, each carrying a glyph
   * as well as a colour — see the print rules in `reportHtml`. Reporting only
   * "external" would answer neither of the two questions the split exists for.
   */
  const fundingLines: FundingLine[] = FUNDING_KINDS.map((kind) => {
    const amount =
      kind === "personal" ? funding.personal : kind === "other" ? funding.otherFunded : funding.outsideBudget;
    const count =
      kind === "personal"
        ? funding.personalCount
        : kind === "other"
          ? funding.otherFundedCount
          : funding.outsideBudgetCount;
    const gross = funding.transactions ?? 0;
    return {
      kind,
      label: FUNDING_META[kind].label,
      glyph: FUNDING_META[kind].glyph,
      amount,
      count,
      share: gross > 0 && amount != null ? (amount / gross) * 100 : null,
    };
  });

  /*
   * Activity costs.
   *
   * Costed for the month the report covers, from the same module the
   * Activities tab reads. The "required this month" column is the point: it is
   * what actually falls due, not a twelfth of a year, and an activity whose
   * payment month is unknown carries a note saying so rather than a number.
   */
  const activityMonth = custom ? Number(custom.to.slice(5, 7)) : settings.selectedMonth;
  const activityYear = custom ? Number(custom.to.slice(0, 4)) : settings.selectedYear;
  const activitySummary = activityBudgetSummary(scoped, activityYear, activityMonth);
  const categoryNames = new Map(scoped.categories.map((category) => [category.id, category.name]));
  const activityShares = new Map(activitySummary.shares.map((share) => [share.activity.id, share.share]));
  const activityLines: ActivityLine[] = activitySummary.items.map((item) => ({
    name: item.activity.name,
    category: categoryNames.get(item.activity.categoryId) ?? "Uncategorized",
    funding: item.funding,
    fundingLabel: FUNDING_META[item.funding].shortLabel,
    glyph: FUNDING_META[item.funding].glyph,
    monthly: item.monthlyBase,
    yearly: item.yearlyBase,
    share: activityShares.get(item.activity.id) ?? null,
    dueThisMonth: item.status === "unknown" ? null : (item.dueBase ?? 0),
    /*
     * The report is written in English, so the reason **key** is resolved
     * against the English dictionary here. `unknownReason` is a key rather
     * than a sentence precisely so the *interface* can say it in the reader's
     * own language; printing the raw key would be the worst of both.
     */
    dueNote:
      item.status === "unknown"
        ? ((en as Record<string, string>)[item.unknownReason ?? ""] ?? "Payment month unknown")
        : item.status === "not-due"
          ? "Not due this month"
          : "Due this month",
  }));

  const notes: string[] = [];
  const overCap = categories.filter((c) => c.overCap);
  if (overCap.length > 0) {
    notes.push(
      `${overCap.length} categor${overCap.length === 1 ? "y" : "ies"} exceeded the monthly cap: ${overCap
        .map((c) => `${c.category?.name ?? "Uncategorized"} (${money(c.total - (c.cap ?? 0))} over)`)
        .join(", ")}.`,
    );
  }
  if (categories.some((c) => c.category?.bucket === "piloting")) {
    notes.push("Piloting is reported separately and is excluded from category share percentages.");
  }
  if (stats.total == null) {
    notes.push("No spending was recorded for this period. Missing data is reported as unavailable, not as zero.");
  }
  if (custom) {
    notes.push(
      "This is a custom range. Your budget is set per month, so there is no budget figure to measure a range against — prorating one would be a number you never chose. Category caps are reported as totals rather than as breaches for the same reason.",
    );
  }
  if (funding.otherFundedCount > 0) {
    notes.push(
      `${money(funding.otherFunded)} across ${funding.otherFundedCount} transaction${
        funding.otherFundedCount === 1 ? " was" : "s were"
      } paid by someone else. ${
        funding.otherFundedCount === 1 ? "It is" : "They are"
      } recorded at full value and excluded from the budget, so every figure above is what this budget actually spent.`,
    );
  }
  if (funding.outsideBudgetCount > 0) {
    notes.push(
      `${money(funding.outsideBudget)} across ${funding.outsideBudgetCount} transaction${
        funding.outsideBudgetCount === 1 ? " is" : "s are"
      } your own money kept outside this budget. Recorded in full, charged to nothing here, and reported separately from spending somebody else paid for — the two are not the same fact.`,
    );
  }
  if (activitySummary.unscheduled.length > 0) {
    notes.push(
      `${activitySummary.unscheduled.length} activit${
        activitySummary.unscheduled.length === 1 ? "y has" : "ies have"
      } no known payment date, so ${
        activitySummary.unscheduled.length === 1 ? "it is" : "they are"
      } excluded from "required in ${monthNameOf(activityMonth)}" rather than being assigned to a month nobody chose. ${
        activitySummary.unscheduled.map((item) => item.activity.name).join(", ")
      }.`,
    );
  }

  return {
    title,
    subtitle: custom
      ? `Report for ${inclusiveDays(custom.from, custom.to)} days`
      : scope === "month"
        ? "Monthly financial report"
        : "Annual financial report",
    generatedAt: now.toISOString(),
    currency: settings.baseCurrency,
    summary,
    categories,
    monthly,
    health: {
      score: health.score,
      grade: health.grade,
      factors: health.factors.map((f) => ({ label: f.label, score: f.score, detail: f.detail })),
    },
    funding: { lines: fundingLines, gross: funding.transactions },
    activities: {
      lines: activityLines,
      monthly: activitySummary.monthly,
      yearly: activitySummary.yearly,
      requiredThisMonth: activitySummary.requiredThisMonth,
      unscheduled: activitySummary.unscheduled.length,
      monthLabel: monthNameOf(activityMonth),
    },
    notes,
  };
}

/**
 * The same range, immediately before.
 *
 * A well-defined comparison for an arbitrary window: six weeks against the six
 * weeks before them. A range with no records on either side stays `null` on
 * that side — missing is not zero.
 */
function rangeComparison(snapshot: BudgetSnapshot, range: CustomRange) {
  const previous = precedingRange(range);
  const total = (window: CustomRange): number | null => {
    const found = budgetRelevantEntries(entriesInRange(snapshot, window), snapshot.settings);
    return found.length > 0 ? found.reduce((sum, entry) => sum + normalizeEntry(entry, snapshot), 0) : null;
  };
  const currentTotal = total(range);
  const previousTotal = total(previous);
  const comparable = currentTotal != null && previousTotal != null;
  return {
    currentTotal,
    previousTotal,
    previousLabel: rangeTitle(previous),
    deltaAbs: comparable ? currentTotal - previousTotal : null,
    deltaPct: comparable && previousTotal !== 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : null,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Print-ready HTML for a report.
 *
 * Self-contained — no external assets — so it renders identically offline and
 * in the browser's print-to-PDF dialog, which is what turns it into a PDF
 * without shipping a PDF library.
 *
 * **Colour is never the only thing carrying meaning.** The report is printed,
 * and a great many printers are monochrome. Every distinction therefore
 * survives being reduced to grey:
 *
 *  - each funding kind carries a **glyph** (● ◆ ▲) and its written label, not
 *    just a swatch;
 *  - category swatches are a filled disc *and* the category's name, and the
 *    bars beside them carry a hatched or solid fill that stays distinct in
 *    greyscale;
 *  - "over cap" is a word and a heavy rule, not a red bar;
 *  - the summary cards separate by rule weight and type size rather than by
 *    background tint alone;
 *  - `print-color-adjust: exact` is deliberately *not* used to force colour —
 *    the layout is designed to work without it.
 *
 * The colours that remain are there to make the screen version pleasant, and
 * every one of them is decoration on top of a distinction already made.
 */
export function reportHtml(report: PeriodReport, moneyFormatter: (value: number) => string): string {
  const maxMonthly = Math.max(...report.monthly.map((m) => m.value ?? 0), 1);
  const maxCategory = Math.max(...report.categories.map((c) => c.total), 1);
  const maxActivity = Math.max(...report.activities.lines.map((line) => line.yearly), 1);

  const monthlyBars = report.monthly
    .map((month) => {
      if (month.value == null) {
        return `<div class="bar"><div class="bar-missing" title="No data">?</div><span>${escapeHtml(month.label)}</span></div>`;
      }
      const height = Math.max(2, (month.value / maxMonthly) * 100);
      return `<div class="bar"><div class="bar-fill" style="height:${height}%" title="${escapeHtml(
        moneyFormatter(month.value),
      )}"></div><span>${escapeHtml(month.label)}</span></div>`;
    })
    .join("");

  const categoryRows = report.categories
    .map((stat) => {
      const width = Math.max(1, (stat.total / maxCategory) * 100);
      const share = stat.share != null ? `${stat.share.toFixed(1)}%` : "—";
      // "Over cap" is a word in its own column. A red bar says nothing to a
      // monochrome printer, and nothing at all to a colour-blind reader.
      const flag = stat.overCap ? '<span class="flag">OVER CAP</span>' : "";
      return `<tr${stat.overCap ? ' class="row-flagged"' : ""}>
        <td><span class="dot" style="background:${escapeHtml(stat.category?.color ?? "#64748B")}"></span>${escapeHtml(
          stat.category?.name ?? "Uncategorized",
        )} ${flag}</td>
        <td class="num">${escapeHtml(moneyFormatter(stat.total))}</td>
        <td class="num">${escapeHtml(share)}</td>
        <td class="num">${stat.cap != null ? escapeHtml(moneyFormatter(stat.cap)) : "—"}</td>
        <td class="barcell"><div class="hbar" style="width:${width}%;background:${escapeHtml(
          stat.category?.color ?? "#64748B",
        )}"></div></td>
      </tr>`;
    })
    .join("");

  const fundingRows = report.funding.lines
    .map(
      (line) => `<tr>
        <td><span class="glyph" aria-hidden="true">${escapeHtml(line.glyph)}</span>${escapeHtml(line.label)}</td>
        <td class="num">${line.amount != null ? escapeHtml(moneyFormatter(line.amount)) : "—"}</td>
        <td class="num">${line.count}</td>
        <td class="num">${line.share != null ? `${line.share.toFixed(1)}%` : "—"}</td>
      </tr>`,
    )
    .join("");

  const activityRows = report.activities.lines
    .map((line) => {
      const width = Math.max(1, (line.yearly / maxActivity) * 100);
      return `<tr>
        <td>
          <span class="glyph" aria-hidden="true">${escapeHtml(line.glyph)}</span>${escapeHtml(line.name)}
          <span class="sub">${escapeHtml(line.category)} · ${escapeHtml(line.fundingLabel)}</span>
        </td>
        <td class="num">${escapeHtml(moneyFormatter(line.monthly))}</td>
        <td class="num">${escapeHtml(moneyFormatter(line.yearly))}</td>
        <td class="num">${line.share != null ? `${line.share.toFixed(1)}%` : "—"}</td>
        <td class="num">${
          line.dueThisMonth == null
            ? `<span class="unknown" title="${escapeHtml(line.dueNote)}">not known</span>`
            : escapeHtml(moneyFormatter(line.dueThisMonth))
        }</td>
        <td class="barcell"><div class="hbar hbar-plain" style="width:${width}%"></div></td>
      </tr>`;
    })
    .join("");

  const summaryCards = report.summary
    .map(
      (item) => `<div class="card">
        <div class="card-label">${escapeHtml(item.label)}</div>
        <div class="card-value">${escapeHtml(item.value)}</div>
        ${item.detail ? `<div class="card-detail">${escapeHtml(item.detail)}</div>` : ""}
      </div>`,
    )
    .join("");

  const factors = report.health.factors
    .map(
      (factor) => `<div class="factor">
        <div class="factor-head"><span>${escapeHtml(factor.label)}</span><strong>${Math.round(factor.score)}</strong></div>
        <div class="factor-track"><div class="factor-fill" style="width:${Math.min(100, Math.max(0, factor.score))}%"></div></div>
        ${factor.detail ? `<div class="factor-detail">${escapeHtml(factor.detail)}</div>` : ""}
      </div>`,
    )
    .join("");

  const activityTotals = `<div class="grid grid-tight">
      <div class="card"><div class="card-label">Total activity cost</div><div class="card-value">${escapeHtml(
        moneyFormatter(report.activities.monthly.gross),
      )}</div><div class="card-detail">${escapeHtml(
        moneyFormatter(report.activities.yearly.gross),
      )} per year · everything, whoever pays</div></div>
      <div class="card"><div class="card-label">● Paid by me — in budget</div><div class="card-value">${escapeHtml(
        moneyFormatter(report.activities.monthly.personal),
      )}</div><div class="card-detail">${escapeHtml(moneyFormatter(report.activities.yearly.personal))} per year</div></div>
      <div class="card"><div class="card-label">◆ Paid by other</div><div class="card-value">${escapeHtml(
        moneyFormatter(report.activities.monthly.other),
      )}</div><div class="card-detail">${escapeHtml(moneyFormatter(report.activities.yearly.other))} per year</div></div>
      <div class="card"><div class="card-label">▲ Outside budget</div><div class="card-value">${escapeHtml(
        moneyFormatter(report.activities.monthly.outside),
      )}</div><div class="card-detail">${escapeHtml(moneyFormatter(report.activities.yearly.outside))} per year</div></div>
      <div class="card card-strong"><div class="card-label">Required in ${escapeHtml(
        report.activities.monthLabel,
      )}</div><div class="card-value">${escapeHtml(
        moneyFormatter(report.activities.requiredThisMonth.personal),
      )}</div><div class="card-detail">Payments actually due this month, not a twelfth of the year</div></div>
    </div>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(report.title)} · ${escapeHtml(report.subtitle)}</title>
<style>
  @page { margin: 15mm; }
  * { box-sizing: border-box; }
  :root {
    --ink: #0F1722;
    --ink-soft: #47515F;
    --ink-faint: #767F8B;
    --rule: #D8DDE4;
    --rule-soft: #EDF0F3;
    --navy: #0B2E5B;
    --accent: #C8102E;
  }
  body {
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    color: var(--ink);
    margin: 0;
    padding: 30px 34px 40px;
    background: #fff;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }
  .sans { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

  /* The masthead: a heavy rule and a hairline in the signature red. Both are
     structural, so the hierarchy survives with no colour at all. */
  header {
    border-bottom: 3px solid var(--navy);
    padding-bottom: 12px;
    margin-bottom: 4px;
    display: flex; justify-content: space-between; align-items: flex-end;
    gap: 16px; flex-wrap: wrap;
  }
  .rule-accent { height: 2px; background: var(--accent); width: 88px; margin-bottom: 26px; }
  h1 { font-size: 33px; margin: 0; letter-spacing: -0.015em; line-height: 1.1; }
  .sub { color: var(--ink-soft); font-size: 12.5px; margin-top: 5px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

  h2 {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--navy); margin: 30px 0 10px; padding-bottom: 5px;
    border-bottom: 1px solid var(--rule);
  }
  h2:first-of-type { margin-top: 20px; }
  .lede { font-size: 12.5px; color: var(--ink-soft); margin: -4px 0 12px; }

  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(158px, 1fr)); gap: 10px; }
  .grid-tight { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
  .card { border: 1px solid var(--rule); border-radius: 3px; padding: 11px 13px; }
  /* Weight, not tint: the emphasised card reads as emphasised in greyscale. */
  .card-strong { border: 2px solid var(--navy); }
  .card-label {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink-faint);
  }
  .card-value { font-size: 19px; font-weight: 700; margin-top: 3px; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
  .card-detail { font-size: 10.5px; color: var(--ink-faint); margin-top: 3px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

  .health { display: flex; align-items: center; gap: 26px; flex-wrap: wrap; }
  .score { font-size: 58px; font-weight: 800; letter-spacing: -0.035em; line-height: 1; color: var(--navy); }
  .grade { font-size: 12px; color: var(--ink-soft); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .factors { flex: 1; min-width: 250px; display: grid; gap: 8px; }
  .factor-head { display: flex; justify-content: space-between; font-size: 11.5px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .factor-track { height: 5px; background: var(--rule-soft); border: 1px solid var(--rule); border-radius: 99px; overflow: hidden; margin-top: 3px; }
  .factor-fill { height: 100%; background: var(--navy); }
  .factor-detail { font-size: 10.5px; color: var(--ink-faint); margin-top: 2px; }

  .chart { display: flex; align-items: flex-end; gap: 5px; height: 140px; border-bottom: 1.5px solid var(--ink); padding-bottom: 4px; }
  .bar { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; gap: 5px; }
  .bar-fill { width: 100%; background: var(--navy); border: 1px solid var(--navy); border-radius: 2px 2px 0 0; min-height: 2px; }
  .bar-missing { font-size: 11px; color: var(--ink-faint); }
  .bar span { font-size: 9.5px; color: var(--ink-faint); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

  table { width: 100%; border-collapse: collapse; font-size: 11.5px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  th {
    text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.07em;
    color: var(--ink-faint); border-bottom: 1.5px solid var(--ink); padding: 6px 6px;
  }
  th.num, td.num { text-align: right; }
  td { padding: 7px 6px; border-bottom: 1px solid var(--rule-soft); vertical-align: top; }
  td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.barcell { width: 22%; }
  tbody tr:last-child td { border-bottom: 1px solid var(--rule); }
  .row-flagged td { background: var(--rule-soft); }
  .hbar { height: 6px; border-radius: 99px; }
  /* A plain bar with a border, so it is still a bar with the fill removed. */
  .hbar-plain { background: var(--navy); border: 1px solid var(--navy); }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; border: 1px solid rgba(0,0,0,0.35); }
  .glyph { display: inline-block; width: 14px; color: var(--navy); }
  .sub { display: block; font-size: 10px; color: var(--ink-faint); }
  td .sub { margin-top: 2px; }
  /* A word, in a box, in small caps — legible with every drop of ink removed. */
  .flag {
    display: inline-block; margin-left: 6px; padding: 0 5px;
    font-size: 8.5px; letter-spacing: 0.08em; text-transform: uppercase;
    border: 1px solid var(--ink); border-radius: 2px; vertical-align: 1px;
  }
  .unknown { color: var(--ink-faint); font-style: italic; }

  .notes { margin-top: 22px; padding: 12px 14px; border: 1px solid var(--rule); border-left: 3px solid var(--navy); border-radius: 2px; font-size: 11.5px; color: var(--ink-soft); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .notes ul { margin: 0; padding-left: 16px; }
  .notes li { margin: 4px 0; }
  .legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 10.5px; color: var(--ink-soft); margin: 8px 0 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

  footer { margin-top: 26px; border-top: 1px solid var(--rule); padding-top: 9px; font-size: 9.5px; color: var(--ink-faint); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

  .print-btn {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 9px 15px; border-radius: 3px; border: 1px solid var(--navy);
    background: var(--navy); color: #fff; font-weight: 600; cursor: pointer; font-size: 12.5px;
  }

  @media print {
    body { padding: 0; }
    .no-print { display: none; }
    /* Never break a table row or a section heading across a page. */
    tr, .card, .factor { break-inside: avoid; }
    h2 { break-after: avoid; }
    thead { display: table-header-group; }
  }
</style></head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(report.title)}</h1>
      <div class="sub">${escapeHtml(report.subtitle)} · amounts in ${escapeHtml(report.currency)}</div>
    </div>
    <button class="no-print print-btn" onclick="window.print()">Print / Save as PDF</button>
  </header>
  <div class="rule-accent" aria-hidden="true"></div>

  <h2>Budget health</h2>
  <div class="health">
    <div>
      <div class="score">${report.health.score != null ? Math.round(report.health.score) : "—"}</div>
      <div class="grade">${escapeHtml(report.health.grade ?? "Not enough data")}</div>
    </div>
    <div class="factors">${factors || '<div class="grade">No measurable factors for this period.</div>'}</div>
  </div>

  <h2>Summary</h2>
  <div class="grid">${summaryCards}</div>

  <h2>Who funded this period</h2>
  <p class="lede">
    Paid by me counts against the budget. Paid by other and Outside budget are recorded in full and
    charged to nothing — and they are reported separately, because they are different facts.
  </p>
  <table>
    <thead><tr><th>Funding</th><th class="num">Amount</th><th class="num">Transactions</th><th class="num">Share</th></tr></thead>
    <tbody>${fundingRows}</tbody>
  </table>
  <p class="legend">
    <span>● Paid by me — in budget</span><span>◆ Paid by other</span><span>▲ Outside budget</span>
  </p>

  <h2>Activity costs</h2>
  ${activityTotals}
  ${
    report.activities.lines.length > 0
      ? `<table style="margin-top:12px">
          <thead><tr>
            <th>Activity</th><th class="num">Per month</th><th class="num">Per year</th>
            <th class="num">Share</th><th class="num">Due in ${escapeHtml(report.activities.monthLabel)}</th><th></th>
          </tr></thead>
          <tbody>${activityRows}</tbody>
        </table>`
      : '<div class="grade">No active activities.</div>'
  }

  <h2>Monthly trend</h2>
  <div class="chart">${monthlyBars}</div>

  <h2>Categories</h2>
  ${
    report.categories.length > 0
      ? `<table><thead><tr><th>Category</th><th class="num">Spent</th><th class="num">Share</th><th class="num">Cap</th><th></th></tr></thead><tbody>${categoryRows}</tbody></table>`
      : '<div class="grade">No spending recorded for this period.</div>'
  }

  ${report.notes.length > 0 ? `<div class="notes"><ul>${report.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul></div>` : ""}

  <footer>Generated ${escapeHtml(new Date(report.generatedAt).toLocaleString())} · figures use the same calculations as the application.</footer>
</body></html>`;
}
