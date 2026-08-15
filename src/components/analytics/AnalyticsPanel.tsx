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
 *  - piloting spend stays visible but never enters a share percentage;
 *  - currency conversion is presentation only (formatDualMoney / normalizeEntry).
 */

// ─── Local layout primitives ─────────────────────────────────────────────────

const ChartCard: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, children }) => (
  <div className="card" style={{ padding: 16, display: "grid", gap: 14, minWidth: 0 }}>
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
                ? "var(--success)"
                : item.tone === "negative"
                ? "var(--danger)"
                : item.tone === "warning"
                ? "var(--warning)"
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
  Excellent: "var(--success)",
  Good: "var(--success)",
  Fair: "var(--warning)",
  "At risk": "var(--danger)",
};

// ─── Main Panel ───────────────────────────────────────────────────────────────

export const AnalyticsPanel: React.FC = () => {
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
  const comparison = useMemo(() => periodComparison(snapshot, settings), [snapshot, settings]);
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
      label: periodLabel(lastYearSettings),
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
  const currentPeriodLabel = periodLabel(settings);
  const dailyAvg = total != null && window.elapsedDays > 0 ? total / window.elapsedDays : null;

  // ── Chart inputs ──
  const trendBars = mode === "week" ? weeklyBars : monthlyBars;
  const trendEmphasis = trendBars.findIndex((bar) => bar.highlight);
  const budgetBase = calc.monthlyBudgetBase;
  const budgetReference: ChartReferenceLine[] =
    mode !== "week" && budgetBase > 0
      ? [{ value: budgetBase, label: `Budget ${money(budgetBase)}` }]
      : [];

  const heatmapCells: HeatmapCell[] = (calendar ?? []).map((cell) => ({
    key: cell.date,
    day: cell.day,
    weekday: cell.weekday,
    label: dayFormatter.format(new Date(`${cell.date}T00:00:00Z`)),
    value: cell.value,
  }));

  const categoryRows: HorizontalBarRow[] = categories.slice(0, 10).map((entry) => {
    const isPiloting = entry.category?.bucket === "piloting";
    const caption = [
      entry.share != null
        ? `${entry.share.toFixed(1)}% of tracked spend`
        : isPiloting
        ? "Piloting — excluded from shares"
        : null,
      `${entry.count} transaction${entry.count !== 1 ? "s" : ""}`,
      entry.cap != null ? `cap ${money(entry.cap)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      id: entry.categoryId,
      label: entry.category?.name ?? "Uncategorized",
      value: entry.total,
      color: entry.category?.color ?? "#64748B",
      caption,
      marker: entry.cap != null && entry.cap > 0 ? { value: entry.cap, label: "Monthly cap" } : undefined,
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
          📚 Viewing historical data — all figures are read-only records.
        </div>
      )}

      {/* ── Overview ───────────────────────────────────────────────────────── */}
      <Section title={`Overview · ${currentPeriodLabel}`}>
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
              label={health.grade ?? "Not enough data"}
              caption="Financial health"
              ariaLabel={
                health.score != null
                  ? `Financial health score ${health.score} out of 100 — ${health.grade}`
                  : "Financial health score unavailable for this period"
              }
              color={health.grade ? GRADE_COLOR[health.grade] : "var(--text-tertiary)"}
              size={190}
              scaleLabels={["0", "100"]}
            />

            <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
              <span className="text-footnote">Spent · {currentPeriodLabel}</span>
              <span style={{ fontSize: "clamp(1.75rem, 7vw, 2.5rem)", fontWeight: 700, lineHeight: 1.1 }}>
                {total != null ? money(total) : "No data"}
              </span>
              <span
                className="text-caption"
                style={{
                  color:
                    comparison.deltaAbs == null
                      ? "var(--text-tertiary)"
                      : comparison.deltaAbs > 0
                      ? "var(--danger)"
                      : "var(--success)",
                  fontWeight: 600,
                }}
              >
                {comparison.deltaAbs != null
                  ? `${comparison.deltaAbs > 0 ? "▲" : "▼"} ${money(Math.abs(comparison.deltaAbs))} vs ${comparison.previousLabel}`
                  : `No comparable data for ${comparison.previousLabel}`}
              </span>
              <Sparkline
                values={recentBars.map((bar) => bar.value)}
                ariaLabel={`Spending across the last ${recentBars.length} ${mode}s`}
                fluid
                height={38}
              />
              <span className="text-footnote">Last {recentBars.length} {mode}s</span>
            </div>
          </div>

          <StatRow
            items={[
              {
                label: "Transactions",
                value: String(stats.count),
                detail: window.elapsedDays > 0 ? `over ${window.elapsedDays} day${window.elapsedDays !== 1 ? "s" : ""}` : "period not started",
              },
              { label: "Daily average", value: dailyAvg != null ? money(dailyAvg) : "—" },
              {
                label: "Budget left",
                value: pacing != null ? money(pacing.remaining) : "—",
                detail: pacing != null ? `of ${money(pacing.budget)}` : "month view only",
                tone: pacing == null ? undefined : pacing.remaining < 0 ? "negative" : "positive",
              },
              {
                label: "Burn rate",
                value: utilisation != null ? `${utilisation.toFixed(0)}%` : "—",
                detail: "of monthly budget",
                tone:
                  utilisation == null ? undefined : utilisation >= 100 ? "negative" : utilisation >= 80 ? "warning" : "positive",
              },
              { label: "Wallet", value: money(calc.wallet.walletTotal) },
              {
                label: "Wishlist",
                value: money(calc.wishlist.activeTotal),
                detail: `${calc.wishlist.activeCount} active item${calc.wishlist.activeCount !== 1 ? "s" : ""}`,
              },
            ]}
          />

          {health.factors.length > 0 && (
            <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
              {health.factors.map((factor) => (
                <div key={factor.id} style={{ display: "grid", gap: 4, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                    <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{factor.label}</span>
                    <span style={{ color: "var(--text-tertiary)", textAlign: "right", minWidth: 0 }}>
                      {factor.detail}
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
      <Section title="Spending">
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <ChartCard
            title={mode === "week" ? "Weekly trend" : `Spending through ${settings.selectedYear}`}
            subtitle={
              mode === "week"
                ? "Twelve weeks around the selected week · unrecorded weeks are left blank"
                : "Monthly totals · unrecorded months break the line rather than reading as zero"
            }
          >
            {trendBars.length === 0 || trendBars.every((bar) => bar.value == null) ? (
              <ChartPlaceholder height={180} message="No spending recorded yet for this window." />
            ) : (
              <LineChart
                title={`Spending trend in ${settings.baseCurrency}`}
                labels={trendBars.map((bar) => bar.label)}
                series={[
                  {
                    id: "spend",
                    name: "Spend",
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
              title={mode === "week" ? "Daily spending this week" : "Daily spending"}
              subtitle="Darker days cost more · dashed days are not recorded yet"
            >
              <Heatmap
                cells={heatmapCells}
                title={`Daily spending calendar for ${currentPeriodLabel}`}
                formatValue={money}
              />
            </ChartCard>
          )}

          {stats.count > 0 && (
            <div className="card" style={{ padding: 16, minWidth: 0 }}>
              <StatRow
                items={[
                  { label: "Average transaction", value: money(stats.average) },
                  { label: "Median transaction", value: money(stats.median) },
                  { label: "Largest transaction", value: money(stats.largest) },
                  { label: "Transactions", value: String(stats.count) },
                ]}
              />
            </div>
          )}
        </div>
      </Section>

      {/* ── Budget ─────────────────────────────────────────────────────────── */}
      <Section title="Budget">
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <ChartCard
            title="Budget vs actual"
            subtitle={
              budgetBase > 0
                ? `Monthly budget of ${money(budgetBase)} shown as the dashed reference`
                : "Set a monthly budget in Settings to see the reference line"
            }
          >
            {monthlyBars.every((bar) => bar.value == null) ? (
              <ChartPlaceholder height={180} message="No monthly spending recorded for this year." />
            ) : (
              <BarChart
                title={`Monthly spend against budget in ${settings.baseCurrency}`}
                bars={monthlyBars.map((bar) => ({
                  label: bar.label,
                  value: bar.value,
                  highlight: bar.highlight,
                }))}
                referenceLines={budgetBase > 0 ? [{ value: budgetBase, label: `Budget ${money(budgetBase)}` }] : []}
                formatValue={money}
                formatTick={tick}
                height={200}
              />
            )}
          </ChartCard>

          {forecast ? (
            <ChartCard
              title="Forecast"
              subtitle="Cumulative spend so far, extended at the current pace to the end of the period"
            >
              <LineChart
                title={`Cumulative spend and projection in ${settings.baseCurrency}`}
                labels={forecast.labels}
                series={[
                  {
                    id: "actual",
                    name: "Actual so far",
                    color: "var(--accent)",
                    values: forecast.actual,
                    area: true,
                  },
                  {
                    id: "projected",
                    name: "Projected at this pace",
                    color: "var(--warning)",
                    values: forecast.projected,
                    dashed: true,
                  },
                ]}
                referenceLines={
                  forecast.budget != null ? [{ value: forecast.budget, label: `Budget ${money(forecast.budget)}` }] : []
                }
                formatValue={money}
                formatTick={tick}
                height={220}
              />
              {pacing != null && (
                <StatRow
                  items={[
                    {
                      label: "Projected total",
                      value: pacing.projectedTotal != null ? money(pacing.projectedTotal) : "—",
                    },
                    {
                      label: "Projected end of month",
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
                      label: "Stay-on-budget pace",
                      value: pacing.requiredDailyPace != null ? `${money(pacing.requiredDailyPace)}/day` : "—",
                      detail: `${pacing.daysLeft} day${pacing.daysLeft !== 1 ? "s" : ""} left`,
                    },
                    {
                      label: "Spent so far",
                      value: money(pacing.spent),
                      detail: utilisation != null ? `${utilisation.toFixed(0)}% of budget` : undefined,
                      tone: utilisation != null && utilisation >= 100 ? "negative" : undefined,
                    },
                  ]}
                />
              )}
            </ChartCard>
          ) : (
            <div className="card card-body" style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              {mode === "year"
                ? "Forecasting works on month and week views — the budget itself is defined monthly."
                : "No spending recorded for this period yet, so there is nothing to project."}
            </div>
          )}
        </div>
      </Section>

      {/* ── Categories ─────────────────────────────────────────────────────── */}
      <Section title="Categories">
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <ChartCard
            title="Where the money went"
            subtitle="Each bar carries its category's own colour · piloting stays visible but never enters a share"
          >
            {categoryRows.length === 0 ? (
              <EmptyState
                title="No spending for this period"
                description="Zero recorded spending and unavailable historical data remain distinct."
              />
            ) : (
              <>
                <HorizontalBarChart
                  title={`Spending by category in ${settings.baseCurrency}`}
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
                  <span className="text-caption" style={{ color: "var(--danger)", fontWeight: 600 }}>
                    {overCap.length} categor{overCap.length === 1 ? "y is" : "ies are"} over cap
                  </span>
                )}
              </>
            )}
          </ChartCard>

          <ChartCard
            title="Category evolution"
            subtitle={`Top ${categoryEvolution.series.length || 4} categories across ${settings.selectedYear}`}
          >
            {categoryEvolution.series.length === 0 ? (
              <ChartPlaceholder height={180} message="No category history recorded for this year." />
            ) : (
              <LineChart
                title={`Monthly spend per category in ${settings.baseCurrency}`}
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
      <Section title="Recurring">
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <ChartCard
            title="Committed vs discretionary"
            subtitle="Recurring covers weekly, monthly, yearly and session costs"
          >
            <DonutChart
              title={`Recurring versus one-off spending for ${currentPeriodLabel}`}
              segments={[
                { id: "recurring", label: "Recurring", value: stats.recurringTotal, color: recurringTone },
                { id: "oneoff", label: "One-off", value: stats.oneOffTotal, color: oneOffTone },
              ]}
              centerValue={total != null ? money(total) : "—"}
              centerLabel="total spend"
              formatValue={money}
              size={200}
              emptyMessage="No spending recorded for this period."
            />
            {stats.count > 0 && (
              <StatRow
                items={[
                  {
                    label: "Recurring",
                    value: money(stats.recurringTotal),
                    detail: `${stats.recurringCount} transaction${stats.recurringCount !== 1 ? "s" : ""}${
                      stats.recurringShare != null ? ` · ${stats.recurringShare.toFixed(0)}%` : ""
                    }`,
                  },
                  {
                    label: "One-off",
                    value: money(stats.oneOffTotal),
                    detail: `${stats.oneOffCount} transaction${stats.oneOffCount !== 1 ? "s" : ""}${
                      stats.recurringShare != null ? ` · ${(100 - stats.recurringShare).toFixed(0)}%` : ""
                    }`,
                  },
                ]}
                columns={140}
              />
            )}
          </ChartCard>

          <ChartCard
            title={`Commitment load through ${settings.selectedYear}`}
            subtitle="How much of each month was already spoken for"
          >
            {recurringSplit.recurring.every((value) => value == null) ? (
              <ChartPlaceholder height={180} message="No spending recorded for this year." />
            ) : (
              <StackedBarChart
                title={`Recurring and one-off spend per month in ${settings.baseCurrency}`}
                labels={recurringSplit.labels}
                series={[
                  { id: "recurring", name: "Recurring", color: recurringTone, values: recurringSplit.recurring },
                  { id: "oneoff", name: "One-off", color: oneOffTone, values: recurringSplit.oneOff },
                ]}
                emphasisIndex={mode === "year" ? undefined : settings.selectedMonth - 1}
                referenceLines={budgetBase > 0 ? [{ value: budgetBase, label: `Budget ${money(budgetBase)}` }] : []}
                formatValue={money}
                formatTick={tick}
                height={220}
              />
            )}
          </ChartCard>
        </div>
      </Section>

      {/* ── History ────────────────────────────────────────────────────────── */}
      <Section title="History">
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <ChartCard
            title="Period comparison"
            subtitle={`The last ${recentBars.length} ${mode}s · "?" marks periods with no records`}
          >
            <BarChart
              title={`Spending across the last ${recentBars.length} ${mode}s in ${settings.baseCurrency}`}
              bars={recentBars.map((bar) => ({ label: bar.label, value: bar.value, highlight: bar.highlight }))}
              formatValue={money}
              formatTick={tick}
              height={200}
            />
            <StatRow
              items={[
                {
                  label: `vs ${comparison.previousLabel}`,
                  value:
                    comparison.deltaAbs != null
                      ? formatDualMoney(comparison.deltaAbs, settings, { showSign: true })
                      : "No data",
                  detail:
                    comparison.deltaPct != null
                      ? `${comparison.deltaPct > 0 ? "+" : ""}${comparison.deltaPct.toFixed(1)}% vs previous ${mode}`
                      : comparison.previousTotal == null
                      ? "previous period has no records"
                      : "current period has no records",
                  tone: comparison.deltaAbs == null ? undefined : comparison.deltaAbs > 0 ? "negative" : "positive",
                },
                {
                  label: "Previous period",
                  value: comparison.previousTotal != null ? money(comparison.previousTotal) : "No data",
                  detail: comparison.previousLabel,
                },
                ...(lastYearComparison
                  ? [
                      {
                        label: "Same month last year",
                        value: money(lastYearComparison.total),
                        detail: lastYearComparison.label,
                      },
                    ]
                  : []),
                {
                  label: "Rollover to date",
                  value: formatDualMoney(calc.wallet.rolloverTotal, settings, { showSign: true }),
                  detail: "accumulated month-end rollovers",
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
