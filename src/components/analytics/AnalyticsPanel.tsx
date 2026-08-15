import React, { useMemo } from "react";
import { calculateYear } from "../../domain/calculations";
import { isHistoricalPeriod, periodLabel } from "../../domain/periods";
import {
  budgetPacing,
  budgetRelevantEntries,
  categoryBreakdown,
  entriesForSelectedPeriod,
  monthlyTrendBars,
  periodComparison,
  selectedPeriodWindow,
  spendingStats,
  weeklyTrendBars,
} from "../../domain/analytics";
import { useBudgetStore } from "../../store/budgetStore";
import { formatDualMoney } from "../../utils/formatters";
import { EmptyState } from "../ui/EmptyState";
import { Metric } from "../ui/Metric";
import { Section } from "../ui/Section";
import { Progress } from "../ui/Progress";
import { TrendBarChart } from "../ui/TrendBarChart";

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
  const comparison = useMemo(() => periodComparison(snapshot, settings), [snapshot, settings]);
  const window = useMemo(() => selectedPeriodWindow(settings), [settings]);

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
    () => monthlyTrendBars(calc.monthlyTrend, settings.selectedMonth),
    [calc.monthlyTrend, settings.selectedMonth],
  );
  const weeklyBars = useMemo(
    () => weeklyTrendBars(calc.weeklyTrend, settings.selectedWeek, 12),
    [calc.weeklyTrend, settings.selectedWeek],
  );

  const total = stats.total;
  const utilisation = pacing?.utilisation ?? null;
  const spendTone =
    utilisation == null ? "neutral" : utilisation >= 100 ? "negative" : utilisation >= 80 ? "warning" : "neutral";

  const currentPeriodLabel = periodLabel(settings);
  const dailyAvg =
    total != null && window.elapsedDays > 0 ? total / window.elapsedDays : null;

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

      {/* ── Overview ── */}
      <Section title={`Overview · ${currentPeriodLabel}`}>
        <div className="dashboard-hero">
          <Metric
            label="Period spending"
            value={total != null ? formatDualMoney(total, settings) : "No data"}
            detail={`${stats.count} transaction${stats.count !== 1 ? "s" : ""}`}
            tone={spendTone}
          />
          <Metric
            label="Budget remaining"
            value={pacing != null ? formatDualMoney(pacing.remaining, settings) : "—"}
            detail={mode !== "month" ? "Monthly context only" : `of ${formatDualMoney(pacing?.budget, settings)}`}
            tone={
              pacing == null
                ? "neutral"
                : pacing.remaining < 0
                ? "negative"
                : pacing.remaining < pacing.budget * 0.2
                ? "warning"
                : "positive"
            }
          />
          <Metric
            label="Burn rate"
            value={utilisation != null ? `${utilisation.toFixed(1)}%` : "—"}
            detail={mode !== "month" ? "Month mode only" : "Of monthly budget"}
            tone={
              utilisation == null
                ? "neutral"
                : utilisation >= 100
                ? "negative"
                : utilisation >= 80
                ? "warning"
                : "positive"
            }
          />
          <Metric
            label="Daily average"
            value={dailyAvg != null ? formatDualMoney(dailyAvg, settings) : "—"}
            tone={dailyAvg != null ? "accent" : "neutral"}
            detail={window.elapsedDays > 0 ? `Over ${window.elapsedDays} day${window.elapsedDays !== 1 ? "s" : ""}` : "Period not started"}
          />
        </div>
      </Section>

      {/* ── Transactions ── */}
      {stats.count > 0 && (
        <Section title="Transactions">
          <div className="dashboard-hero">
            <Metric
              label="Average transaction"
              value={formatDualMoney(stats.average, settings)}
              detail="Mean of recorded transactions"
            />
            <Metric
              label="Median transaction"
              value={formatDualMoney(stats.median, settings)}
              detail="Half of transactions are below this"
            />
            <Metric
              label="Largest transaction"
              value={formatDualMoney(stats.largest, settings)}
              detail="Biggest single spend this period"
            />
          </div>
        </Section>
      )}

      {/* ── Budget vs Actual + Forecast (month mode) ── */}
      {pacing != null && (
        <Section title="Budget vs Actual">
          <div className="card card-body" style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>Budget</span>
              <strong>{formatDualMoney(pacing.budget, settings)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>Actual spend</span>
              <strong>{formatDualMoney(pacing.spent, settings)}</strong>
            </div>
            <Progress
              value={pacing.spent}
              max={pacing.budget}
              tone={
                utilisation == null
                  ? "neutral"
                  : utilisation >= 100
                  ? "danger"
                  : utilisation >= 80
                  ? "warning"
                  : "success"
              }
            />
            <div
              style={{
                fontSize: 13,
                color: pacing.remaining < 0 ? "var(--danger)" : "var(--success)",
                fontWeight: 600,
              }}
            >
              {pacing.remaining < 0
                ? `${formatDualMoney(Math.abs(pacing.remaining), settings)} over budget`
                : `${formatDualMoney(pacing.remaining, settings)} remaining`}
            </div>

            {pacing.projectedTotal != null && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 12,
                  padding: 12,
                  background: "var(--bg-subtle)",
                  borderRadius: 12,
                }}
              >
                <div>
                  <div className="text-footnote">Projected total</div>
                  <div className="text-callout" style={{ fontWeight: 600, marginTop: 2 }}>
                    {formatDualMoney(pacing.projectedTotal, settings)}
                  </div>
                </div>
                <div>
                  <div className="text-footnote">Projected end-of-month</div>
                  <div
                    className="text-callout"
                    style={{
                      fontWeight: 600,
                      marginTop: 2,
                      color:
                        pacing.projectedRemaining != null && pacing.projectedRemaining < 0
                          ? "var(--danger)"
                          : "var(--success)",
                    }}
                  >
                    {pacing.projectedRemaining != null && pacing.projectedRemaining < 0
                      ? `${formatDualMoney(Math.abs(pacing.projectedRemaining), settings)} over`
                      : `${formatDualMoney(pacing.projectedRemaining, settings)} left`}
                  </div>
                </div>
                {pacing.requiredDailyPace != null && pacing.daysLeft > 0 && (
                  <div>
                    <div className="text-footnote">Stay-on-budget pace</div>
                    <div className="text-callout" style={{ fontWeight: 600, marginTop: 2 }}>
                      {formatDualMoney(pacing.requiredDailyPace, settings)}/day
                    </div>
                    <div className="text-footnote" style={{ marginTop: 2 }}>
                      {pacing.daysLeft} day{pacing.daysLeft !== 1 ? "s" : ""} left
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── Recurring vs One-off ── */}
      {stats.count > 0 && (
        <Section title="Recurring vs One-off">
          <div className="dashboard-hero">
            <Metric
              label="Recurring spend"
              value={formatDualMoney(stats.recurringTotal, settings)}
              tone="accent"
              detail={
                stats.recurringShare != null
                  ? `${stats.recurringShare.toFixed(1)}% of total · ${stats.recurringCount} transaction${stats.recurringCount !== 1 ? "s" : ""}`
                  : "weekly / monthly / yearly / session"
              }
            />
            <Metric
              label="One-off spend"
              value={formatDualMoney(stats.oneOffTotal, settings)}
              detail={
                stats.recurringShare != null
                  ? `${(100 - stats.recurringShare).toFixed(1)}% of total · ${stats.oneOffCount} transaction${stats.oneOffCount !== 1 ? "s" : ""}`
                  : "purchase / custom / ad-hoc"
              }
            />
          </div>
        </Section>
      )}

      {/* ── Spending trend chart ── */}
      <Section title={mode === "week" ? "Weekly trend" : "Monthly trend"}>
        <div className="card card-body" style={{ overflowX: "hidden", padding: "16px 12px 8px" }}>
          {mode === "week" ? (
            weeklyBars.length === 0 ? (
              <EmptyState title="No weekly data" description="Record spending to see the weekly trend." />
            ) : (
              <TrendBarChart bars={weeklyBars} height={120} />
            )
          ) : monthlyBars.every((b) => b.value == null) ? (
            <EmptyState title="No spending data" description="Record spending entries to see monthly trends." />
          ) : (
            <TrendBarChart bars={monthlyBars} height={120} />
          )}
        </div>
      </Section>

      {/* ── Category breakdown ── */}
      <Section title="Category breakdown">
        {categories.length === 0 ? (
          <EmptyState
            title="No spending for this period"
            description="Zero recorded spending and unavailable historical data remain distinct."
          />
        ) : (
          <div className="item-list">
            {categories.map(({ category, categoryId, total: catTotal, count, share }) => {
              const isPiloting = category?.bucket === "piloting";
              return (
                <div
                  key={categoryId}
                  className="item-row"
                  style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}
                >
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
                      <strong>{formatDualMoney(catTotal, settings)}</strong>
                      <div className="text-footnote" style={{ color: "var(--text-secondary)" }}>
                        {share != null ? `${share.toFixed(1)}% · ` : ""}{count} transaction{count !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                  {share != null && (
                    <Progress
                      value={share}
                      max={100}
                      color={category?.color ?? "var(--accent)"}
                      label={`${category?.name ?? "Uncategorized"} share of spending`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── History: period-over-period ── */}
      <Section title="History">
        <div className="dashboard-hero">
          <Metric
            label={`vs ${comparison.previousLabel}`}
            value={
              comparison.deltaAbs != null
                ? formatDualMoney(comparison.deltaAbs, settings, { showSign: true })
                : "No data"
            }
            detail={
              comparison.deltaPct != null
                ? `${comparison.deltaPct > 0 ? "+" : ""}${comparison.deltaPct.toFixed(1)}% vs previous ${mode}`
                : comparison.previousTotal == null
                ? "Previous period has no recorded data"
                : "Current period has no recorded data"
            }
            tone={
              comparison.deltaAbs == null ? "neutral" : comparison.deltaAbs > 0 ? "negative" : "positive"
            }
          />
          <Metric
            label="Previous period"
            value={
              comparison.previousTotal != null ? formatDualMoney(comparison.previousTotal, settings) : "No data"
            }
            detail={comparison.previousLabel}
          />
          {lastYearComparison && (
            <Metric
              label="Same month last year"
              value={formatDualMoney(lastYearComparison.total, settings)}
              detail={lastYearComparison.label}
            />
          )}
        </div>
      </Section>

      {/* ── Savings & Wallet ── */}
      <Section title="Savings & Wallet">
        <div className="dashboard-hero">
          <Metric
            label="Wallet balance"
            value={formatDualMoney(calc.wallet.walletTotal, settings)}
            detail="All wallet entries for year"
            tone={calc.wallet.walletTotal >= 0 ? "positive" : "negative"}
          />
          <Metric
            label="Rollover total"
            value={formatDualMoney(calc.wallet.rolloverTotal, settings, { showSign: true })}
            detail="Accumulated month-end rollovers"
            tone={calc.wallet.rolloverTotal >= 0 ? "positive" : "negative"}
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
