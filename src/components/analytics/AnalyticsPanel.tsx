import React, { useMemo } from "react";
import { calculateYear, normalizeEntry } from "../../domain/calculations";
import { selectedIsoWeekYear, isHistoricalPeriod, periodLabel } from "../../domain/periods";
import { weekYear } from "../../domain/dates";
import { useBudgetStore } from "../../store/budgetStore";
import { formatDualMoney } from "../../utils/formatters";
import { EmptyState } from "../ui/EmptyState";
import { Metric } from "../ui/Metric";
import { Section } from "../ui/Section";
import { Progress } from "../ui/Progress";

// ─── SVG Sparkline Bar Chart ─────────────────────────────────────────────────

interface BarChartProps {
  bars: { label: string; value: number | null; highlight?: boolean }[];
  height?: number;
}

const BarChart: React.FC<BarChartProps> = ({ bars, height = 80 }) => {
  const maxVal = Math.max(...bars.map((b) => b.value ?? 0), 1);
  const barWidth = 100 / bars.length;

  return (
    <svg
      viewBox={`0 0 100 ${height + 18}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: height + 18, display: "block", overflow: "visible" }}
      aria-label="Spending trend chart"
    >
      {bars.map((bar, i) => {
        const hasValue = bar.value != null && bar.value >= 0;
        const barH = hasValue ? Math.max(2, (bar.value! / maxVal) * height) : 0;
        const x = i * barWidth + barWidth * 0.1;
        const w = barWidth * 0.8;
        const y = height - barH;
        return (
          <g key={i}>
            {hasValue ? (
              <rect
                x={x}
                y={y}
                width={w}
                height={barH}
                rx="1.5"
                fill={bar.highlight ? "var(--accent)" : "var(--bg-inset)"}
                opacity={bar.highlight ? 1 : 0.7}
              />
            ) : (
              <text
                x={x + w / 2}
                y={height - 4}
                textAnchor="middle"
                fontSize="5"
                fill="var(--text-tertiary)"
              >
                ?
              </text>
            )}
            <text
              x={x + w / 2}
              y={height + 14}
              textAnchor="middle"
              fontSize="5"
              fill={bar.highlight ? "var(--accent)" : "var(--text-tertiary)"}
              fontWeight={bar.highlight ? "600" : "400"}
            >
              {bar.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// ─── Priority / Tone helpers ──────────────────────────────────────────────────

function burnRateTone(pct: number): "success" | "warning" | "danger" | "neutral" {
  if (pct < 80) return "success";
  if (pct < 100) return "warning";
  return "danger";
}

const RECURRING_TYPES = new Set(["weekly", "monthly", "yearly", "session"]);

// ─── Main Panel ───────────────────────────────────────────────────────────────

export const AnalyticsPanel: React.FC = () => {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const { settings } = snapshot;
  const mode = settings.selectedPeriodMode ?? "month";
  const isHistorical = useMemo(() => isHistoricalPeriod(settings), [settings]);

  // calculateYear drives budget/trend data for the selected calendar year
  const calc = useMemo(() => calculateYear(snapshot), [snapshot]);

  // Collect entries for the selected period across ALL year records
  const periodEntries = useMemo(() => {
    const allEntries = Object.values(snapshot.years).flatMap((yr) => yr.spendingEntries);
    if (mode === "week") {
      const isoYear = selectedIsoWeekYear(settings);
      return allEntries.filter(
        (e) =>
          e.week === settings.selectedWeek &&
          weekYear(new Date(`${e.date}T12:00:00`)) === isoYear,
      );
    }
    if (mode === "year") {
      return allEntries.filter((e) => e.year === settings.selectedYear);
    }
    // month
    return allEntries.filter(
      (e) => e.year === settings.selectedYear && e.month === settings.selectedMonth,
    );
  }, [mode, settings, snapshot]);

  // Optionally filter out non-personal spend
  const includedEntries = useMemo(() => {
    return settings.ignoreNonBudgetSpending
      ? periodEntries.filter((e) => (e.source ?? "personal") === "personal")
      : periodEntries;
  }, [periodEntries, settings.ignoreNonBudgetSpending]);

  // Total spend (base currency)
  const periodTotal = useMemo(
    () => includedEntries.reduce((s, e) => s + normalizeEntry(e, snapshot), 0),
    [includedEntries, snapshot],
  );

  // Category breakdown
  const categoryMap = useMemo(
    () => new Map(snapshot.categories.map((c) => [c.id, c])),
    [snapshot.categories],
  );

  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of includedEntries) {
      totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + normalizeEntry(e, snapshot));
    }
    return [...totals.entries()]
      .map(([id, value]) => ({ category: categoryMap.get(id), value }))
      .sort((a, b) => b.value - a.value);
  }, [includedEntries, categoryMap, snapshot]);

  const normalTotal = useMemo(
    () =>
      categoryTotals
        .filter(({ category }) => category?.bucket !== "piloting")
        .reduce((s, { value }) => s + value, 0),
    [categoryTotals],
  );

  // Recurring vs non-recurring
  const { recurringTotal, nonRecurringTotal } = useMemo(() => {
    let rec = 0;
    let nonRec = 0;
    for (const e of includedEntries) {
      const norm = normalizeEntry(e, snapshot);
      if (RECURRING_TYPES.has(e.recurrenceType)) rec += norm;
      else nonRec += norm;
    }
    return { recurringTotal: rec, nonRecurringTotal: nonRec };
  }, [includedEntries, snapshot]);

  // Average transaction
  const avgTransaction =
    includedEntries.length > 0 ? periodTotal / includedEntries.length : null;

  // Budget remaining (month mode only — other modes show '—')
  const budgetRemaining = useMemo(() => {
    if (mode !== "month") return null;
    const summary = calc.selectedMonthSpend;
    if (summary.status !== "value" && summary.status !== "zero") return null;
    return calc.monthlyBudgetBase - (summary.total ?? 0);
  }, [mode, calc]);

  // Burn rate (% of budget consumed, month mode only)
  const burnRatePct = useMemo(() => {
    if (mode !== "month" || calc.monthlyBudgetBase <= 0) return null;
    return (periodTotal / calc.monthlyBudgetBase) * 100;
  }, [mode, periodTotal, calc.monthlyBudgetBase]);

  // Monthly trend bars (12 months)
  const monthlyBars = useMemo(() => {
    const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return calc.monthlyTrend.map((summary, i) => ({
      label: shortMonths[i],
      value: summary.status === "value" || summary.status === "zero" ? (summary.total ?? 0) : null,
      highlight: i + 1 === settings.selectedMonth,
    }));
  }, [calc.monthlyTrend, settings.selectedMonth]);

  // Weekly trend bars (first 26 weeks)
  const weeklyBars = useMemo(() => {
    return calc.weeklyTrend.slice(0, 26).map((summary, i) => ({
      label: String(i + 1),
      value: summary.status === "value" || summary.status === "zero" ? (summary.total ?? 0) : null,
      highlight: i + 1 === settings.selectedWeek,
    }));
  }, [calc.weeklyTrend, settings.selectedWeek]);

  const currentPeriodLabel = periodLabel(settings);

  return (
    <div className="page-enter" style={{ display: "grid", gap: 24 }}>
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

      {/* KPI metrics */}
      <Section title={`Analytics · ${currentPeriodLabel}`}>
        <div className="dashboard-hero">
          <Metric
            label="Period spending"
            value={formatDualMoney(periodTotal, settings)}
            detail={`${includedEntries.length} transaction${includedEntries.length !== 1 ? "s" : ""}`}
            tone={
              burnRatePct == null
                ? "neutral"
                : burnRatePct >= 100
                ? "negative"
                : burnRatePct >= 80
                ? "warning"
                : "neutral"
            }
          />
          <Metric
            label="Budget remaining"
            value={budgetRemaining != null ? formatDualMoney(budgetRemaining, settings) : "—"}
            detail={mode !== "month" ? "Monthly context only" : undefined}
            tone={
              budgetRemaining == null
                ? "neutral"
                : budgetRemaining < 0
                ? "negative"
                : budgetRemaining < calc.monthlyBudgetBase * 0.2
                ? "warning"
                : "positive"
            }
          />
          <Metric
            label="Avg transaction"
            value={avgTransaction != null ? formatDualMoney(avgTransaction, settings) : "—"}
            detail="Recorded transactions only"
          />
          <Metric
            label="Burn rate"
            value={burnRatePct != null ? `${burnRatePct.toFixed(1)}%` : "—"}
            detail={mode !== "month" ? "Month mode only" : "Of monthly budget"}
            tone={
              burnRatePct == null
                ? "neutral"
                : burnRatePct >= 100
                ? "negative"
                : burnRatePct >= 80
                ? "warning"
                : "positive"
            }
          />
        </div>
      </Section>

      {/* Budget vs Actual (month mode only) */}
      {mode === "month" && calc.monthlyBudgetBase > 0 && (
        <Section title="Budget vs Actual">
          <div className="card card-body" style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>Budget</span>
              <strong>{formatDualMoney(calc.monthlyBudgetBase, settings)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>Actual spend</span>
              <strong>{formatDualMoney(periodTotal, settings)}</strong>
            </div>
            <Progress
              value={periodTotal}
              max={calc.monthlyBudgetBase}
              tone={
                burnRatePct == null
                  ? "neutral"
                  : burnRatePct >= 100
                  ? "danger"
                  : burnRatePct >= 80
                  ? "warning"
                  : "success"
              }
            />
            {budgetRemaining != null && (
              <div
                style={{
                  fontSize: 13,
                  color: budgetRemaining < 0 ? "var(--danger)" : "var(--success)",
                  fontWeight: 600,
                }}
              >
                {budgetRemaining < 0
                  ? `${formatDualMoney(Math.abs(budgetRemaining), settings)} over budget`
                  : `${formatDualMoney(budgetRemaining, settings)} remaining`}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Recurring vs Non-Recurring */}
      {includedEntries.length > 0 && (
        <Section title="Recurring vs One-off">
          <div className="dashboard-hero">
            <Metric
              label="Recurring spend"
              value={formatDualMoney(recurringTotal, settings)}
              detail={
                periodTotal > 0
                  ? `${((recurringTotal / periodTotal) * 100).toFixed(1)}% of total`
                  : "weekly / monthly / yearly / session"
              }
            />
            <Metric
              label="One-off spend"
              value={formatDualMoney(nonRecurringTotal, settings)}
              detail={
                periodTotal > 0
                  ? `${((nonRecurringTotal / periodTotal) * 100).toFixed(1)}% of total`
                  : "purchase / custom / ad-hoc"
              }
            />
          </div>
        </Section>
      )}

      {/* Spending trend chart */}
      <Section title={mode === "week" ? "Weekly trend (first 26 weeks)" : "Monthly trend"}>
        <div
          className="card card-body"
          style={{ overflowX: "hidden", padding: "16px 12px 8px" }}
        >
          {mode === "week" ? (
            weeklyBars.length === 0 ? (
              <EmptyState title="No weekly data" description="Record spending to see the weekly trend." />
            ) : (
              <BarChart bars={weeklyBars} height={80} />
            )
          ) : monthlyBars.every((b) => b.value == null) ? (
            <EmptyState title="No spending data" description="Record spending entries to see monthly trends." />
          ) : (
            <BarChart bars={monthlyBars} height={80} />
          )}
        </div>
      </Section>

      {/* Category breakdown */}
      <Section title="Category breakdown">
        {categoryTotals.length === 0 ? (
          <EmptyState
            title="No spending for this period"
            description="Zero recorded spending and unavailable historical data remain distinct."
          />
        ) : (
          <div className="item-list">
            {categoryTotals.map(({ category, value }) => {
              const isPiloting = category?.bucket === "piloting";
              const share =
                !isPiloting && normalTotal > 0 ? (value / normalTotal) * 100 : null;
              const progressTone: "neutral" | "warning" | "danger" =
                share != null && share > 50
                  ? "danger"
                  : share != null && share > 30
                  ? "warning"
                  : "neutral";
              return (
                <div key={category?.id ?? "uncategorized"} className="item-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 99,
                          background: category?.color ?? "#64748B",
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {category?.name ?? "Uncategorized"}
                      </span>
                      {isPiloting && (
                        <span className="text-footnote" style={{ color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                          Excluded from shares
                        </span>
                      )}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <strong>{formatDualMoney(value, settings)}</strong>
                      {share != null && (
                        <div className="text-footnote" style={{ color: "var(--text-secondary)" }}>
                          {share.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  </div>
                  {share != null && (
                    <Progress value={share} max={100} tone={progressTone} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Savings & Wallet */}
      <Section title="Savings & Wallet">
        <div className="dashboard-hero">
          <Metric
            label="Wallet balance"
            value={formatDualMoney(calc.wallet.walletTotal, settings)}
            detail="All wallet entries for year"
            tone={calc.wallet.walletTotal >= 0 ? "positive" : "negative"}
          />
          <Metric
            label="Wishlist total"
            value={formatDualMoney(calc.wishlist.activeTotal, settings)}
            detail={`${calc.wishlist.activeCount} active item${calc.wishlist.activeCount !== 1 ? "s" : ""}`}
          />
        </div>
      </Section>
    </div>
  );
};
