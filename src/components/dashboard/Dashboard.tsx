import React, { useMemo } from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { calculateYear, calculateSuggestedMonthlyBudget } from "../../domain/calculations";
import { monthName } from "../../domain/dates";
import { isViewingCurrentMonth, isViewingHistoricalPeriod } from "../../utils/formatters";
import { formatDualMoney } from "../../utils/formatters";
import { Metric } from "../ui/Metric";
import { Progress, CircularProgress } from "../ui/Progress";
import { Badge } from "../ui/Badge";
import { Card, CardBody } from "../ui/Card";
import { Section } from "../ui/Section";
import { EmptyState } from "../ui/EmptyState";
import { Button } from "../ui/Button";
import {
  Wallet, Zap, PiggyBank, AlertCircle, ArrowRight, Calendar,
  TrendingUp, TrendingDown, Activity, CreditCard, BarChart3
} from "lucide-react";

export const Dashboard: React.FC = () => {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const recordBudgetApproval = useBudgetStore((state) => state.recordBudgetApproval);
  const calculation = useMemo(() => calculateYear(snapshot), [snapshot]);
  const suggestion = useMemo(() => calculateSuggestedMonthlyBudget(snapshot), [snapshot]);

  const isHistorical = isViewingHistoricalPeriod(snapshot.settings);
  const isCurrent = isViewingCurrentMonth(snapshot.settings);

  const spent = calculation.selectedMonthSpend.total ?? 0;
  const budget = calculation.monthlyBudgetBase;
  const remaining = calculation.delta ?? 0;
  const progress = budget > 0 ? (spent / budget) * 100 : 0;

  const healthScore = useMemo(() => {
    if (budget <= 0) return 0;
    const ratio = remaining / budget;
    if (ratio > 0.3) return Math.min(100, 70 + ratio * 30);
    if (ratio > 0) return Math.min(70, 30 + ratio * 130);
    return Math.max(0, 30 + ratio * 30);
  }, [remaining, budget]);

  const healthTone = healthScore > 70 ? "success" : healthScore > 30 ? "warning" : "danger";
  const healthMessage =
    healthScore > 70 ? "Excellent — spending is well controlled" :
    healthScore > 30 ? "Caution — monitor your spending" :
    "Critical — immediate action recommended";

  const existingApproval = snapshot.budgetApprovals.find(
    (a) => a.year === snapshot.settings.selectedYear && a.month === snapshot.settings.selectedMonth
  );

  const handleApproveBudget = (status: "approved" | "rejected") => {
    recordBudgetApproval({
      year: snapshot.settings.selectedYear,
      month: snapshot.settings.selectedMonth,
      suggestedAmount: suggestion.suggestedAmount,
      approvedAmount: status === "approved" ? suggestion.suggestedAmount : null,
      currency: snapshot.settings.baseCurrency,
      status,
      recurringTotal: suggestion.recurringTotal,
      note: status === "approved" ? "Approved from dashboard" : "Rejected from dashboard",
    });
  };

  return (
    <div className="dashboard-grid page-enter">
      {/* Historical Banner */}
      {isHistorical && (
        <div className="historical-banner">
          <AlertCircle size={18} />
          <span>You are viewing a historical period. Data is read-only.</span>
        </div>
      )}

      {/* HERO: 3 main metrics */}
      <div className="dashboard-hero">
        <Metric
          label="Current Budget"
          value={formatDualMoney(budget, snapshot.settings)}
          tone="neutral"
          detail="Approved monthly budget"
          prefix={<Wallet size={16} style={{ opacity: 0.6 }} />}
        />
        <Metric
          label="Remaining"
          value={formatDualMoney(remaining, snapshot.settings, { showSign: true })}
          tone={remaining < 0 ? "negative" : remaining < budget * 0.2 ? "warning" : "positive"}
          detail={remaining < 0 ? "Over budget" : `${Math.round((remaining / budget) * 100)}% left`}
          prefix={<PiggyBank size={16} style={{ opacity: 0.6 }} />}
        />
        <Metric
          label="Monthly Spending"
          value={formatDualMoney(spent, snapshot.settings)}
          tone="neutral"
          detail={`${calculation.selectedMonthSpend.entryCount} transactions`}
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
                  <span className="text-callout" style={{ fontWeight: 600 }}>{Math.round(progress)}%</span>
                </div>
                <Progress
                  value={spent}
                  max={budget}
                  tone={progress > 100 ? "danger" : progress > 80 ? "warning" : "success"}
                />
              </div>

              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
                padding: 12, background: "var(--bg-subtle)", borderRadius: 12, marginTop: 4
              }}>
                <div>
                  <div className="text-footnote">General</div>
                  <div className="text-callout" style={{ fontWeight: 600, marginTop: 2 }}>
                    {formatDualMoney(calculation.generalBudget, snapshot.settings)}
                  </div>
                </div>
                <div>
                  <div className="text-footnote">Piloting</div>
                  <div className="text-callout" style={{ fontWeight: 600, marginTop: 2 }}>
                    {formatDualMoney(calculation.pilotingBudget, snapshot.settings)}
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
                {formatDualMoney(calculation.wallet.personalWalletTotal, snapshot.settings)}
              </div>
              <div className="text-caption">Personal wallet balance</div>
              {calculation.wallet.rolloverTotal !== 0 && (
                <div className="text-caption" style={{ marginTop: 4 }}>
                  Rollover: {formatDualMoney(calculation.wallet.rolloverTotal, snapshot.settings, { showSign: true })}
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
                {formatDualMoney(calculation.generalBudget, snapshot.settings)}
              </div>
              <div className="text-caption">{calculation.activityEstimates.length} active activities</div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="text-footnote" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <BarChart3 size={14} /> YTD Spending
              </div>
              <div className="text-headline" style={{ marginBottom: 4 }}>
                {formatDualMoney(calculation.ytdTotal, snapshot.settings)}
              </div>
              <div className="text-caption">Year to date total</div>
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
                  {suggestion.recurringTotal > 0 && ` · Total recurring: ${formatDualMoney(suggestion.recurringTotal, snapshot.settings)}`}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div className="text-headline">{formatDualMoney(suggestion.suggestedAmount, snapshot.settings)}</div>
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
                  {monthName(existingApproval.month)} {existingApproval.year} · Suggested: {formatDualMoney(existingApproval.suggestedAmount, snapshot.settings)}
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
            <MonthlyTrendChart data={calculation.monthlyTrend} settings={snapshot.settings} />
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-footnote" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
              <TrendingDown size={14} /> Category Breakdown
            </div>
            {calculation.categoryTotals.length === 0 ? (
              <EmptyState
                title="No spending yet"
                description="Add transactions to see your category breakdown"
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {calculation.categoryTotals.slice(0, 6).map((cat) => {
                  const maxTotal = calculation.categoryTotals[0].total || 1;
                  return (
                    <div key={cat.categoryId}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
                        <span className="text-callout" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            width: 10, height: 10, borderRadius: "50%", background: cat.color,
                            display: "inline-block", flexShrink: 0
                          }} />
                          {cat.categoryName}
                        </span>
                        <span className="text-callout" style={{ fontWeight: 600 }}>
                          {formatDualMoney(cat.total, snapshot.settings)}
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
                {formatDualMoney(est.monthlyBase, snapshot.settings)}
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
          <WeeklyTrendChart data={calculation.weeklyTrend} settings={snapshot.settings} currentWeek={calculation.week} />
        </CardBody>
      </Card>
    </div>
  );
};

/* Simple bar chart using divs - no external lib needed for basic viz */
function MonthlyTrendChart({ data, settings }: { data: Array<{ label: string; total: number | null; status: string }>; settings: any }) {
  const values = data.map((d) => d.total ?? 0);
  const max = Math.max(...values, 1);
  return (
    <div className="chart-container" style={{ display: "flex", alignItems: "flex-end", gap: 6, paddingTop: 20 }}>
      {data.map((d, i) => {
        const pct = (values[i] / max) * 100;
        const isCurrent = d.status !== "nan" && d.status !== "pending";
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{
              width: "100%", height: `${pct}%`, minHeight: 4, maxHeight: "100%",
              background: isCurrent ? "var(--accent)" : "var(--bg-inset)",
              borderRadius: "4px 4px 0 0", transition: "height 0.5s ease-out", opacity: isCurrent ? 1 : 0.4
            }} />
            <span className="text-footnote" style={{ fontSize: "0.625rem" }}>{d.label.slice(0, 3)}</span>
          </div>
        );
      })}
    </div>
  );
}

function WeeklyTrendChart({ data, settings, currentWeek }: { data: Array<{ label: string; total: number | null }>; settings: any; currentWeek: number }) {
  const values = data.map((d) => d.total ?? 0);
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120, paddingTop: 10 }}>
      {data.slice(0, Math.min(data.length, 12)).map((d, i) => {
        const pct = (values[i] / max) * 100;
        const isCurrent = i + 1 === currentWeek;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{
              width: "100%", height: `${pct}%`, minHeight: 2,
              background: isCurrent ? "var(--accent)" : "var(--bg-inset)",
              borderRadius: 3, transition: "height 0.5s ease-out"
            }} />
            <span className="text-footnote" style={{ fontSize: "0.6rem" }}>W{i + 1}</span>
          </div>
        );
      })}
    </div>
  );
}
