import type { BudgetSnapshot, Settings } from "./types";
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

export interface PeriodReport {
  title: string;
  subtitle: string;
  generatedAt: string;
  currency: string;
  summary: ReportSection[];
  categories: CategoryStat[];
  monthly: { label: string; value: number | null }[];
  health: { score: number | null; grade: string | null; factors: { label: string; score: number; detail?: string }[] };
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
  if (funding.externalCount > 0) {
    summary.push(
      {
        label: "Paid by others",
        value: money(funding.external),
        detail: `${funding.externalCount} transaction${funding.externalCount === 1 ? "" : "s"}, outside the budget`,
      },
      { label: "All transactions", value: money(funding.transactions), detail: "Personal and external together" },
    );
  }

  if (pacing) {
    summary.push(
      { label: "Budget", value: money(pacing.budget) },
      { label: "Remaining", value: money(pacing.remaining), detail: `${Math.round(pacing.utilisation ?? 0)}% used` },
    );
  }

  summary.push(
    { label: "Wallet balance", value: money(calc.wallet.walletTotal) },
    { label: "Rollover", value: money(calc.wallet.rolloverTotal) },
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
  if (funding.externalCount > 0) {
    notes.push(
      `${money(funding.external)} across ${funding.externalCount} transaction${
        funding.externalCount === 1 ? " was" : "s were"
      } paid by someone else. ${
        funding.externalCount === 1 ? "It is" : "They are"
      } recorded at full value and excluded from the budget, so every figure above is what this budget actually spent.`,
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
 * Print-ready HTML for a report. Self-contained (no external assets) so it
 * renders identically offline and in the browser's print-to-PDF dialog, which
 * is what turns it into a PDF without shipping a PDF library.
 */
export function reportHtml(report: PeriodReport, moneyFormatter: (value: number) => string): string {
  const maxMonthly = Math.max(...report.monthly.map((m) => m.value ?? 0), 1);
  const maxCategory = Math.max(...report.categories.map((c) => c.total), 1);

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
      return `<tr>
        <td><span class="dot" style="background:${escapeHtml(stat.category?.color ?? "#64748B")}"></span>${escapeHtml(
          stat.category?.name ?? "Uncategorized",
        )}</td>
        <td class="num">${escapeHtml(moneyFormatter(stat.total))}</td>
        <td class="num">${escapeHtml(share)}</td>
        <td class="num">${stat.cap != null ? escapeHtml(moneyFormatter(stat.cap)) : "—"}</td>
        <td class="barcell"><div class="hbar" style="width:${width}%;background:${escapeHtml(
          stat.category?.color ?? "#64748B",
        )}"></div></td>
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

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${escapeHtml(report.title)} · ${escapeHtml(report.subtitle)}</title>
<style>
  @page { margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #14161A; margin: 0; padding: 28px; background: #fff; }
  header { border-bottom: 2px solid #14161A; padding-bottom: 14px; margin-bottom: 22px; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
  h1 { font-size: 30px; margin: 0; letter-spacing: -0.02em; }
  .sub { color: #5A6067; font-size: 13px; margin-top: 4px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.06em; color: #5A6067; margin: 26px 0 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .card { border: 1px solid #E3E6EA; border-radius: 10px; padding: 12px 14px; }
  .card-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6B7178; }
  .card-value { font-size: 19px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .card-detail { font-size: 11px; color: #6B7178; margin-top: 2px; }
  .health { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; }
  .score { font-size: 54px; font-weight: 800; letter-spacing: -0.03em; }
  .grade { font-size: 13px; color: #5A6067; }
  .factors { flex: 1; min-width: 240px; display: grid; gap: 9px; }
  .factor-head { display: flex; justify-content: space-between; font-size: 12px; }
  .factor-track { height: 6px; background: #EDEFF2; border-radius: 99px; overflow: hidden; margin-top: 3px; }
  .factor-fill { height: 100%; background: #14161A; }
  .factor-detail { font-size: 11px; color: #6B7178; margin-top: 2px; }
  .chart { display: flex; align-items: flex-end; gap: 6px; height: 150px; border-bottom: 1px solid #E3E6EA; padding-bottom: 4px; }
  .bar { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; gap: 5px; }
  .bar-fill { width: 100%; background: #14161A; border-radius: 3px 3px 0 0; }
  .bar-missing { font-size: 11px; color: #A2A8AF; }
  .bar span { font-size: 10px; color: #6B7178; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6B7178; border-bottom: 1px solid #E3E6EA; padding: 7px 6px; }
  td { padding: 8px 6px; border-bottom: 1px solid #F0F2F4; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.barcell { width: 26%; }
  .hbar { height: 7px; border-radius: 99px; }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 7px; vertical-align: middle; }
  .notes { margin-top: 20px; padding: 12px 14px; background: #F6F7F9; border-radius: 10px; font-size: 12px; color: #3A4046; }
  .notes li { margin: 3px 0; }
  footer { margin-top: 26px; border-top: 1px solid #E3E6EA; padding-top: 10px; font-size: 10px; color: #8A9098; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style></head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(report.title)}</h1>
      <div class="sub">${escapeHtml(report.subtitle)} · amounts in ${escapeHtml(report.currency)}</div>
    </div>
    <button class="no-print" onclick="window.print()" style="padding:8px 14px;border-radius:8px;border:1px solid #14161A;background:#14161A;color:#fff;font-weight:600;cursor:pointer">Print / Save as PDF</button>
  </header>

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
