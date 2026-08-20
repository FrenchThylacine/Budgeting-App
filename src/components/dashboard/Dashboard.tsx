import React, { useMemo, useState } from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { calculateYear, calculateSuggestedMonthlyBudget } from "../../domain/calculations";
import { monthName } from "../../domain/dates";
import {
  budgetPacing,
  budgetRelevantEntries,
  categoriesOverCap,
  categoryBreakdown,
  cumulativeForecast,
  entriesForSelectedPeriod,
  financialHealth,
  fundingSplit,
  monthlyTrendBars,
  periodComparison,
  spendingStats,
  weeklyTrendBars,
} from "../../domain/analytics";
import { periodLabel } from "../../domain/periods";
import { formatDualMoney, isViewingCurrentMonth } from "../../utils/formatters";
import {
  BarChart,
  DonutChart,
  HorizontalBarChart,
  LineChart,
  ProgressRing,
  compactNumber,
  type ChartReferenceLine,
  type HorizontalBarRow,
} from "../charts";
import { Badge } from "../ui/Badge";
import { Card, CardBody } from "../ui/Card";
import { UpcomingSchedule } from "./UpcomingSchedule";
import { EmptyState } from "../ui/EmptyState";
import { Button } from "../ui/Button";
import { Disclosure } from "../ui/Disclosure";
import { AircraftArt } from "../ui/AircraftMark";
import {
  AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Calendar, CreditCard, Eye, EyeOff, Lock,
  PiggyBank, SlidersHorizontal, TrendingDown, TrendingUp, Zap,
} from "lucide-react";
import { EditorSheet } from "../ui/EditorSheet";
import {
  dashboardWidgets,
  moveWidget,
  toggleWidget,
  widgetDefinition,
  type DashboardWidgetId,
  type ResolvedWidget,
} from "../../domain/dashboard";

/**
 * The dashboard answers, visually and in order: how healthy am I, where is the
 * budget heading, what is coming, and what needs attention. Every figure comes
 * from the shared selectors in domain/analytics, so it can never disagree with
 * the Analytics page.
 */

const GRADE_COLOR: Record<string, string> = {
  Excellent: "var(--success)",
  Good: "var(--success)",
  Fair: "var(--warning)",
  "At risk": "var(--danger)",
};

/**
 * One sentence under the score.
 *
 * A number out of 100 with nothing beside it is a grade without a report. This
 * says what it is describing and, where the projection allows, what it means
 * for the end of the period.
 */
function healthSummary(
  score: number,
  projectedRemaining: number | null,
  money: (value: number | null | undefined) => string,
): string {
  const lead =
    score >= 85
      ? "Comfortably inside your limits."
      : score >= 70
      ? "On track, with room to absorb a surprise."
      : score >= 50
      ? "Workable, but the margin is thin."
      : "Spending is outrunning the plan.";
  if (projectedRemaining == null) return `${lead} Scored on budget pace, caps, trend and how much is committed.`;
  return projectedRemaining < 0
    ? `${lead} At this pace the period ends ${money(Math.abs(projectedRemaining))} over budget.`
    : `${lead} At this pace the period ends with ${money(projectedRemaining)} unspent.`;
}

const Figure: React.FC<{
  label: string;
  value: string;
  detail?: string;
  tone?: "positive" | "negative" | "warning";
}> = ({ label, value, detail, tone }) => (
  <div style={{ minWidth: 0 }}>
    <div className="text-footnote" style={{ marginBottom: 2 }}>{label}</div>
    <div
      className="money"
      style={{
        fontSize: "1.0625rem",
        fontWeight: 600,
        letterSpacing: "var(--tracking-snug)",
        overflowWrap: "anywhere",
        color:
          tone === "positive" ? "var(--success)"
          : tone === "negative" ? "var(--danger)"
          : tone === "warning" ? "var(--warning)"
          : "var(--text-primary)",
      }}
    >
      {value}
    </div>
    {detail && <div className="text-caption" style={{ color: "var(--text-tertiary)" }}>{detail}</div>}
  </div>
);

export const Dashboard: React.FC<{ onNavigate?: (tab: "spending" | "activities" | "settings") => void }> = ({
  onNavigate,
}) => {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const recordBudgetApproval = useBudgetStore((state) => state.recordBudgetApproval);
  const updateSettings = useBudgetStore((state) => state.updateSettings);
  const { settings } = snapshot;

  /** Which sections appear, and in what order. See domain/dashboard.ts. */
  const widgets = useMemo(() => dashboardWidgets(settings), [settings]);
  const hiddenCount = widgets.filter((widget) => !widget.visible).length;
  const [customising, setCustomising] = useState(false);
  const mode = settings.selectedPeriodMode ?? "month";

  const calculation = useMemo(() => calculateYear(snapshot), [snapshot]);
  const suggestion = useMemo(() => calculateSuggestedMonthlyBudget(snapshot), [snapshot]);

  const periodEntries = useMemo(
    () => budgetRelevantEntries(entriesForSelectedPeriod(snapshot, settings), settings),
    [snapshot, settings],
  );
  const stats = useMemo(() => spendingStats(periodEntries, snapshot), [periodEntries, snapshot]);
  const pacing = useMemo(() => budgetPacing(snapshot, periodEntries), [snapshot, periodEntries]);
  const categories = useMemo(() => categoryBreakdown(periodEntries, snapshot), [periodEntries, snapshot]);
  const comparison = useMemo(() => periodComparison(snapshot, settings), [snapshot, settings]);
  const overCap = useMemo(() => categoriesOverCap(categories), [categories]);
  const health = useMemo(
    () => financialHealth({ pacing, categories, comparison, stats }),
    [pacing, categories, comparison, stats],
  );
  const forecast = useMemo(
    () => cumulativeForecast(periodEntries, snapshot, settings),
    [periodEntries, snapshot, settings],
  );

  const isCurrent = isViewingCurrentMonth(settings);
  const money = (value: number | null | undefined) => formatDualMoney(value, settings);
  const healthColor = health.grade ? GRADE_COLOR[health.grade] ?? "var(--accent)" : "var(--text-tertiary)";

  /** Who paid for this period's transactions. See domain/funding.ts. */
  const allPeriodEntries = useMemo(() => entriesForSelectedPeriod(snapshot, settings), [snapshot, settings]);
  const funding = useMemo(() => fundingSplit(allPeriodEntries, snapshot), [allPeriodEntries, snapshot]);

  const trendBars = useMemo(
    () =>
      mode === "week"
        ? weeklyTrendBars(calculation.weeklyTrend, settings.selectedWeek, 12)
        : monthlyTrendBars(calculation.monthlyTrend, mode === "year" ? -1 : settings.selectedMonth),
    [mode, calculation.weeklyTrend, calculation.monthlyTrend, settings.selectedWeek, settings.selectedMonth],
  );

  const budgetReference: ChartReferenceLine[] =
    mode !== "week" && calculation.monthlyBudgetBase > 0
      ? [{ value: calculation.monthlyBudgetBase, label: `Budget ${money(calculation.monthlyBudgetBase)}` }]
      : [];

  const categoryRows: HorizontalBarRow[] = categories.slice(0, 6).map((stat) => ({
    id: stat.categoryId,
    label: stat.category?.name ?? "Uncategorized",
    value: stat.total,
    color: stat.category?.color ?? "var(--series-1)",
    caption:
      stat.cap != null
        ? stat.overCap
          ? `${money(stat.total - stat.cap)} over cap`
          : `${money(stat.cap - stat.total)} left of cap`
        : stat.share != null
        ? `${stat.share.toFixed(0)}% of spending`
        : undefined,
    marker: stat.cap != null ? { value: stat.cap, label: `Cap ${money(stat.cap)}` } : undefined,
    badge: stat.overCap ? "Over cap" : undefined,
    badgeTone: stat.overCap ? ("danger" as const) : undefined,
  }));

  const existingApproval = snapshot.budgetApprovals.find(
    (a) => a.year === settings.selectedYear && a.month === settings.selectedMonth,
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

  /**
   * Nothing has been entered yet — anywhere, not merely in this period.
   *
   * Eight cards each saying "No data" is not a dashboard, it is a list of
   * things the app cannot tell you yet, and it is the first thing a new account
   * shows. The figures return the moment there is anything to compute them
   * from, so nothing is hidden that could be shown.
   */
  const isBlankAccount =
    calculation.activityEstimates.length === 0 &&
    calculation.monthlyBudgetBase === 0 &&
    Object.values(snapshot.years).every((year) => (year?.spendingEntries?.length ?? 0) === 0);

  if (isBlankAccount) {
    return (
      <div className="dashboard-grid page-enter">
        <Card>
          <CardBody>
            <div className="start-card">
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                {/* On a medallion, not bare: the livery is white, and a white
                    aircraft on a white card is a navy fin and a red line. */}
                <span className="start-mark">
                  <AircraftArt size={78} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <h2 className="text-title" style={{ margin: 0 }}>Nothing recorded yet</h2>
                  <p className="text-caption" style={{ marginTop: 4 }}>
                    Figures, trends and forecasts appear here as soon as there is something to
                    compute them from. Three ways to begin:
                  </p>
                </div>
              </div>

              <div className="start-steps">
                <button type="button" className="start-step" onClick={() => onNavigate?.("settings")}>
                  <span className="start-step-index">Import</span>
                  <span className="text-callout">Bring in a spreadsheet</span>
                  <span className="text-caption">
                    Load an existing workbook or a JSON backup from Settings. You see exactly what
                    it contains before anything is written.
                  </span>
                </button>
                <button type="button" className="start-step" onClick={() => onNavigate?.("activities")}>
                  <span className="start-step-index">Set up</span>
                  <span className="text-callout">Add your recurring expenses</span>
                  <span className="text-caption">
                    Subscriptions, rent, lessons. These drive the suggested budget and the
                    schedule of what is coming.
                  </span>
                </button>
                <button type="button" className="start-step" onClick={() => onNavigate?.("spending")}>
                  <span className="start-step-index">Record</span>
                  <span className="text-callout">Log a transaction</span>
                  <span className="text-caption">
                    One expense is enough to start the trend, the category split and the health
                    score for {periodLabel(settings)}.
                  </span>
                </button>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="text-title" style={{ margin: "0 0 12px" }}>Upcoming</h2>
            <UpcomingSchedule snapshot={snapshot} money={money} />
          </CardBody>
        </Card>
      </div>
    );
  }

  /**
   * Each section as a value, so the page can be assembled from the user's
   * order rather than from a fixed sequence of JSX. A section that has nothing
   * to say still returns `null` and is skipped, which is why "no alerts" costs
   * no space rather than showing an empty card.
   */
  const sections: Record<DashboardWidgetId, React.ReactNode> = {
    alerts: (
      <>
        {/* Alerts first — the only part of the page that asks for action. */}
        {overCap.length > 0 && (
          <Card style={{ borderColor: "var(--danger)", background: "var(--danger-soft)" }}>
            <CardBody>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <AlertTriangle size={18} style={{ color: "var(--danger)", flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div className="text-title">
                    {overCap.length === 1
                      ? "1 category is over its monthly cap"
                      : `${overCap.length} categories are over their monthly caps`}
                  </div>
                  <div className="text-caption" style={{ marginTop: 4 }}>
                    {overCap
                      .map((s) => `${s.category?.name ?? "Uncategorized"} (${money(s.total - (s.cap ?? 0))} over)`)
                      .join(" · ")}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        )}
      </>
    ),
    health: (
      <>
          {/* Health gauge — the centrepiece. */}
          <div className="dashboard-row">
            <Card>
              <CardBody>
                <div className="health-layout">
                  <ProgressRing
                    value={health.score}
                    valueText={health.score != null ? String(Math.round(health.score)) : "—"}
                    label={health.grade ?? "Not enough data"}
                    caption={health.score != null ? "out of 100" : undefined}
                    ariaLabel={`Budget health ${health.score != null ? Math.round(health.score) : "unavailable"} out of 100`}
                    size={230}
                    thickness={16}
                    color={healthColor}
                    labelColor={healthColor}
                    scaleLabels={["0", "100"]}
                  />

                  <div style={{ display: "grid", gap: 12, minWidth: 0, alignContent: "center" }}>
                    <h2 className="text-title" style={{ margin: 0 }}>
                      Budget health · {periodLabel(settings)}
                    </h2>
                    {/* One sentence saying what the number means, so the gauge is
                        not a score with no explanation attached to it. */}
                    {health.score != null && (
                      <p className="text-note" style={{ margin: 0 }}>
                        {healthSummary(health.score, pacing?.projectedRemaining ?? null, money)}
                      </p>
                    )}

                    {health.factors.length > 0 ? (
                      <div style={{ display: "grid", gap: 10 }}>
                        {health.factors.map((factor) => (
                          <div key={factor.label} style={{ display: "grid", gap: 4, minWidth: 0 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <span className="text-callout">{factor.label}</span>
                              <span className="text-callout" style={{ fontWeight: 600, flexShrink: 0 }}>
                                {Math.round(factor.score)}
                              </span>
                            </div>
                            <div className="progress-track">
                              <div
                                className="progress-fill"
                                style={{
                                  width: `${Math.min(100, Math.max(0, factor.score))}%`,
                                  background:
                                    factor.score >= 70 ? "var(--success)"
                                    : factor.score >= 40 ? "var(--warning)"
                                    : "var(--danger)",
                                }}
                              />
                            </div>
                            {factor.detail && (
                              <div className="text-caption" style={{ color: "var(--text-tertiary)" }}>
                                {factor.detail}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-caption">
                        Record spending and set a monthly budget to score this period.
                      </div>
                    )}
                  </div>
                </div>
              </CardBody>
            </Card>

            <div style={{ display: "grid", gap: 16, alignContent: "start", minWidth: 0 }}>
              <Card className={pacing && pacing.remaining < 0 ? "tone-card-danger" : "tone-card-accent"}>
                <CardBody>
                  <div className="text-footnote" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <PiggyBank size={14} /> Remaining
                  </div>
                  <div className="text-headline money">{pacing != null ? money(pacing.remaining) : "—"}</div>
                  <div className="text-caption" style={{ marginTop: 4 }}>
                    {pacing != null
                      ? `${Math.round(pacing.utilisation ?? 0)}% of ${money(pacing.budget)} used`
                      : mode !== "month"
                      ? "Budget applies to month view"
                      : "No monthly budget set"}
                  </div>
                  {pacing != null && (
                    <div className="progress-track" style={{ marginTop: 10 }}>
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.min(100, Math.max(0, pacing.utilisation ?? 0))}%`,
                          background:
                            (pacing.utilisation ?? 0) >= 100 ? "var(--danger)"
                            : (pacing.utilisation ?? 0) >= 80 ? "var(--warning)"
                            : "var(--success)",
                        }}
                      />
                    </div>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardBody>
                  <div className="text-footnote" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Zap size={14} /> {mode === "week" ? "Week" : mode === "year" ? "Year" : "Month"} spending
                  </div>
                  <div className="text-headline money">{stats.total != null ? money(stats.total) : "No data"}</div>
                  <div className="text-caption" style={{ marginTop: 4 }}>
                    {stats.count} transaction{stats.count !== 1 ? "s" : ""}
                    {stats.average != null ? ` · ${money(stats.average)} average` : ""}
                  </div>
                  {/* Money somebody else spent is recorded but not charged here, so
                      the card says so rather than leaving a gap between this figure
                      and the transaction list. */}
                  {funding.externalCount > 0 && (
                    <div className="text-caption" style={{ marginTop: 6, color: "var(--warning)" }}>
                      Plus {money(funding.external)} paid by others — recorded, not charged to your budget.
                    </div>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardBody>
                  <div className="text-footnote" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    {comparison.deltaAbs != null && comparison.deltaAbs > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    vs {comparison.previousLabel}
                  </div>
                  <div
                    className="text-headline money"
                    style={{
                      color:
                        comparison.deltaAbs == null ? undefined
                        : comparison.deltaAbs > 0 ? "var(--danger)"
                        : "var(--success)",
                    }}
                  >
                    {comparison.deltaAbs != null
                      ? formatDualMoney(comparison.deltaAbs, settings, { showSign: true })
                      : "No data"}
                  </div>
                  <div className="text-caption" style={{ marginTop: 4 }}>
                    {comparison.deltaPct != null
                      ? `${comparison.deltaPct > 0 ? "+" : ""}${comparison.deltaPct.toFixed(1)}% vs previous ${mode}`
                      : "Previous period has no recorded data"}
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>
      </>
    ),
    charts: (
      <>
        {/* Trend and forecast. */}
        <div className="dashboard-row">
          <Card>
            <CardBody>
              {trendBars.every((bar) => bar.value == null) ? (
                <EmptyState title="No spending data" description="Record transactions to see the trend." />
              ) : (
                <BarChart
                  title={mode === "week" ? "Weekly trend" : "Monthly trend"}
                  description={mode === "week" ? "Spending per ISO week" : "Spending per month, against your budget"}
                  bars={trendBars.map((bar) => ({ label: bar.label, value: bar.value, highlight: bar.highlight }))}
                  height={190}
                  referenceLines={budgetReference}
                  formatValue={(v) => money(v)}
                  formatTick={compactNumber}
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              {forecast == null || forecast.actual.every((v) => v == null) ? (
                <EmptyState title="No forecast yet" description="Forecasting starts once the period has spending." />
              ) : (
                <>
                  <LineChart
                    title="Forecast"
                    description="Cumulative spend, projected to the end of the period"
                    labels={forecast.labels}
                    series={[
                      { id: "actual", name: "Actual", color: "var(--series-1)", values: forecast.actual, area: true },
                      { id: "projected", name: "Projected", color: "var(--series-2)", values: forecast.projected, dashed: true },
                    ]}
                    referenceLines={
                      forecast.budget != null
                        ? [{ value: forecast.budget, label: `Budget ${money(forecast.budget)}` }]
                        : []
                    }
                    formatValue={(v) => money(v)}
                    formatTick={compactNumber}
                  />
                  {pacing?.projectedRemaining != null && (
                    <div
                      className="text-caption"
                      style={{ marginTop: 10, color: pacing.projectedRemaining < 0 ? "var(--danger)" : "var(--success)" }}
                    >
                      {pacing.projectedRemaining < 0
                        ? `On this pace you end ${money(Math.abs(pacing.projectedRemaining))} over budget.`
                        : `On this pace you end with ${money(pacing.projectedRemaining)} left.`}
                    </div>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </>
    ),
    detail: (
      <>
        {/* Everything below is reference rather than answer: it explains figures
            already stated above. Collapsed by default on a phone, where it is
            several screens of scrolling past the part people came for. */}
        <Disclosure title="Detail" summary="Category split and recurring share">
        <div className="dashboard-row">
          <Card>
            <CardBody>
              <HorizontalBarChart
                title="Where the money went"
                description={`Top categories · ${periodLabel(settings)}`}
                rows={categoryRows}
                formatValue={(v) => money(v)}
                emptyMessage="Add transactions to see your category breakdown."
              />
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <DonutChart
                title="Recurring vs one-off"
                description="How much of this period was already committed"
                segments={[
                  { id: "recurring", label: "Recurring", value: stats.recurringTotal, color: "var(--series-1)" },
                  { id: "oneoff", label: "One-off", value: stats.oneOffTotal, color: "var(--series-2)" },
                ]}
                centerValue={stats.total != null ? money(stats.total) : "—"}
                centerLabel="total"
                formatValue={(v) => money(v)}
                emptyMessage="This split appears once the period has spending."
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginTop: 12 }}>
                <Figure
                  label="Recurring"
                  value={money(stats.recurringTotal)}
                  detail={stats.recurringShare != null ? `${stats.recurringShare.toFixed(0)}% of spend` : undefined}
                />
                <Figure
                  label="Committed monthly"
                  value={money(calculation.generalBudget)}
                  detail={`${calculation.activityEstimates.length} activities`}
                />
              </div>
            </CardBody>
          </Card>
        </div>
        </Disclosure>
      </>
    ),
    budget: (
      <>
          {/* Budget approval.

              Only when there is something to suggest. With no recurring expenses
              the suggestion is 0, and approving it wrote a permanent historical
              record stating that this month's budget was zero — which is not what
              the user meant, and approvals are not editable afterwards. A missing
              suggestion is missing, not 0. */}
          {isCurrent && !existingApproval && suggestion.suggestedAmount > 0 && (
            <Card style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
              <CardBody>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                  <div>
                    <div className="text-title">Suggested monthly budget</div>
                    <div className="text-caption" style={{ marginTop: 4 }}>
                      Based on {calculation.activityEstimates.filter((a) => a.activity.active && a.activity.visible).length} active
                      recurring expenses
                      {suggestion.recurringTotal > 0 && ` · total recurring ${money(suggestion.recurringTotal)}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div className="text-headline money">{money(suggestion.suggestedAmount)}</div>
                    <Button variant="primary" onClick={() => handleApproveBudget("approved")}>
                      Approve <ArrowRight size={16} />
                    </Button>
                    <Button variant="ghost" onClick={() => handleApproveBudget("rejected")}>Skip</Button>
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
                      {existingApproval.status === "approved" ? "Budget approved" : "Budget suggestion rejected"}
                    </div>
                    <div className="text-caption" style={{ marginTop: 4 }}>
                      {monthName(existingApproval.month)} {existingApproval.year} · suggested{" "}
                      {money(existingApproval.suggestedAmount)}
                    </div>
                  </div>
                  <Badge tone={existingApproval.status === "approved" ? "success" : "neutral"}>
                    {existingApproval.status === "approved" ? "Approved" : "Rejected"}
                  </Badge>
                </div>
              </CardBody>
            </Card>
          )}
      </>
    ),
    upcoming: (
      <>
        {/* What is coming stays primary: it is the only part of the page about
            the future, and the one thing a glance is usually for. */}
        <Card>
          <CardBody>
            <h2 className="text-title" style={{ margin: "0 0 12px" }}>Upcoming</h2>
            <UpcomingSchedule snapshot={snapshot} money={money} />
          </CardBody>
        </Card>
      </>
    ),
    savings: (
      <>
        <Disclosure title="Savings and wallet" summary="Personal wallet, rollover, wishlist, year to date">
          <Card>
            <CardBody>
              <h2 className="text-title" style={{ margin: "0 0 12px" }}>Savings &amp; wallet</h2>
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <div className="text-footnote" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <CreditCard size={14} /> Personal wallet
                  </div>
                  <div className="text-headline money">{money(calculation.wallet.personalWalletTotal)}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
                  <Figure
                    label="Rollover"
                    value={formatDualMoney(calculation.wallet.rolloverTotal, settings, { showSign: true })}
                    tone={calculation.wallet.rolloverTotal >= 0 ? "positive" : "negative"}
                  />
                  <Figure
                    label="Wishlist"
                    value={money(calculation.wishlist.activeTotal)}
                    detail={`${calculation.wishlist.activeCount} active`}
                  />
                  <Figure
                    label="YTD spend"
                    value={money(calculation.ytdTotal)}
                    detail={
                      calculation.externalYtdTotal > 0
                        ? `${money(calculation.externalYtdTotal)} paid by others`
                        : undefined
                    }
                  />
                </div>
              </div>
            </CardBody>
          </Card>
        </Disclosure>
      </>
    ),
  };

  return (
    <div className="dashboard-grid page-enter">
      {widgets
        .filter((widget) => widget.visible)
        .map((widget) => (
          <React.Fragment key={widget.id}>{sections[widget.id]}</React.Fragment>
        ))}

      {/* The customiser lives at the foot of the page, not in the header: it
          is used once and then never again, and a control for rearranging the
          dashboard should not be the most prominent thing on it. */}
      <div className="dashboard-customise-row">
        <Button variant="ghost" size="sm" onClick={() => setCustomising(true)}>
          <SlidersHorizontal size={14} /> Customise this dashboard
        </Button>
        {hiddenCount > 0 && (
          <span className="text-caption">
            {hiddenCount} section{hiddenCount === 1 ? "" : "s"} hidden
          </span>
        )}
      </div>

      {customising && (
        <DashboardCustomiser
          widgets={widgets}
          onChange={(next) => updateSettings({ dashboard: next })}
          onClose={() => setCustomising(false)}
        />
      )}
    </div>
  );
};

/**
 * Choose which dashboard sections appear, and in what order.
 *
 * Reordering is arrows rather than drag-and-drop: a list of seven is short
 * enough that arrows are faster, they work with a keyboard and a screen reader
 * without a second implementation, and dragging on a phone would collide with
 * the page scroll.
 *
 * Changes are written as they are made rather than on a Save button, so the
 * page behind the sheet rearranges as you go — which is the only way to tell
 * whether the arrangement is the one you wanted.
 */
const DashboardCustomiser: React.FC<{
  widgets: ResolvedWidget[];
  onChange: (next: ResolvedWidget[]) => void;
  onClose: () => void;
}> = ({ widgets, onChange, onClose }) => (
  <EditorSheet
    title="Customise the dashboard"
    subtitle="Changes apply straight away, on this device and every other one."
    onClose={onClose}
    footer={
      <Button type="button" variant="primary" onClick={onClose}>
        Done
      </Button>
    }
  >
    <ul className="widget-list">
      {widgets.map((widget, index) => {
        const definition = widgetDefinition(widget.id);
        return (
          <li key={widget.id} className={`widget-row${widget.visible ? "" : " widget-row-hidden"}`}>
            <div className="widget-text">
              <span className="text-callout widget-name">
                {definition.label}
                {definition.required && (
                  <span className="text-caption widget-required">
                    <Lock size={11} aria-hidden="true" /> always shown
                  </span>
                )}
              </span>
              <span className="text-caption">{definition.description}</span>
            </div>
            <div className="widget-controls">
              <Button
                variant="ghost"
                size="sm"
                icon
                disabled={index === 0}
                aria-label={`Move ${definition.label} up`}
                onClick={() => onChange(moveWidget(widgets, widget.id, -1))}
              >
                <ArrowUp size={15} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon
                disabled={index === widgets.length - 1}
                aria-label={`Move ${definition.label} down`}
                onClick={() => onChange(moveWidget(widgets, widget.id, 1))}
              >
                <ArrowDown size={15} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon
                disabled={definition.required}
                aria-label={widget.visible ? `Hide ${definition.label}` : `Show ${definition.label}`}
                title={
                  definition.required
                    ? "A dashboard with no figures on it is a blank page, not a simpler one."
                    : undefined
                }
                onClick={() => onChange(toggleWidget(widgets, widget.id))}
              >
                {widget.visible ? <Eye size={15} /> : <EyeOff size={15} />}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  </EditorSheet>
);
