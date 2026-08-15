import React, { useMemo } from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { calculateYear, calculateSuggestedMonthlyBudget } from "../../domain/calculations";
import { monthName } from "../../domain/dates";
import {
  budgetPacing,
  budgetRelevantEntries,
  categoryBreakdown,
  entriesForSelectedPeriod,
  monthlyTrendBars,
  periodComparison,
  spendingStats,
  weeklyTrendBars,
} from "../../domain/analytics";
import { TrendBarChart } from "../ui/TrendBarChart";
import { periodLabel } from "../../domain/periods";
import { isViewingCurrentMonth } from "../../utils/formatters";
import { formatDualMoney } from "../../utils/formatters";
import { Metric } from "../ui/Metric";
import { Progress, CircularProgress } from "../ui/Progress";
import { Badge } from "../ui/Badge";
import { Card, CardBody } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { Button } from "../ui/Button";
import {
  Wallet, Zap, PiggyBank, ArrowRight, Calendar,
  TrendingUp, TrendingDown, Activity, CreditCard, BarChart3
} from "lucide-react";

export const Dashboard: React.FC = () => {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const recordBudgetApproval = useBudgetStore((state) => state.recordBudgetApproval);
  const { settings } = snapshot;
  const mode = settings.selectedPeriodMode ?? "month";

  const calculation = useMemo(() => calculateYear(snapshot), [snapshot]);
  const suggestion = useMemo(() => calculateSuggestedMonthlyBudget(snapshot), [snapshot]);

  // Shared period-aware analytics (same selectors as the Analytics page)
  const periodEntries = useMemo(
    () => budgetRelevantEntries(entriesForSelectedPeriod(snapshot, settings), settings),
    [snapshot, settings],
  );
  const stats = useMemo(() => spendingStats(periodEntries, snapshot), [periodEntries, snapshot]);
  const pacing = useMemo(() => budgetPacing(snapshot, periodEntries), [snapshot, periodEntries]);
  const categories = useMemo(() => categoryBreakdown(periodEntries, snapshot), [periodEntries, snapshot]);
  const comparison = useMemo(() => periodComparison(snapshot, settings), [snapshot, settings]);

  const isCurrent = isViewingCurrentMonth(settings);

  const budget = pacing?.budget ?? calculation.monthlyBudgetBase;
  const spent = stats.total ?? 0;
  const remaining = pacing?.remaining ?? null;
  const progress = pacing?.utilisation ?? 0;

  const healthScore = useMemo(() => {
    if (pacing == null || pacing.budget <= 0) return 0;
    const ratio = pacing.remaining / pacing.budget;
    if (ratio > 0.3) return Math.min(100, 70 + ratio * 30);
    if (ratio > 0) return Math.min(70, 30 + ratio * 130);
    return Math.max(0, 30 + ratio * 30);
  }, [pacing]);

  const healthTone = healthScore > 70 ? "success" : healthScore > 30 ? "warning" : "danger";
  const healthMessage =
    pacing == null ? "Budget health applies to month view" :
    healthScore > 70 ? "Excellent — spending is well controlled" :
    healthScore > 30 ? "Caution — monitor your spending" :
    "Critical — immediate action recommended";

  const existingApproval = snapshot.budgetApprovals.find(
    (a) => a.year === settings.selectedYear && a.month === settings.selectedMonth
  );

  const handleApproveBudget = (status: "approved" | "rejected") => {
    recordBudgetApproval({
      year: settings.selectedYear,
      month: settings.selectedMonth,
      suggestedAmount: suggestion.suggestedAmount,
      approvedAmount: status === "approved" ? suggestion.suggestedAmount : null,
      currency: settings.baseCurrency,
      status,
      recurringTotal: suggestion.recurringTotal,
      note: status === "approved" ? "Approved from dashboard" : "Rejected from dashboard",
    });
  };

  const monthlyBars = useMemo(
    () => monthlyTrendBars(calculation.monthlyTrend, settings.selectedMonth),
    [calculation.monthlyTrend, settings.selectedMonth],
  );
  const weeklyBars = useMemo(
    () => weeklyTrendBars(calculation.weeklyTrend, settings.selectedWeek, 12),
    [calculation.weeklyTrend, settings.selectedWeek],
  );

  const spendingLabel =
    mode === "week" ? "Week Spending" : mode === "year" ? "Year Spending" : "Monthly Spending";

  return (
    <div className="dashboard-grid page-enter">
      {/* HERO: 3 main metrics */}
      <div className="dashboard-hero">
        <Metric
          label="Current Budget"
          value={formatDualMoney(budget, settings)}
          tone="neutral"
          detail="Approved monthly budget"
          prefix={<Wallet size={16} style={{ opacity: 0.6 }} />}
        />
        <Metric
          label="Remaining"
          value={remaining != null ? formatDualMoney(remaining, settings, { showSign: true }) : "—"}
          tone={
            remaining == null ? "neutral" :
            remaining < 0 ? "negative" :
            budget > 0 && remaining < budget * 0.2 ? "warning" : "positive"
          }
          detail={
            remaining == null
              ? mode !== "month" ? "Budget applies to month view" : "No monthly budget set"
              : remaining < 0
              ? "Over budget"
              : budget > 0
              ? `${Math.round((remaining / budget) * 100)}% left`
              : undefined
          }
          prefix={<PiggyBank size={16} style={{ opacity: 0.6 }} />}
        />
        <Metric
          label={spendingLabel}
          value={stats.total != null ? formatDualMoney(stats.total, settings) : "No data"}
          tone="neutral"
          detail={`${stats.count} transaction${stats.count !== 1 ? "s" : ""} · ${periodLabel(settings)}`}
          prefix={<Zap size={16} style={{ opacity: 0.6 }} />}
        />
      </div>

      {/* SECOND ROW: Health + Side cards */}
      <div className="dashboard-row">
        <Card>
          <CardBody>
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <CircularProgress
                  value={healthScore}
                  size={72}
                  stroke={6}
                  tone={`var(--${healthTone})`}
                />
                <div style={{
                  position: "absolute", inset: 0, display: "grid", placeItems: "center",
                  fontSize: "0.75rem", fontWeight: 700, color: `var(--${healthTone})`
                }}>
                  {Math.round(healthScore)}
                </div>
              </div>
              <div>
                <div className="text-title">Budget Health</div>
                <div className="text-caption" style={{ marginTop: 4 }}>{healthMessage}</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span className="text-caption">Budget used</span>
                  <span className="text-callout" style={{ fontWeight: 600 }}>
                    {pacing != null ? `${Math.round(progress)}%` : "—"}
                  </span>
                </div>
                <Progress
                  value={spent}
                  max={budget > 0 ? budget : 1}
                  tone={progress > 100 ? "danger" : progress > 80 ? "warning" : "success"}
                />
              </div>

              {pacing?.projectedRemaining != null && (
                <div className="text-caption" style={{
                  color: pacing.projectedRemaining < 0 ? "var(--danger)" : "var(--text-secondary)"
                }}>
                  {pacing.projectedRemaining < 0
                    ? `On this pace you would end ${formatDualMoney(Math.abs(pacing.projectedRemaining), settings)} over budget.`
                    : `On this pace you would end the month with ${formatDualMoney(pacing.projectedRemaining, settings)} left.`}
                </div>
              )}

              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
                padding: 12, background: "var(--bg-subtle)", borderRadius: 12, marginTop: 4
              }}>
                <div>
                  <div className="text-footnote">General</div>
                  <div className="text-callout" style={{ fontWeight: 600, marginTop: 2 }}>
                    {formatDualMoney(calculation.generalBudget, settings)}
                  </div>
                </div>
                <div>
                  <div className="text-footnote">Piloting</div>
                  <div className="text-callout" style={{ fontWeight: 600, marginTop: 2 }}>
                    {formatDualMoney(calculation.pilotingBudget, settings)}
                  </div>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <CardBody>
              <div className="text-footnote" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <CreditCard size={14} /> Savings & Wallet
              </div>
              <div className="text-headline" style={{ marginBottom: 4 }}>
                {formatDualMoney(calculation.wallet.personalWalletTotal, settings)}
              </div>
              <div className="text-caption">Personal wallet balance</div>
              {calculation.wallet.rolloverTotal !== 0 && (
                <div className="text-caption" style={{ marginTop: 4 }}>
                  Rollover: {formatDualMoney(calculation.wallet.rolloverTotal, settings, { showSign: true })}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="text-footnote" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <Activity size={14} /> Recurring Costs
              </div>
              <div className="text-headline" style={{ marginBottom: 4 }}>
                {formatDualMoney(calculation.generalBudget, settings)}
              </div>
              <div className="text-caption">{calculation.activityEstimates.length} active activities</div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="text-footnote" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                {comparison.deltaAbs != null && comparison.deltaAbs > 0
                  ? <TrendingUp size={14} />
                  : <TrendingDown size={14} />} vs {comparison.previousLabel}
              </div>
              <div className="text-headline" style={{
                marginBottom: 4,
                color: comparison.deltaAbs == null ? undefined :
                  comparison.deltaAbs > 0 ? "var(--danger)" : "var(--success)"
              }}>
                {comparison.deltaAbs != null
                  ? formatDualMoney(comparison.deltaAbs, settings, { showSign: true })
                  : "No data"}
              </div>
              <div className="text-caption">
                {comparison.deltaPct != null
                  ? `${comparison.deltaPct > 0 ? "+" : ""}${comparison.deltaPct.toFixed(1)}% vs previous ${mode}`
                  : "Previous period has no recorded data"}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Budget Suggestion */}
      {isCurrent && !existingApproval && (
        <Card style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
          <CardBody>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexWrap: "wrap", gap: 16
            }}>
              <div>
                <div className="text-title">Suggested Monthly Budget</div>
                <div className="text-caption" style={{ marginTop: 4 }}>
                  Based on {calculation.activityEstimates.filter(a => a.activity.active && a.activity.visible).length} active recurring expenses
                  {suggestion.recurringTotal > 0 && ` · Total recurring: ${formatDualMoney(suggestion.recurringTotal, settings)}`}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div className="text-headline">{formatDualMoney(suggestion.suggestedAmount, settings)}</div>
                <Button variant="primary" onClick={() => handleApproveBudget("approved")}>
                  Approve <ArrowRight size={16} />
                </Button>
                <Button variant="ghost" onClick={() => handleApproveBudget("rejected")}>
                  Skip
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {existingApproval && (
        <Card>
          <CardBody>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div className="text-title">
                  {existingApproval.status === "approved" ? "Budget Approved" : "Budget Suggestion Rejected"}
                </div>
                <div className="text-caption" style={{ marginTop: 4 }}>
                  {monthName(existingApproval.month)} {existingApproval.year} · Suggested: {formatDualMoney(existingApproval.suggestedAmount, settings)}
                </div>
              </div>
              <Badge tone={existingApproval.status === "approved" ? "success" : "neutral"}>
                {existingApproval.status === "approved" ? "Approved" : "Rejected"}
              </Badge>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ANALYTICS SECTION */}
      <div className="section-divider">
        <span className="section-divider-text">Analytics</span>
      </div>

      <div className="dashboard-row">
        <Card>
          <CardBody>
            <div className="text-footnote" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
              <TrendingUp size={14} /> Monthly Trend
            </div>
            <TrendBarChart bars={monthlyBars} />
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-footnote" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
              <BarChart3 size={14} /> Category Breakdown · {periodLabel(settings)}
            </div>
            {categories.length === 0 ? (
              <EmptyState
                title="No spending yet"
                description="Add transactions to see your category breakdown"
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {categories.slice(0, 6).map((cat) => {
                  const maxTotal = categories[0].total === 0 ? 1 : categories[0].total;
                  return (
                    <div key={cat.categoryId}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
                        <span className="text-callout" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            width: 10, height: 10, borderRadius: "50%", background: cat.category?.color ?? "#64748B",
                            display: "inline-block", flexShrink: 0
                          }} />
                          {cat.category?.name ?? "Uncategorized"}
                          {cat.share != null && (
                            <span className="text-footnote" style={{ color: "var(--text-tertiary)" }}>
                              {cat.share.toFixed(0)}%
                            </span>
                          )}
                        </span>
                        <span className="text-callout" style={{ fontWeight: 600 }}>
                          {formatDualMoney(cat.total, settings)}
                        </span>
                      </div>
                      <Progress value={cat.total} max={maxTotal} tone="neutral" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* UPCOMING RECURRING */}
      <div className="section-divider">
        <span className="section-divider-text">Upcoming Recurring</span>
      </div>

      <div className="item-list stagger-children">
        {calculation.activityEstimates
          .filter((est) => est.activity.active && est.activity.visible)
          .slice(0, 6)
          .map((est, i) => (
            <div key={est.activity.id} className="item-row" style={{ animationDelay: `${i * 50}ms` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, background: "var(--bg-inset)",
                  display: "grid", placeItems: "center"
                }}>
                  <Calendar size={16} style={{ color: "var(--text-tertiary)" }} />
                </div>
                <div>
                  <div className="text-callout" style={{ fontWeight: 600 }}>{est.activity.name}</div>
                  <div className="text-footnote">
                    {est.activity.recurrenceType} · Every {est.activity.recurrenceInterval}x
                    {est.activity.seasonalTag ? ` · ${est.activity.seasonalTag}` : ""}
                  </div>
                </div>
              </div>
              <div className="text-callout" style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
                {formatDualMoney(est.monthlyBase, settings)}
                <span className="text-footnote" style={{ marginLeft: 4 }}>/mo</span>
              </div>
            </div>
          ))}
        {calculation.activityEstimates.filter((e) => e.activity.active && e.activity.visible).length === 0 && (
          <EmptyState title="No active activities" description="Add recurring activities to track your budget" />
        )}
      </div>

      {/* WEEKLY TREND MINI */}
      <div className="section-divider">
        <span className="section-divider-text">Weekly Overview</span>
      </div>

      <Card>
        <CardBody>
          <TrendBarChart bars={weeklyBars} height={110} />
        </CardBody>
      </Card>
    </div>
  );
};
