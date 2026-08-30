import type { BudgetSnapshot, Settings } from "./types";
import { activityBudgetSummary, type FundingTotals } from "./activityBudget";
import { FUNDING_KINDS, FUNDING_META, type FundingKind } from "./funding";
import { sanitiseStatusColours, type StatusColours } from "./statusColours";
import { createTranslator, formatDate, formatNumber, formatPercent, monthNames, type Translator } from "./i18n";
import { calculateYear, normalizeEntry } from "./calculations";
import { formatMoney } from "./currency";
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
 *
 * **It is written in the reader's language.** Every string below is resolved
 * through a translator the caller supplies, and every date, number and month
 * name through `Intl` against that translator's locale — a French interface
 * used to hand its reader an English report, which is the one place in this
 * application where the language silently changed.
 *
 * The translator defaults to English so a test, a script or any other
 * non-React caller can build a report without wiring one up.
 */

export interface ReportSection {
  label: string;
  value: string;
  detail?: string;
  /** Shown in the hero row rather than the summary grid. */
  lead?: boolean;
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
  /** BCP 47 tag the report was written in, for `<html lang>`. */
  language: string;
  /** True when the language is written right to left. */
  rtl: boolean;
  summary: ReportSection[];
  /**
   * The budget, as a proportion rather than as two numbers.
   *
   * A report's first question is "how did I do against the budget", and the
   * honest answer to it is a length: a bar the reader measures by eye in less
   * time than it takes to subtract 516 from 1,400. Null when no monthly budget
   * is set, or when the range is a custom one — prorating a monthly budget
   * across six weeks would invent a figure.
   */
  budgetBar: { usedPercent: number; overspent: boolean; spentLabel: string; budgetLabel: string } | null;
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

/** Written form of a range, e.g. "1 Mar – 15 Apr 2026", in the report's locale. */
function rangeTitle(range: CustomRange, locale: string): string {
  const start = new Date(`${range.from}T12:00:00`);
  const end = new Date(`${range.to}T12:00:00`);
  const sameYear = start.getFullYear() === end.getFullYear();
  const startText = formatDate(start, locale, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const endText = formatDate(end, locale, { day: "numeric", month: "short", year: "numeric" });
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
  t: Translator = createTranslator("en"),
): PeriodReport {
  const locale = t.language;
  const months = monthNames(locale);
  const monthLabel = (month: number) => months[Math.min(11, Math.max(0, month - 1))];
  const shortMonths = monthNames(locale, "short");

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
  const comparison = custom ? rangeComparison(scoped, custom, locale) : periodComparison(scoped, settings, locale);
  const health = financialHealth({ pacing, categories, comparison, stats });

  const money = (value: number | null | undefined) =>
    value == null || !Number.isFinite(value) ? "—" : formatMoney(value, settings.baseCurrency, settings.currencyDisplayMode);
  const percent = (value: number | null | undefined) =>
    value == null || !Number.isFinite(value) ? "—" : formatPercent(value, locale);

  const title = custom
    ? rangeTitle(custom, locale)
    : scope === "month"
      ? `${monthLabel(settings.selectedMonth)} ${formatNumber(settings.selectedYear, locale, { useGrouping: false })}`
      : formatNumber(settings.selectedYear, locale, { useGrouping: false });

  /*
   * The hero row.
   *
   * Four figures answer the question the report is opened to answer: what went
   * out, what was available, what is left, and how healthy that is. Everything
   * else is detail behind them. They are marked `lead` rather than being a
   * separate list so `summary` remains one ordered model to test.
   */
  const summary: ReportSection[] = [
    {
      label: t("report.totalSpending"),
      value: stats.total != null ? money(stats.total) : t("report.noDataRecorded"),
      detail: funding.externalCount > 0 ? t("report.chargedToBudget") : undefined,
      lead: true,
    },
  ];

  if (pacing) {
    summary.push(
      { label: t("report.budget"), value: money(pacing.budget), lead: true },
      {
        label: t("report.remaining"),
        value: money(pacing.remaining),
        detail: t("report.used", { percent: percent(pacing.utilisation ?? 0) }),
        lead: true,
      },
    );
  }

  summary.push(
    { label: t("report.transactions"), value: formatNumber(stats.count, locale) },
    { label: t("report.averageTransaction"), value: stats.average != null ? money(stats.average) : "—" },
    { label: t("report.largestTransaction"), value: stats.largest != null ? money(stats.largest) : "—" },
    {
      label: t("report.recurring"),
      value: money(stats.recurringTotal),
      detail: stats.recurringShare != null ? t("report.ofSpend", { percent: percent(stats.recurringShare) }) : undefined,
    },
    { label: t("report.oneOff"), value: money(stats.oneOffTotal) },
  );

  /*
   * Money somebody else paid is *not* repeated here.
   *
   * It was: three more cards saying what the "who paid" table two sections
   * above already gives with its amounts, its counts and its shares. The
   * report is read top to bottom, and a figure that appears twice makes the
   * reader stop to work out whether it is the same figure.
   */

  summary.push(
    // The three treasury figures, never collapsed into one — and these keep
    // their captions, because three balances in a row is exactly the case
    // where a label alone does not say which is which. See domain/wallet.ts.
    { label: t("report.walletBalance"), value: money(calc.wallet.walletTotal), detail: t("report.actualMoneyHeld") },
    {
      label: t("report.remainingBudget"),
      value: money(calc.wallet.budgetRemaining),
      detail: t("report.budgetMoneyAvailable"),
    },
    {
      label: t("report.personalBalance"),
      value: money(calc.wallet.personalBalance),
      detail: t("report.moneyOutsideBudget"),
    },
    {
      label: t("report.versus", { period: comparison.previousLabel }),
      value: comparison.deltaAbs != null ? money(comparison.deltaAbs) : t("report.noComparableData"),
      detail:
        comparison.deltaPct != null
          ? `${comparison.deltaPct > 0 ? "+" : ""}${percent(comparison.deltaPct)}`
          : undefined,
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
    label: shortMonths[index] ?? String(index + 1),
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
      label: t(`funding.${kind}`),
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
    category: categoryNames.get(item.activity.categoryId) ?? t("common.uncategorised"),
    funding: item.funding,
    fundingLabel: t(`funding.${item.funding}.short`),
    glyph: FUNDING_META[item.funding].glyph,
    monthly: item.monthlyBase,
    yearly: item.yearlyBase,
    share: activityShares.get(item.activity.id) ?? null,
    dueThisMonth: item.status === "unknown" ? null : (item.dueBase ?? 0),
    /*
     * `unknownReason` is a translation key rather than a sentence, precisely so
     * both the interface and this report can say it in the reader's own
     * language. Printing the raw key would be the worst of both.
     */
    dueNote:
      item.status === "unknown"
        ? t(item.unknownReason ?? "activity.unknownMonth")
        : item.status === "not-due"
          ? t("report.notDueThisMonth")
          : t("report.dueThisMonth"),
  }));

  /*
   * Notes: short, factual, and only when there is something to say.
   *
   * They used to be paragraphs — four sentences to explain that money somebody
   * else paid is not charged to you, in a report that has already shown that
   * three times in a table. A report that has to be *read* to be understood is
   * a report nobody reads.
   */
  const notes: string[] = [];
  const overCap = categories.filter((c) => c.overCap);
  if (overCap.length > 0) {
    notes.push(
      t("report.noteOverCap", {
        count: overCap.length,
        list: overCap
          .map((c) => `${c.category?.name ?? t("common.uncategorised")} (+${money(c.total - (c.cap ?? 0))})`)
          .join(", "),
      }),
    );
  }
  if (stats.total == null) notes.push(t("report.noteNoSpending"));
  if (custom) notes.push(t("report.noteCustomRange"));
  if (activitySummary.unscheduled.length > 0) {
    notes.push(
      t("report.noteUnscheduled", {
        count: activitySummary.unscheduled.length,
        month: monthLabel(activityMonth),
        list: activitySummary.unscheduled.map((item) => item.activity.name).join(", "),
      }),
    );
  }

  return {
    title,
    subtitle: custom
      ? t("report.customRange", { days: inclusiveDays(custom.from, custom.to) })
      : scope === "month"
        ? t("report.monthly")
        : t("report.annual"),
    generatedAt: now.toISOString(),
    currency: settings.baseCurrency,
    language: locale,
    rtl: t.rtl,
    summary,
    budgetBar:
      pacing && pacing.budget > 0 && stats.total != null
        ? {
            usedPercent: (stats.total / pacing.budget) * 100,
            overspent: stats.total > pacing.budget,
            spentLabel: money(stats.total),
            budgetLabel: money(pacing.budget),
          }
        : null,
    categories,
    monthly,
    health: {
      score: health.score,
      grade: health.grade,
      // Resolved here rather than carried as keys, because the report model is
      // the thing that gets printed: by this point the language is decided.
      factors: health.factors.map((f) => ({
        label: t(f.labelKey),
        score: f.score,
        detail: f.detailKey ? t(f.detailKey, f.detailParams) : undefined,
      })),
    },
    funding: { lines: fundingLines, gross: funding.transactions },
    activities: {
      lines: activityLines,
      monthly: activitySummary.monthly,
      yearly: activitySummary.yearly,
      requiredThisMonth: activitySummary.requiredThisMonth,
      unscheduled: activitySummary.unscheduled.length,
      monthLabel: monthLabel(activityMonth),
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
function rangeComparison(snapshot: BudgetSnapshot, range: CustomRange, locale: string) {
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
    previousLabel: rangeTitle(previous, locale),
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

/** The three funding colours, as real values: a printed page has no CSS variables. */
const FUNDING_COLOUR: Record<FundingKind, string> = {
  /*
   * Three inks that stay three inks in greyscale.
   *
   * "Paid by me" and "paid by other" are both blue on screen, which is the
   * vocabulary the interface uses — but two blues of the same weight print as
   * one grey. These are separated by *lightness* rather than by hue: a deep
   * navy, a mid sky blue and an amber convert to three visibly different
   * greys. The glyphs and the written labels carry it the rest of the way.
   */
  personal: "#1B4B8F",
  other: "#2E8BD8",
  outside: "#B45309",
};

/**
 * Print-ready HTML for a report.
 *
 * Self-contained — no external assets — so it renders identically offline and
 * in the browser's print-to-PDF dialog, which is what turns it into a PDF
 * without shipping a PDF library.
 *
 * ─── What it is trying to be ─────────────────────────────────────────────────
 *
 * Bright, modern and scannable: a headline row of the four figures the report
 * exists to give, then each section as a compact table or chart. It used to be
 * set in a serif and read as a newspaper — dignified, and slow to scan. The
 * figures are the content; the prose is not.
 *
 * ─── Colour is never the only thing carrying meaning ─────────────────────────
 *
 * The report is printed, and a great many printers are monochrome — and Chrome
 * does not print background colours at all unless the reader ticks a box. Every
 * distinction therefore survives being reduced to grey **and** survives losing
 * its fills entirely:
 *
 *  - each funding kind carries a **glyph** (● ◆ ▲) and its written label, and
 *    each segment of the split bar carries its glyph and its percentage *inside
 *    the segment*, with a border that stays when the fill does not;
 *  - category swatches are a bordered disc beside the category's name;
 *  - "over cap" is a word in a box, not a red bar;
 *  - the emphasised card is distinguished by border weight, not by tint;
 *  - a month with no data prints "?" rather than a bar of height zero.
 *
 * `print-color-adjust: exact` is deliberately not used. The layout works
 * without it, which is the only way to know that it works.
 */
export interface ReportHtmlOptions {
  /**
   * Rendered into the application's own preview rather than opened as a
   * document of its own.
   *
   * Two things change: the document's own Print button is dropped, because the
   * panel around it has one and two buttons that do the same thing is exactly
   * the kind of duplication this pass is removing; and the screen rules below
   * are allowed to reflow the page for a narrow viewport. `@media print` is
   * untouched either way — what comes out of the printer is the same document.
   */
  screen?: boolean;
  /**
   * The reader's own status colours, if they have chosen any.
   *
   * A printed page has no CSS variables, so these are merged over the default
   * ink table below rather than being emitted as custom properties. The
   * defaults are chosen to stay three distinguishable *greys* on a monochrome
   * printer; a reader who picks their own accepts that trade, which is why the
   * glyphs and the written labels are on every row either way.
   */
  statusColours?: StatusColours;
}

export function reportHtml(
  report: PeriodReport,
  moneyFormatter: (value: number) => string,
  t: Translator = createTranslator("en"),
  options: ReportHtmlOptions = {},
): string {
  const chosen = sanitiseStatusColours(options.statusColours);
  const ink: Record<FundingKind, string> = { ...FUNDING_COLOUR, ...chosen };
  const maxMonthly = Math.max(...report.monthly.map((m) => m.value ?? 0), 1);
  const maxCategory = Math.max(...report.categories.map((c) => c.total), 1);
  const maxActivity = Math.max(...report.activities.lines.map((line) => line.yearly), 1);
  const locale = report.language;
  const percent = (value: number | null | undefined) =>
    value == null || !Number.isFinite(value) ? "—" : formatPercent(value, locale);
  const count = (value: number) => formatNumber(value, locale);

  const lead = report.summary.filter((item) => item.lead);
  const rest = report.summary.filter((item) => !item.lead);

  const monthlyBars = report.monthly
    .map((month) => {
      if (month.value == null) {
        return `<div class="bar"><div class="bar-missing" title="${escapeHtml(t("report.noData"))}">?</div><span>${escapeHtml(
          month.label,
        )}</span></div>`;
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
      // "Over cap" is a word in its own right. A red bar says nothing to a
      // monochrome printer, and nothing at all to a colour-blind reader.
      const flag = stat.overCap ? `<span class="flag">${escapeHtml(t("report.overCap"))}</span>` : "";
      const colour = escapeHtml(stat.category?.color ?? "#64748B");
      return `<tr${stat.overCap ? ' class="row-flagged"' : ""}>
        <td><span class="dot" style="background:${colour}"></span>${escapeHtml(
          stat.category?.name ?? t("common.uncategorised"),
        )} ${flag}</td>
        <td class="num">${escapeHtml(moneyFormatter(stat.total))}</td>
        <td class="num">${escapeHtml(percent(stat.share))}</td>
        <td class="num">${stat.cap != null ? escapeHtml(moneyFormatter(stat.cap)) : "—"}</td>
        <td class="barcell"><div class="hbar" style="width:${width}%;background:${colour};border-color:${colour}"></div></td>
      </tr>`;
    })
    .join("");

  /*
   * The split, as one bar.
   *
   * A stacked bar answers "how much of this was mine" at a glance in a way
   * three table rows do not. Each segment carries its own glyph and share
   * inside it, so with the fills stripped out by a printer it is still three
   * labelled, bordered boxes in proportion.
   */
  const gross = report.funding.gross ?? 0;
  const splitBar =
    gross > 0
      ? `<div class="split" role="img" aria-label="${escapeHtml(t("report.funding"))}">${report.funding.lines
          .filter((line) => (line.amount ?? 0) > 0)
          .map((line) => {
            const share = ((line.amount ?? 0) / gross) * 100;
            const colour = ink[line.kind];
            return `<div class="split-part" style="width:${share}%;background:${colour};border-color:${colour}">
              <span class="split-label">${escapeHtml(line.glyph)} ${escapeHtml(percent(share))}</span>
            </div>`;
          })
          .join("")}</div>`
      : "";

  const fundingRows = report.funding.lines
    .map(
      (line) => `<tr>
        <td><span class="glyph" style="color:${ink[line.kind]}" aria-hidden="true">${escapeHtml(
          line.glyph,
        )}</span>${escapeHtml(line.label)}</td>
        <td class="num">${line.amount != null ? escapeHtml(moneyFormatter(line.amount)) : "—"}</td>
        <td class="num">${escapeHtml(count(line.count))}</td>
        <td class="num">${escapeHtml(percent(line.share))}</td>
      </tr>`,
    )
    .join("");

  const activityRows = report.activities.lines
    .map((line) => {
      const width = Math.max(1, (line.yearly / maxActivity) * 100);
      const colour = ink[line.funding];
      return `<tr>
        <td>
          <span class="glyph" style="color:${colour}" aria-hidden="true">${escapeHtml(line.glyph)}</span>${escapeHtml(
            line.name,
          )}
          <span class="sub">${escapeHtml(line.category)} · ${escapeHtml(line.fundingLabel)}</span>
        </td>
        <td class="num">${escapeHtml(moneyFormatter(line.monthly))}</td>
        <td class="num">${escapeHtml(moneyFormatter(line.yearly))}</td>
        <td class="num">${escapeHtml(percent(line.share))}</td>
        <td class="num">${
          line.dueThisMonth == null
            ? `<span class="unknown" title="${escapeHtml(line.dueNote)}">${escapeHtml(t("report.notKnown"))}</span>`
            : escapeHtml(moneyFormatter(line.dueThisMonth))
        }</td>
        <td class="barcell"><div class="hbar" style="width:${width}%;background:${colour};border-color:${colour}"></div></td>
      </tr>`;
    })
    .join("");

  /*
   * A card's value is usually a figure and occasionally a sentence — "Nothing
   * recorded", "No comparable data". At the figure's size a sentence wraps to
   * three lines and reads as the loudest thing on the page, so a long value is
   * set smaller. The threshold is length rather than a type flag: the model
   * says what the value *is*, not how big it should be.
   */
  const card = (item: ReportSection, strong = false) => `<div class="card${strong ? " card-strong" : ""}">
        <div class="card-label">${escapeHtml(item.label)}</div>
        <div class="card-value${item.value.length > 14 ? " card-value-text" : ""}">${escapeHtml(item.value)}</div>
        ${item.detail ? `<div class="card-detail">${escapeHtml(item.detail)}</div>` : ""}
      </div>`;

  const heroCards = lead.map((item, index) => card(item, index === 0)).join("");

  /*
   * The budget, at a glance.
   *
   * A length, not a subtraction. It is also the one place in the report where
   * a proportion is drawn rather than tabulated, which is what makes the first
   * screenful read as a dashboard instead of as a list of numbers.
   *
   * Printed in black and white the fill is still a length, and the figures on
   * either end still say what it is — the colour is the fastest channel, never
   * the only one.
   */
  const budgetBar = report.budgetBar
    ? `<div class="budget-bar">
        <div class="budget-track"><div class="budget-fill${
          report.budgetBar.overspent ? " is-over" : ""
        }" style="width:${Math.min(100, Math.max(1, report.budgetBar.usedPercent)).toFixed(1)}%"></div></div>
        <div class="budget-ends">
          <span>${escapeHtml(report.budgetBar.spentLabel)} · ${escapeHtml(
            t("report.used", { percent: percent(report.budgetBar.usedPercent) }),
          )}</span>
          <span>${escapeHtml(report.budgetBar.budgetLabel)}</span>
        </div>
      </div>`
    : "";
  const summaryCards = rest.map((item) => card(item)).join("");

  const factors = report.health.factors
    .map(
      (factor) => `<div class="factor">
        <div class="factor-head"><span>${escapeHtml(factor.label)}</span><strong>${escapeHtml(
          count(Math.round(factor.score)),
        )}</strong></div>
        <div class="factor-track"><div class="factor-fill" style="width:${Math.min(
          100,
          Math.max(0, factor.score),
        )}%"></div></div>
        ${factor.detail ? `<div class="factor-detail">${escapeHtml(factor.detail)}</div>` : ""}
      </div>`,
    )
    .join("");

  const activityTotals = `<div class="grid grid-tight">
      <div class="card"><div class="card-label">${escapeHtml(t("funding.gross"))}</div><div class="card-value">${escapeHtml(
        moneyFormatter(report.activities.monthly.gross),
      )}</div><div class="card-detail">${escapeHtml(
        t("report.perYear", { amount: moneyFormatter(report.activities.yearly.gross) }),
      )}</div></div>
      ${FUNDING_KINDS.map(
        (kind) => `<div class="card"><div class="card-label"><span class="glyph" style="color:${
          ink[kind]
        }">${FUNDING_META[kind].glyph}</span>${escapeHtml(t(`funding.${kind}.short`))}</div><div class="card-value">${escapeHtml(
          moneyFormatter(report.activities.monthly[kind === "personal" ? "personal" : kind === "other" ? "other" : "outside"]),
        )}</div><div class="card-detail">${escapeHtml(
          t("report.perYear", {
            amount: moneyFormatter(
              report.activities.yearly[kind === "personal" ? "personal" : kind === "other" ? "other" : "outside"],
            ),
          }),
        )}</div></div>`,
      ).join("")}
      <div class="card card-strong"><div class="card-label">${escapeHtml(
        t("report.requiredIn", { month: report.activities.monthLabel }),
      )}</div><div class="card-value">${escapeHtml(
        moneyFormatter(report.activities.requiredThisMonth.personal),
      )}</div></div>
    </div>`;

  return `<!doctype html>
<html lang="${escapeHtml(report.language)}"${report.rtl ? ' dir="rtl"' : ""}><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(report.title)} · ${escapeHtml(report.subtitle)}</title>
<style>
  @page { margin: 14mm; }
  * { box-sizing: border-box; }
  :root {
    --ink: #101722;
    --ink-soft: #4C5768;
    --ink-faint: #7B8698;
    --rule: #E2E7EE;
    --rule-soft: #F2F5F8;
    --navy: #12326B;
    --accent: #C8102E;
    --blue: #1E3FA8;
  }
  body {
    /* Sans throughout: this is a dashboard on paper, not a broadsheet. Figures
       are tabular so a column of amounts lines up. */
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: var(--ink);
    margin: 0;
    padding: 26px 30px 34px;
    background: #fff;
    line-height: 1.45;
    font-size: 12.5px;
    -webkit-font-smoothing: antialiased;
  }

  /* The masthead: the title, and the identity as a tricolour rule. Both the
     rule and the heavy line under the header are structural, so the hierarchy
     survives with no colour at all. */
  header {
    display: flex; justify-content: space-between; align-items: flex-end;
    gap: 16px; flex-wrap: wrap;
    border-bottom: 2px solid var(--ink);
    padding-bottom: 11px;
  }
  .tricolour { display: flex; height: 3px; width: 96px; margin: 0 0 22px; }
  .tricolour i { flex: 1; }
  .tricolour i:nth-child(1) { background: var(--blue); }
  .tricolour i:nth-child(2) { background: #E8EDF5; }
  .tricolour i:nth-child(3) { background: var(--accent); }
  h1 { font-size: 30px; margin: 0; letter-spacing: -0.02em; line-height: 1.08; font-weight: 700; }
  .sub { color: var(--ink-soft); font-size: 12px; margin-top: 4px; }

  h2 {
    font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.09em;
    color: var(--navy); margin: 26px 0 9px; padding: 0 0 4px 10px;
    border-bottom: 1px solid var(--rule); font-weight: 700;
    position: relative;
  }
  /* A coloured tab on each heading: the page gets a rhythm to scan by, and
     the rule underneath keeps the structure when the colour is not printed. */
  h2::before {
    content: ""; position: absolute; inset-inline-start: 0; top: 1px; bottom: 5px;
    width: 3px; border-radius: 2px; background: var(--accent);
  }
  .lede { font-size: 11.5px; color: var(--ink-soft); margin: -2px 0 10px; }

  /* The first screenful, set apart. A tint rather than a border: the page is
     mostly white and mostly ruled, so a warm ground is the cheapest way to
     make the four figures that matter read first. Printers that drop
     backgrounds lose the tint and keep every number. */
  .hero {
    background: linear-gradient(180deg, #F5F8FD, #FFFFFF);
    border: 1px solid var(--rule);
    border-radius: 10px;
    padding: 12px;
    margin-top: 14px;
  }

  .budget-bar { margin-top: 11px; }
  .budget-track {
    height: 9px;
    border-radius: 999px;
    background: #E4EAF3;
    border: 1px solid var(--rule);
    overflow: hidden;
  }
  .budget-fill { height: 100%; background: var(--blue); }
  /* Over budget is a different colour *and* a hatch, so the two states are
     still two states on a monochrome printer. */
  .budget-fill.is-over {
    background: repeating-linear-gradient(135deg, var(--accent), var(--accent) 5px, #A50D24 5px, #A50D24 10px);
  }
  .budget-ends {
    display: flex; justify-content: space-between; gap: 12px;
    font-size: 10.5px; color: var(--ink-soft); margin-top: 5px;
    font-variant-numeric: tabular-nums;
  }

  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 9px; }
  .grid-hero { grid-template-columns: repeat(auto-fit, minmax(168px, 1fr)); margin-top: 4px; }
  .grid-tight { grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); }
  .card { border: 1px solid var(--rule); border-radius: 6px; padding: 10px 12px; }
  /* Weight, not tint: the emphasised card reads as emphasised in greyscale. */
  .card-strong { border: 2px solid var(--navy); }
  .card-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink-faint); font-weight: 600; }
  .card-value { font-size: 20px; font-weight: 700; margin-top: 3px; font-variant-numeric: tabular-nums; letter-spacing: -0.015em; }
  .grid-hero .card-value { font-size: 26px; }
  /* A sentence where a figure usually goes. Declared after both rules above so
     it wins in the hero row too. */
  .card-value-text, .grid-hero .card-value-text { font-size: 13.5px; font-weight: 600; letter-spacing: 0; }
  .card-detail { font-size: 10.5px; color: var(--ink-faint); margin-top: 3px; }

  .grade { font-size: 11.5px; color: var(--ink-soft); }
  .factors { flex: 1; min-width: 240px; display: grid; gap: 7px; }
  .factors-wide { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
  .factor-head { display: flex; justify-content: space-between; font-size: 11px; }
  .factor-track { height: 5px; background: var(--rule-soft); border: 1px solid var(--rule); border-radius: 99px; overflow: hidden; margin-top: 3px; }
  .factor-fill { height: 100%; background: var(--navy); }
  .factor-detail { font-size: 10.5px; color: var(--ink-faint); margin-top: 2px; }

  /* The funding split, as one proportional bar. Every segment keeps its border
     when a printer drops the fill, and carries its own glyph and share. */
  .split { display: flex; height: 26px; border-radius: 5px; overflow: hidden; margin-bottom: 12px; }
  .split-part {
    display: flex; align-items: center; justify-content: center; min-width: 0;
    border: 1px solid; border-right-width: 0; overflow: hidden;
  }
  .split-part:first-child { border-radius: 5px 0 0 5px; }
  .split-part:last-child { border-radius: 0 5px 5px 0; border-right-width: 1px; }
  .split-label { color: #fff; font-size: 10px; font-weight: 700; white-space: nowrap; padding: 0 4px; }

  .chart { display: flex; align-items: flex-end; gap: 4px; height: 128px; border-bottom: 1.5px solid var(--ink); padding-bottom: 4px; }
  .bar { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; gap: 4px; }
  .bar-fill { width: 100%; background: var(--blue); border: 1px solid var(--blue); border-radius: 3px 3px 0 0; min-height: 2px; }
  .bar-missing { font-size: 11px; color: var(--ink-faint); }
  .bar span { font-size: 9px; color: var(--ink-faint); }

  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  th { text-align: start; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink-faint); border-bottom: 1.5px solid var(--ink); padding: 6px; font-weight: 700; }
  th.num, td.num { text-align: end; }
  td { padding: 7px 6px; border-bottom: 1px solid var(--rule-soft); vertical-align: top; }
  td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.barcell { width: 20%; }
  tbody tr:last-child td { border-bottom: 1px solid var(--rule); }
  .row-flagged td { background: var(--rule-soft); }
  /* A bar with a border, so it is still a bar with the fill removed. */
  .hbar { height: 7px; border-radius: 99px; border: 1px solid; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-inline-end: 6px; vertical-align: middle; border: 1px solid rgba(0,0,0,0.35); }
  .glyph { display: inline-block; width: 14px; }
  .sub { display: block; font-size: 10px; color: var(--ink-faint); }
  td .sub { margin-top: 2px; }
  /* A word, in a box, in small caps — legible with every drop of ink removed. */
  .flag { display: inline-block; margin-inline-start: 6px; padding: 0 5px; font-size: 8.5px; letter-spacing: 0.08em; text-transform: uppercase; border: 1px solid var(--ink); border-radius: 3px; vertical-align: 1px; font-weight: 700; }
  .unknown { color: var(--ink-faint); font-style: italic; }

  .notes { margin-top: 20px; padding: 11px 13px; border: 1px solid var(--rule); border-inline-start: 3px solid var(--navy); border-radius: 5px; font-size: 11.5px; color: var(--ink-soft); }
  .notes ul { margin: 0; padding-inline-start: 16px; }
  .notes li { margin: 4px 0; }
  .legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 10.5px; color: var(--ink-soft); margin: 8px 0 0; }

  footer { margin-top: 24px; border-top: 1px solid var(--rule); padding-top: 8px; font-size: 9.5px; color: var(--ink-faint); }

  .print-btn { padding: 9px 15px; border-radius: 5px; border: 1px solid var(--navy); background: var(--navy); color: #fff; font-weight: 600; cursor: pointer; font-size: 12.5px; font-family: inherit; }

  @media print {
    body { padding: 0; font-size: 11.5px; }
    .no-print { display: none; }
    /* Never break a table row or a section heading across a page. */
    tr, .card, .factor { break-inside: avoid; }
    h2 { break-after: avoid; }
    thead { display: table-header-group; }
  }

  /*
   * On a screen narrower than a sheet of paper, this stops being a sheet of
   * paper.
   *
   * A preview that is an A4 page scaled to fit a phone is not a preview: it is
   * a picture of a document, at four-point type. So the grids collapse to one
   * column and the tables — which are the part that cannot simply shrink —
   * become one block per row, each cell labelled from the header it belonged
   * to. Nothing is dropped; the same figures are in the same order.
   *
   * The print rules above are untouched, so the page that comes out of a
   * printer is the A4 one whatever screen it was previewed on.
   */
  @media screen and (max-width: 720px) {
    body { padding: 16px 14px 22px; font-size: 13px; }
    header { flex-direction: column; align-items: flex-start; gap: 10px; }
    .grid, .cards, .split-figures, .two-col { display: block !important; }
    .grid > * + *, .cards > * + * { margin-top: 10px; }
    .card { break-inside: auto; }

    /*
     * The tables scroll rather than reflow.
     *
     * Turning each row into a labelled block reads well and needs a
     * data-label attribute on all twenty-five cells — a second copy of every column
     * heading, in a document whose headings are already translated once. Two
     * copies of a heading is two things to keep in step, and the one that is
     * only visible on a phone is the one that would fall behind.
     *
     * So the type stays at a readable size and the table keeps its header,
     * inside its own scroller. Nothing about the figures changes; the reader
     * drags a table sideways instead of reading it at four points.
     */
    table { display: block; overflow-x: auto; white-space: nowrap; }
    table th, table td { white-space: nowrap; }
    /* The first column is the name, and a name may wrap. */
    table td:first-child { white-space: normal; min-width: 9rem; }
  }
</style></head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(report.title)}</h1>
      <div class="sub">${escapeHtml(report.subtitle)} · ${escapeHtml(
        t("report.amountsIn", { currency: report.currency }),
      )}</div>
    </div>
    ${
      options.screen
        ? ""
        : `<button class="no-print print-btn" onclick="window.print()">${escapeHtml(t("report.print"))}</button>`
    }
  </header>
  <div class="tricolour" aria-hidden="true"><i></i><i></i><i></i></div>

  <div class="hero">
    <div class="grid grid-hero">
      ${heroCards}
      <div class="card">
        <div class="card-label">${escapeHtml(t("report.health"))}</div>
        <div class="card-value">${report.health.score != null ? escapeHtml(count(Math.round(report.health.score))) : "—"}</div>
        <div class="card-detail">${escapeHtml(
          report.health.grade ? t(`health.grade.${report.health.grade}`) : t("report.notEnoughData"),
        )}</div>
      </div>
    </div>
    ${budgetBar}
  </div>

  <h2>${escapeHtml(t("report.funding"))}</h2>
  ${splitBar}
  <table>
    <thead><tr><th>${escapeHtml(t("report.colFunding"))}</th><th class="num">${escapeHtml(
      t("report.colAmount"),
    )}</th><th class="num">${escapeHtml(t("report.colTransactions"))}</th><th class="num">${escapeHtml(
      t("report.colShare"),
    )}</th></tr></thead>
    <tbody>${fundingRows}</tbody>
  </table>

  <h2>${escapeHtml(t("report.activityCosts"))}</h2>
  ${activityTotals}
  ${
    report.activities.lines.length > 0
      ? `<table style="margin-top:11px">
          <thead><tr>
            <th>${escapeHtml(t("report.colActivity"))}</th><th class="num">${escapeHtml(
              t("report.colPerMonth"),
            )}</th><th class="num">${escapeHtml(t("report.colPerYear"))}</th>
            <th class="num">${escapeHtml(t("report.colYourShare"))}</th><th class="num">${escapeHtml(
              t("report.colDueIn", { month: report.activities.monthLabel }),
            )}</th><th></th>
          </tr></thead>
          <tbody>${activityRows}</tbody>
        </table>`
      : `<div class="grade">${escapeHtml(t("report.noActivities"))}</div>`
  }

  ${
    /*
     * A chart, only when there is a shape to see.
     *
     * A new account's first report drew one bar and eleven question marks —
     * a chart whose entire content was "we have no history", taking a fifth
     * of the page to say it. Two months of data is the floor for a trend.
     */
    report.monthly.filter((month) => month.value != null).length >= 2
      ? `<h2>${escapeHtml(t("report.trend"))}</h2>
         <div class="chart">${monthlyBars}</div>`
      : ""
  }

  <h2>${escapeHtml(t("report.categories"))}</h2>
  ${
    report.categories.length > 0
      ? `<table><thead><tr><th>${escapeHtml(t("report.colCategory"))}</th><th class="num">${escapeHtml(
          t("report.colSpent"),
        )}</th><th class="num">${escapeHtml(t("report.colShare"))}</th><th class="num">${escapeHtml(
          t("report.colCap"),
        )}</th><th></th></tr></thead><tbody>${categoryRows}</tbody></table>`
      : `<div class="grade">${escapeHtml(t("report.noSpending"))}</div>`
  }

  <h2>${escapeHtml(t("report.detail"))}</h2>
  <div class="grid">${summaryCards}</div>

  <h2>${escapeHtml(t("report.healthDetail"))}</h2>
  <!-- The score itself is in the hero row. Repeating it here at 54px would be
       the same number twice on one page, which is exactly the padding this
       redesign set out to remove; this section is the breakdown behind it. -->
  <div class="factors factors-wide">${
    factors || `<div class="grade">${escapeHtml(t("report.noFactors"))}</div>`
  }</div>

  ${
    report.notes.length > 0
      ? `<div class="notes"><ul>${report.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul></div>`
      : ""
  }

  <p class="legend">
    ${FUNDING_KINDS.map(
      (kind) =>
        `<span><span class="glyph" style="color:${ink[kind]}">${FUNDING_META[kind].glyph}</span>${escapeHtml(
          t(`funding.${kind}`),
        )}</span>`,
    ).join("")}
  </p>

  <footer>${escapeHtml(
    t("report.generated", { when: formatDate(report.generatedAt, locale, { dateStyle: "medium", timeStyle: "short" }) }),
  )} · ${escapeHtml(t("report.sameCalculations"))}</footer>
</body></html>`;
}
