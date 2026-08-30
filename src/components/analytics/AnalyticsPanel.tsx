import React, { useMemo } from "react";
import { calculateYear } from "../../domain/calculations";
import { isHistoricalPeriod, periodLabel } from "../../domain/periods";
import {
  budgetPacing,
  budgetRelevantEntries,
  categoriesOverCap,
  categoryBreakdown,
  categoryMonthlySeries,
  cumulativeForecast,
  dailySpendingCalendar,
  entriesForSelectedPeriod,
  financialHealth,
  monthlyTrendBars,
  periodComparison,
  recentPeriodTotals,
  recurringMonthlySplit,
  selectedPeriodWindow,
  spendingStats,
  weeklyTrendBars,
} from "../../domain/analytics";
import { useBudgetStore } from "../../store/budgetStore";
import { activityBudgetSummary, fundingShares } from "../../domain/activityBudget";
import { FUNDING_KINDS, FUNDING_META } from "../../domain/funding";
import { useTranslation } from "../../i18n/useTranslation";
import { formatDualMoney } from "../../utils/formatters";
import { EmptyState } from "../ui/EmptyState";
import { Section } from "../ui/Section";
import {
  BarChart,
  ChartPlaceholder,
  DonutChart,
  Heatmap,
  HorizontalBarChart,
  LineChart,
  ProgressRing,
  Sparkline,
  StackedBarChart,
  compactNumber,
  type ChartReferenceLine,
  type HeatmapCell,
  type HorizontalBarRow,
} from "../charts";

/**
 * Chart-led analytics.
 *
 * Every section opens with a visual and lets the numbers underneath supply
 * the detail. Three rules from the project bible drive the data handling:
 *  - 0 is a real value; a period with no records is drawn as a gap or "?";
 *  - currency conversion is presentation only (formatDualMoney / normalizeEntry).
 */

// ─── Local layout primitives ─────────────────────────────────────────────────

/**
 * `note` is a chip, not a sentence.
 *
 * The thing it exists for — "3 activities are not yours to pay" — is a
 * qualification on a chart, and a qualification that takes a paragraph gets
 * skipped by everybody who is reading the chart. Six words in a pill beside
 * the title is read.
 */
const ChartCard: React.FC<{
  title: string;
  subtitle?: string;
  note?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, note, children }) => (
  <div className="card" style={{ padding: 16, display: "grid", gap: 14, minWidth: 0 }}>
    <div className="chart-card-head">
      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
        <span className="text-callout" style={{ fontWeight: 600 }}>
          {title}
        </span>
        {subtitle && (
          <span className="text-caption" style={{ color: "var(--text-tertiary)" }}>
            {subtitle}
          </span>
        )}
      </div>
      {note && <span className="chip chip-muted">{note}</span>}
    </div>
    {children}
  </div>
);

interface Stat {
  label: string;
  value: string;
  detail?: string;
  tone?: "positive" | "negative" | "warning";
}

/** Compact context numbers — the counterpoint to a wall of metric cards. */
const StatRow: React.FC<{ items: Stat[]; columns?: number }> = ({ items, columns = 120 }) => (
  <dl
    style={{
      display: "grid",
      gridTemplateColumns: `repeat(auto-fit, minmax(${columns}px, 1fr))`,
      gap: 12,
      margin: 0,
      minWidth: 0,
    }}
  >
    {items.map((item) => (
      <div key={item.label} style={{ minWidth: 0 }}>
        <dt className="text-footnote" style={{ marginBottom: 2 }}>
          {item.label}
        </dt>
        <dd
          style={{
            margin: 0,
            fontSize: "0.9375rem",
            fontWeight: 600,
            color:
              item.tone === "positive"
                ? "var(--success-text)"
                : item.tone === "negative"
                ? "var(--danger-text)"
                : item.tone === "warning"
                ? "var(--warning-text)"
                : "var(--text-primary)",
            overflowWrap: "anywhere",
          }}
        >
          {item.value}
        </dd>
        {item.detail && (
          <div className="text-caption" style={{ color: "var(--text-tertiary)" }}>
            {item.detail}
          </div>
        )}
      </div>
    ))}
  </dl>
);

const GRADE_COLOR: Record<string, string> = {
  excellent: "var(--success-text)",
  good: "var(--success-text)",
  fair: "var(--warning-text)",
  "at-risk": "var(--danger-text)",
};

// ─── Main Panel ───────────────────────────────────────────────────────────────

export const AnalyticsPanel: React.FC = () => {
  const { t, language, formatPercent } = useTranslation();
  const snapshot = useBudgetStore((state) => state.snapshot);
  const { settings } = snapshot;
  const mode = settings.selectedPeriodMode ?? "month";
  const isHistorical = useMemo(() => isHistoricalPeriod(settings), [settings]);

  // calculateYear drives budget/trend data for the selected calendar year
  const calc = useMemo(() => calculateYear(snapshot), [snapshot]);

  const periodEntries = useMemo(() => entriesForSelectedPeriod(snapshot, settings), [snapshot, settings]);
  const includedEntries = useMemo(
    () => budgetRelevantEntries(periodEntries, settings),
    [periodEntries, settings],
  );

  const stats = useMemo(() => spendingStats(includedEntries, snapshot), [includedEntries, snapshot]);
  const pacing = useMemo(() => budgetPacing(snapshot, includedEntries), [snapshot, includedEntries]);
  const categories = useMemo(() => categoryBreakdown(includedEntries, snapshot), [includedEntries, snapshot]);
  const overCap = useMemo(() => categoriesOverCap(categories), [categories]);
  const comparison = useMemo(() => periodComparison(snapshot, settings, language), [snapshot, settings, language]);
  const window = useMemo(() => selectedPeriodWindow(settings), [settings]);
  const health = useMemo(
    () => financialHealth({ pacing, categories, comparison, stats }),
    [pacing, categories, comparison, stats],
  );

  const calendar = useMemo(
    () => dailySpendingCalendar(includedEntries, snapshot, settings),
    [includedEntries, snapshot, settings],
  );
  const forecast = useMemo(
    () => cumulativeForecast(includedEntries, snapshot, settings),
    [includedEntries, snapshot, settings],
  );
  const categoryEvolution = useMemo(() => categoryMonthlySeries(snapshot, settings, 4), [snapshot, settings]);
  const recurringSplit = useMemo(() => recurringMonthlySplit(snapshot, settings), [snapshot, settings]);
  /**
   * Activity costs, from the same module the Activities tab and the reports
   * read. The statistics page does no costing of its own.
   */
  const activityCosts = useMemo(
    () => activityBudgetSummary(snapshot, settings.selectedYear, settings.selectedMonth),
    [snapshot, settings.selectedYear, settings.selectedMonth],
  );

  const recentBars = useMemo(
    () => recentPeriodTotals(snapshot, settings, mode === "year" ? 5 : 8),
    [snapshot, settings, mode],
  );

  // Same period last year (month mode only)
  const lastYearComparison = useMemo(() => {
    if (mode !== "month") return null;
    const lastYearSettings = { ...settings, selectedYear: settings.selectedYear - 1 };
    const entries = budgetRelevantEntries(entriesForSelectedPeriod(snapshot, lastYearSettings), settings);
    if (entries.length === 0) return null;
    return {
      label: periodLabel(lastYearSettings, language),
      total: spendingStats(entries, snapshot).total,
    };
  }, [mode, settings, snapshot]);

  const monthlyBars = useMemo(
    () => monthlyTrendBars(calc.monthlyTrend, mode === "year" ? -1 : settings.selectedMonth),
    [calc.monthlyTrend, mode, settings.selectedMonth],
  );
  const weeklyBars = useMemo(
    () => weeklyTrendBars(calc.weeklyTrend, settings.selectedWeek, 12),
    [calc.weeklyTrend, settings.selectedWeek],
  );

  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
    [],
  );

  const money = (value: number | null | undefined) => formatDualMoney(value, settings);
  const tick = (value: number) => compactNumber(value);

  const total = stats.total;
  const utilisation = pacing?.utilisation ?? null;
  const currentPeriodLabel = periodLabel(settings, language);
  const dailyAvg = total != null && window.elapsedDays > 0 ? total / window.elapsedDays : null;

  // ── Chart inputs ──
  const trendBars = mode === "week" ? weeklyBars : monthlyBars;
  const trendEmphasis = trendBars.findIndex((bar) => bar.highlight);
  const budgetBase = calc.monthlyBudgetBase;
  const budgetReference: ChartReferenceLine[] =
    mode !== "week" && budgetBase > 0
      ? [{ value: budgetBase, label: t("chart.budgetLine", { amount: money(budgetBase) }) }]
      : [];

  const heatmapCells: HeatmapCell[] = (calendar ?? []).map((cell) => ({
    key: cell.date,
    day: cell.day,
    weekday: cell.weekday,
    label: dayFormatter.format(new Date(`${cell.date}T00:00:00Z`)),
    value: cell.value,
  }));

  const categoryRows: HorizontalBarRow[] = categories.slice(0, 10).map((entry) => {
    const caption = [
      entry.share != null ? t("stats.shareOfSpend", { percent: formatPercent(entry.share) }) : null,
      t("common.transactions", { count: entry.count }),
      entry.cap != null ? t("stats.capOf", { amount: money(entry.cap) }) : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      id: entry.categoryId,
      label: entry.category?.name ?? t("common.uncategorised"),
      value: entry.total,
      color: entry.category?.color ?? "#64748B",
      caption,
      marker: entry.cap != null && entry.cap > 0 ? { value: entry.cap, label: t("stats.monthlyCap") } : undefined,
      badge: entry.overCap ? "OVER CAP" : undefined,
      badgeTone: entry.overCap ? "danger" : "neutral",
    };
  });

  const recurringTone = "var(--accent)";
  const oneOffTone = "var(--teal)";

  return (
    <div className="page-enter" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 24 }}>
      {/* Historical banner */}
      {isHistorical && (
        <div
          style={{
            background: "var(--accent-soft)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "12px 16px",
            color: "var(--text-secondary)",
            fontSize: 13,
          }}
        >
          {t("stats.viewingHistoricalDataAllFigures")}
        </div>
      )}

      {/* ── Overview ───────────────────────────────────────────────────────── */}
      <Section title={`${t("stats.overview")} · ${currentPeriodLabel}`}>
        <div className="card" style={{ padding: 20, display: "grid", gap: 20, minWidth: 0 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
              gap: 20,
              alignItems: "center",
              minWidth: 0,
            }}
          >
            <ProgressRing
              value={health.score}
              valueText={health.score != null ? String(health.score) : "—"}
              label={health.grade ? t(`health.grade.${health.grade}`) : t("health.notEnoughData")}
              caption={t("stats.financialHealth")}
              ariaLabel={
                health.score != null
                  ? t("stats.healthAria", { score: health.score, grade: t(`health.grade.${health.grade}`) })
                  : t("stats.healthUnavailable")
              }
              color={health.grade ? GRADE_COLOR[health.grade] : "var(--text-tertiary)"}
              size={190}
              scaleLabels={["0", "100"]}
            />

            <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
              <span className="text-footnote">{t("stats.spentPeriod", { period: currentPeriodLabel })}</span>
              <span style={{ fontSize: "clamp(1.75rem, 7vw, 2.5rem)", fontWeight: 700, lineHeight: 1.1 }}>
                {total != null ? money(total) : t("common.noData")}
              </span>
              <span
                className="text-caption"
                style={{
                  color:
                    comparison.deltaAbs == null
                      ? "var(--text-tertiary)"
                      : comparison.deltaAbs > 0
                      ? "var(--danger-text)"
                      : "var(--success-text)",
                  fontWeight: 600,
                }}
              >
                {comparison.deltaAbs != null
                  ? t("stats.deltaVsPrevious", {
                      arrow: comparison.deltaAbs > 0 ? "▲" : "▼",
                      amount: money(Math.abs(comparison.deltaAbs)),
                      period: comparison.previousLabel,
                    })
                  : t("stats.noComparable", { period: comparison.previousLabel })}
              </span>
              {/* A sparkline needs two points to be a line, and the caption
                  under it said "Last 8 months" in English on every one of the
                  five languages — the period word was the raw enum with an "s"
                  glued on. The line carries its own accessible name, which is
                  where that sentence belongs, so the caption is gone rather
                  than translated: it repeated what the axis of the chart above
                  already shows. */}
              {recentBars.length > 1 && (
                <Sparkline
                  values={recentBars.map((bar) => bar.value)}
                  ariaLabel={t("stats.ariaRecent", { count: recentBars.length, period: t(`period.${mode}`) })}
                  fluid
                  height={38}
                />
              )}
            </div>
          </div>

          <StatRow
            items={[
              {
                label: t("stats.transactions"),
                value: String(stats.count),
                detail: window.elapsedDays > 0 ? t("stats.overDays", { count: window.elapsedDays }) : t("stats.periodNotStarted"),
              },
              { label: t("stats.dailyAverage"), value: dailyAvg != null ? money(dailyAvg) : "—" },
              {
                label: t("stats.budgetLeft"),
                value: pacing != null ? money(pacing.remaining) : "—",
                detail: pacing != null ? t("stats.ofBudget", { amount: money(pacing.budget) }) : t("stats.monthViewOnly"),
                tone: pacing == null ? undefined : pacing.remaining < 0 ? "negative" : "positive",
              },
              {
                label: t("stats.burnRate"),
                value: utilisation != null ? `${utilisation.toFixed(0)}%` : "—",
                detail: t("stats.ofMonthlyBudget"),
                tone:
                  utilisation == null ? undefined : utilisation >= 100 ? "negative" : utilisation >= 80 ? "warning" : "positive",
              },
              { label: t("nav.wallet"), value: money(calc.wallet.walletTotal) },
              {
                label: t("nav.wishlist"),
                value: money(calc.wishlist.activeTotal),
                detail: t("stats.activeItems", { count: calc.wishlist.activeCount }),
              },
            ]}
          />

          {health.factors.length > 0 && (
            <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
              {health.factors.map((factor) => (
                <div key={factor.id} style={{ display: "grid", gap: 4, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                    <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{t(factor.labelKey)}</span>
                    <span style={{ color: "var(--text-tertiary)", textAlign: "right", minWidth: 0 }}>
                      {factor.detailKey ? t(factor.detailKey, factor.detailParams) : null}
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: "var(--bg-inset)", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.round(factor.score)}%`,
                        height: "100%",
                        borderRadius: 99,
                        background:
                          factor.score >= 70 ? "var(--success)" : factor.score >= 45 ? "var(--warning)" : "var(--danger)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* ── Spending ───────────────────────────────────────────────────────── */}
      <Section title={t("nav.spending")} collapsible>
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <ChartCard
            title={mode === "week" ? t("stats.weeklyTrend") : t("stats.spendingThrough", { year: settings.selectedYear })}
          >
            {trendBars.length === 0 || trendBars.every((bar) => bar.value == null) ? (
              <ChartPlaceholder height={180} message={t("stats.noSpendingRecordedYetFor")} />
            ) : (
              <LineChart
                title={t("stats.ariaTrend", { currency: settings.baseCurrency })}
                labels={trendBars.map((bar) => bar.label)}
                series={[
                  {
                    id: "spend",
                    name: t("chart.spend"),
                    color: "var(--accent)",
                    values: trendBars.map((bar) => bar.value),
                    area: true,
                  },
                ]}
                referenceLines={budgetReference}
                emphasisIndex={trendEmphasis >= 0 ? trendEmphasis : undefined}
                formatValue={money}
                formatTick={tick}
                height={220}
                showLegend={budgetReference.length > 0}
              />
            )}
          </ChartCard>

          {calendar && (
            <ChartCard
              title={mode === "week" ? t("stats.dailyThisWeek") : t("stats.daily")}
            >
              <Heatmap
                cells={heatmapCells}
                title={t("stats.ariaCalendar", { period: currentPeriodLabel })}
                formatValue={money}
              />
            </ChartCard>
          )}

          {stats.count > 0 && (
            <div className="card" style={{ padding: 16, minWidth: 0 }}>
              <StatRow
                items={[
                  { label: t("report.averageTransaction"), value: money(stats.average) },
                  { label: t("stats.medianTransaction"), value: money(stats.median) },
                  { label: t("report.largestTransaction"), value: money(stats.largest) },
                  { label: t("stats.transactions"), value: String(stats.count) },
                ]}
              />
            </div>
          )}
        </div>
      </Section>

      {/* ── Budget ─────────────────────────────────────────────────────────── */}
      <Section title={t("settings.budget")} collapsible defaultOpen={false}>
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <ChartCard
            title={t("stats.budgetVsActual")}
            subtitle={
              budgetBase > 0
                ? t("stats.budgetReference", { amount: money(budgetBase) })
                : t("stats.noBudgetReference")
            }
          >
            {monthlyBars.every((bar) => bar.value == null) ? (
              <ChartPlaceholder height={180} message={t("stats.noMonthlySpendingRecordedFor")} />
            ) : (
              <BarChart
                title={t("stats.ariaBudget", { currency: settings.baseCurrency })}
                bars={monthlyBars.map((bar) => ({
                  label: bar.label,
                  value: bar.value,
                  highlight: bar.highlight,
                }))}
                referenceLines={budgetBase > 0 ? [{ value: budgetBase, label: t("chart.budgetLine", { amount: money(budgetBase) }) }] : []}
                formatValue={money}
                formatTick={tick}
                height={200}
              />
            )}
          </ChartCard>

          {forecast ? (
            <ChartCard
              title={t("dashboard.forecast")}
            >
              <LineChart
                title={t("stats.ariaForecast", { currency: settings.baseCurrency })}
                labels={forecast.labels}
                series={[
                  {
                    id: "actual",
                    name: t("stats.actualSoFar"),
                    color: "var(--accent)",
                    values: forecast.actual,
                    area: true,
                  },
                  {
                    id: "projected",
                    name: t("stats.projectedAtPace"),
                    color: "var(--warning-text)",
                    values: forecast.projected,
                    dashed: true,
                  },
                ]}
                referenceLines={
                  forecast.budget != null ? [{ value: forecast.budget, label: t("chart.budgetLine", { amount: money(forecast.budget) }) }] : []
                }
                formatValue={money}
                formatTick={tick}
                height={220}
              />
              {pacing != null && (
                <StatRow
                  items={[
                    {
                      label: t("stats.projectedTotal"),
                      value: pacing.projectedTotal != null ? money(pacing.projectedTotal) : "—",
                    },
                    {
                      label: t("stats.projectedEnd"),
                      value:
                        pacing.projectedRemaining != null
                          ? pacing.projectedRemaining < 0
                            ? `${money(Math.abs(pacing.projectedRemaining))} over`
                            : `${money(pacing.projectedRemaining)} left`
                          : "—",
                      tone:
                        pacing.projectedRemaining == null
                          ? undefined
                          : pacing.projectedRemaining < 0
                          ? "negative"
                          : "positive",
                    },
                    {
                      label: t("stats.stayOnBudgetPace"),
                      value: pacing.requiredDailyPace != null ? `${money(pacing.requiredDailyPace)}/day` : "—",
                      detail: `${pacing.daysLeft} day${pacing.daysLeft !== 1 ? "s" : ""} left`,
                    },
                    {
                      label: t("stats.spentSoFar"),
                      value: money(pacing.spent),
                      detail: utilisation != null ? t("stats.ofBudgetPercent", { percent: Math.round(utilisation) }) : undefined,
                      tone: utilisation != null && utilisation >= 100 ? "negative" : undefined,
                    },
                  ]}
                />
              )}
            </ChartCard>
          ) : (
            <div className="card card-body" style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              {mode === "year"
                ? t("stats.forecastModeHint")
                : t("stats.forecastEmpty")}
            </div>
          )}
        </div>
      </Section>

      {/* ── Categories ─────────────────────────────────────────────────────── */}
      <Section title={t("nav.categories")} collapsible defaultOpen={false}>
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <ChartCard
            title={t("dashboard.whereTheMoneyWent")}
          >
            {categoryRows.length === 0 ? (
              <EmptyState
                title={t("stats.noSpendingForThisPeriod")}
                description={t("stats.zeroRecordedSpendingAndUnavailable")}
              />
            ) : (
              <>
                <HorizontalBarChart
                  title={t("stats.ariaCategories", { currency: settings.baseCurrency })}
                  rows={categoryRows}
                  formatValue={money}
                />
                {categories.length > categoryRows.length && (
                  <span className="text-caption" style={{ color: "var(--text-tertiary)" }}>
                    +{categories.length - categoryRows.length} smaller categor
                    {categories.length - categoryRows.length === 1 ? "y" : "ies"} not shown
                  </span>
                )}
                {overCap.length > 0 && (
                  <span className="text-caption" style={{ color: "var(--danger-text)", fontWeight: 600 }}>
                    {t("stats.categoriesOverCap", { count: overCap.length })}
                  </span>
                )}
              </>
            )}
          </ChartCard>

          <ChartCard
            title={t("stats.categoryEvolution")}
            subtitle={t("stats.topCategories", { count: categoryEvolution.series.length || 4, year: settings.selectedYear })}
          >
            {categoryEvolution.series.length === 0 ? (
              <ChartPlaceholder height={180} message={t("stats.noCategoryHistoryRecordedFor")} />
            ) : (
              <LineChart
                title={t("stats.ariaPerCategory", { currency: settings.baseCurrency })}
                labels={categoryEvolution.labels}
                series={categoryEvolution.series.map((series) => ({
                  id: series.categoryId,
                  name: series.name,
                  color: series.color,
                  values: series.values,
                }))}
                emphasisIndex={mode === "year" ? undefined : settings.selectedMonth - 1}
                formatValue={money}
                formatTick={tick}
                height={230}
              />
            )}
          </ChartCard>
        </div>
      </Section>

      {/* ── Recurring ──────────────────────────────────────────────────────── */}
      <Section title={t("report.recurring")} collapsible defaultOpen={false}>
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <ChartCard
            title={t("stats.committedVsDiscretionary")}
            subtitle={t("stats.recurringCoversWeeklyMonthlyYearly")}
          >
            <DonutChart
              title={t("stats.ariaRecurring", { period: currentPeriodLabel })}
              segments={[
                { id: "recurring", label: t("common.recurring"), value: stats.recurringTotal, color: recurringTone },
                { id: "oneoff", label: t("common.oneOff"), value: stats.oneOffTotal, color: oneOffTone },
              ]}
              centerValue={total != null ? money(total) : "—"}
              centerLabel="total spend"
              formatValue={money}
              size={200}
              emptyMessage={t("report.noSpending")}
            />
            {stats.count > 0 && (
              <StatRow
                items={[
                  {
                    label: t("common.recurring"),
                    value: money(stats.recurringTotal),
                    detail: `${t("dashboard.transactionCount", { count: stats.recurringCount })}${
                      stats.recurringShare != null ? ` · ${stats.recurringShare.toFixed(0)}%` : ""
                    }`,
                  },
                  {
                    label: t("common.oneOff"),
                    value: money(stats.oneOffTotal),
                    detail: `${t("dashboard.transactionCount", { count: stats.oneOffCount })}${
                      stats.recurringShare != null ? ` · ${(100 - stats.recurringShare).toFixed(0)}%` : ""
                    }`,
                  },
                ]}
                columns={140}
              />
            )}
          </ChartCard>

          <ChartCard
            title={t("stats.commitmentLoad", { year: settings.selectedYear })}
            subtitle={t("stats.howMuchOfEachMonth")}
          >
            {recurringSplit.recurring.every((value) => value == null) ? (
              <ChartPlaceholder height={180} message={t("stats.noSpendingRecordedForThis")} />
            ) : (
              <StackedBarChart
                title={t("stats.ariaCommitment", { currency: settings.baseCurrency })}
                labels={recurringSplit.labels}
                series={[
                  { id: "recurring", name: t("common.recurring"), color: recurringTone, values: recurringSplit.recurring },
                  { id: "oneoff", name: t("common.oneOff"), color: oneOffTone, values: recurringSplit.oneOff },
                ]}
                emphasisIndex={mode === "year" ? undefined : settings.selectedMonth - 1}
                referenceLines={budgetBase > 0 ? [{ value: budgetBase, label: t("chart.budgetLine", { amount: money(budgetBase) }) }] : []}
                formatValue={money}
                formatTick={tick}
                height={220}
              />
            )}
          </ChartCard>
        </div>
      </Section>

      {/* ── Activities ─────────────────────────────────────────────────────── */}
      <Section title={t("stats.activityCost")} collapsible defaultOpen={false}>
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          {activityCosts.items.length === 0 ? (
            <EmptyState title={t("stats.noActivities")} description={t("stats.noActivitiesBody")} />
          ) : (
            <>
              <ChartCard
                title={t("stats.activityShare")}
                subtitle={`${money(activityCosts.yearly.personal)} ${t("common.perYear")} · ${t("stats.ofWhatYouPay")}`}
                note={
                  activityCosts.externallyFundedCount > 0
                    ? t("stats.notYours", { count: activityCosts.externallyFundedCount })
                    : undefined
                }
              >
                {/* The user's own activities against the user's own yearly
                    total. An activity somebody else pays for costs this budget
                    nothing, so it has no share of it — it appears in the
                    funding split below, where the question is who paid. */}
                <HorizontalBarChart
                  title={t("stats.activityShare")}
                  rows={activityCosts.shares.slice(0, 12).map((share) => ({
                    id: share.activity.id,
                    label: share.activity.name,
                    value: share.yearlyBase,
                    color: share.activity.color ?? FUNDING_META.personal.color,
                    caption: [
                      share.share != null ? `${share.share.toFixed(1)}%` : null,
                      `${money(share.monthlyBase)} ${t("common.perMonth")}`,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  }))}
                  formatValue={money}
                />
                {activityCosts.shares.length > 12 && (
                  <span className="text-caption" style={{ color: "var(--text-tertiary)" }}>
                    +{activityCosts.shares.length - 12}
                  </span>
                )}
              </ChartCard>

              <ChartCard title={t("stats.fundingSplit")} subtitle={t("stats.ofAllActivityCost")}>
                {/* Three slices, never two: "paid by others" and "outside
                    budget" behave identically against the budget and answer
                    different questions, so collapsing them here would destroy
                    the only place the difference is visible. */}
                <DonutChart
                  title={t("stats.fundingSplit")}
                  segments={FUNDING_KINDS.map((kind) => ({
                    id: kind,
                    label: t(`funding.${kind}.short`),
                    value: activityCosts.yearly[kind],
                    color: FUNDING_META[kind].color,
                  }))}
                  centerValue={money(activityCosts.yearly.gross)}
                  centerLabel={t("stats.grossCost")}
                  formatValue={money}
                  size={200}
                  emptyMessage={t("stats.noActivitiesBody")}
                />
                {/* The donut's own legend already carries every percentage.
                    Repeating them here as "· 43.0% of the total" restated the
                    chart directly under it — and said "the total" about a
                    whole that the chart two cards above uses a different one
                    for, which is the ambiguity that made a reader believe
                    money somebody else pays had got into their own share. */}
                <StatRow
                  columns={150}
                  items={FUNDING_KINDS.map((kind) => ({
                    label: `${FUNDING_META[kind].glyph} ${t(`funding.${kind}.short`)}`,
                    value: money(activityCosts.yearly[kind]),
                    detail: `${money(activityCosts.monthly[kind])} ${t("common.perMonth")}`,
                    tone: kind === "personal" ? undefined : ("warning" as const),
                  }))}
                />
              </ChartCard>

              <div className="card" style={{ padding: 16, minWidth: 0 }}>
                <StatRow
                  columns={150}
                  items={[
                    {
                      label: t("stats.grossCost"),
                      value: money(activityCosts.yearly.gross),
                      detail: `${money(activityCosts.monthly.gross)} ${t("common.perMonth")}`,
                    },
                    {
                      label: t("stats.budgetRelevant"),
                      value: money(activityCosts.yearly.personal),
                      detail: `${money(activityCosts.monthly.personal)} ${t("common.perMonth")}`,
                    },
                    {
                      label: t("activities.requiredThisMonth", { month: periodLabel(settings, language) }),
                      value: money(activityCosts.requiredThisMonth.personal),
                      detail: t("activities.requiredThisMonthHint"),
                    },
                    ...(activityCosts.unscheduled.length > 0
                      ? [
                          {
                            label: t("activities.dateUnknown"),
                            value: String(activityCosts.unscheduled.length),
                            detail: money(activityCosts.unscheduledMonthly.gross),
                            tone: "warning" as const,
                          },
                        ]
                      : []),
                  ]}
                />
              </div>
            </>
          )}
        </div>
      </Section>

      {/* ── History ────────────────────────────────────────────────────────── */}
      <Section title={t("nav.history")} collapsible defaultOpen={false}>
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <ChartCard
            title={t("stats.periodComparison")}
            subtitle={t("stats.recentHint", { count: recentBars.length, period: t(`period.${mode}`) })}
          >
            <BarChart
              title={t("stats.ariaRecentCurrency", { count: recentBars.length, period: t(`period.${mode}`), currency: settings.baseCurrency })}
              bars={recentBars.map((bar) => ({ label: bar.label, value: bar.value, highlight: bar.highlight }))}
              formatValue={money}
              formatTick={tick}
              height={200}
            />
            <StatRow
              items={[
                {
                  label: t("dashboard.versus", { period: comparison.previousLabel }),
                  value:
                    comparison.deltaAbs != null
                      ? formatDualMoney(comparison.deltaAbs, settings, { showSign: true })
                      : t("common.noData"),
                  detail:
                    comparison.deltaPct != null
                      ? t("stats.vsPrevious", { change: `${comparison.deltaPct > 0 ? "+" : ""}${comparison.deltaPct.toFixed(1)}%`, period: t(`period.${mode}`) })
                      : comparison.previousTotal == null
                      ? "previous period has no records"
                      : "current period has no records",
                  tone: comparison.deltaAbs == null ? undefined : comparison.deltaAbs > 0 ? "negative" : "positive",
                },
                {
                  label: t("stats.previousPeriod"),
                  value: comparison.previousTotal != null ? money(comparison.previousTotal) : t("common.noData"),
                  detail: comparison.previousLabel,
                },
                ...(lastYearComparison
                  ? [
                      {
                        label: t("stats.sameMonthLastYear"),
                        value: money(lastYearComparison.total),
                        detail: lastYearComparison.label,
                      },
                    ]
                  : []),
                {
                  label: t("stats.rolloverToDate"),
                  value: formatDualMoney(calc.wallet.rolloverTotal, settings, { showSign: true }),
                  detail: t("stats.rolloverDetail"),
                  tone: calc.wallet.rolloverTotal >= 0 ? "positive" : "negative",
                },
              ]}
            />
          </ChartCard>
        </div>
      </Section>
    </div>
  );
};
