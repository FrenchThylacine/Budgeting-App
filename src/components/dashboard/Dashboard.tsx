import React, { useCallback, useMemo, useState } from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { calculateYear, calculateSuggestedMonthlyBudget } from "../../domain/calculations";
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
import { AircraftArt } from "../ui/Aircraft";
import {
  AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Calendar, CreditCard, Eye, EyeOff, Lock,
  PiggyBank, SlidersHorizontal, TrendingDown, TrendingUp, Zap,
} from "lucide-react";
import { EditorSheet } from "../ui/EditorSheet";
import { FundingMark } from "../ui/FundingMark";
import { Money, Total } from "../ui/Money";
import { useTranslation } from "../../i18n/useTranslation";
import type { Translator } from "../../domain/i18n";
import { storedText } from "../../domain/storedText";
import { walletComposition } from "../../domain/wallet";
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

/*
 * Status colours as **text** use the `-text` variants, always.
 *
 * `--success`, `--warning` and `--danger` are fill colours: they are chosen to
 * carry a chart series, a progress bar or a border, where saturation is the
 * point. As 13–17px type on the page they measure 3.2, 2.5 and 3.6 to one,
 * which fails the 4.5 minimum. The `-text` variants are the same hues darkened
 * until they pass, and in dark mode they are the same value, because there the
 * saturated hue already passes against a dark ground.
 *
 * The rule is mechanical: `background`/`border` may take the fill; `color`
 * must take `-text`.
 */
const GRADE_COLOR: Record<string, string> = {
  excellent: "var(--success-text)",
  good: "var(--success-text)",
  fair: "var(--warning-text)",
  "at-risk": "var(--danger-text)",
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
  t: Translator,
): string {
  const lead = t(
    score >= 85
      ? "health.leadComfortable"
      : score >= 70
        ? "health.leadOnTrack"
        : score >= 50
          ? "health.leadThin"
          : "health.leadOverrunning",
  );
  if (projectedRemaining == null) return lead;
  return projectedRemaining < 0
    ? `${lead} ${t("health.endsOver", { amount: money(Math.abs(projectedRemaining)) })}`
    : `${lead} ${t("health.endsUnspent", { amount: money(projectedRemaining) })}`;
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
          tone === "positive" ? "var(--success-text)"
          : tone === "negative" ? "var(--danger-text)"
          : tone === "warning" ? "var(--warning-text)"
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
  const { t, language, monthNames } = useTranslation();
  /*
   * The week marker under a bar. "W28" is English; each language writes its
   * own, which is why this is a key rather than a prefix glued to a number.
   */
  const weekAxis = useCallback((week: number) => t("chart.weekAxis", { week }), [t]);
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
  const comparison = useMemo(() => periodComparison(snapshot, settings, language), [snapshot, settings, language]);
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
  /*
   * What the wallet actually holds, currency by currency. The same selector
   * the Wallet tab and the statistics use, so the three cannot drift.
   */
  const walletHoldings = useMemo(() => walletComposition(snapshot), [snapshot]);
  const healthColor = health.grade ? GRADE_COLOR[health.grade] ?? "var(--accent)" : "var(--text-tertiary)";

  /** Who paid for this period's transactions. See domain/funding.ts. */
  const allPeriodEntries = useMemo(() => entriesForSelectedPeriod(snapshot, settings), [snapshot, settings]);
  const funding = useMemo(() => fundingSplit(allPeriodEntries, snapshot), [allPeriodEntries, snapshot]);

  const trendBars = useMemo(
    () =>
      mode === "week"
        ? weeklyTrendBars(calculation.weeklyTrend, settings.selectedWeek, weekAxis, 12)
        : monthlyTrendBars(calculation.monthlyTrend, mode === "year" ? -1 : settings.selectedMonth, monthNames("short")),
    [mode, calculation.weeklyTrend, calculation.monthlyTrend, settings.selectedWeek, settings.selectedMonth],
  );
  /** Two months is the floor for a trend; below it there is nothing to draw. */
  const hasTrend = trendBars.filter((bar) => bar.value != null).length >= 2;

  const budgetReference: ChartReferenceLine[] =
    mode !== "week" && calculation.monthlyBudgetBase > 0
      ? [{ value: calculation.monthlyBudgetBase, label: t("chart.budgetLine", { amount: money(calculation.monthlyBudgetBase) }) }]
      : [];

  const categoryRows: HorizontalBarRow[] = categories.slice(0, 6).map((stat) => ({
    id: stat.categoryId,
    label: stat.category?.name ?? t("common.uncategorised"),
    value: stat.total,
    color: stat.category?.color ?? "var(--series-1)",
    caption:
      stat.cap != null
        ? stat.overCap
          ? t("dashboard.overCapBy", { amount: money(stat.total - stat.cap) })
          : t("dashboard.leftOfCap", { amount: money(stat.cap - stat.total) })
        : stat.share != null
        ? t("dashboard.percentOfSpending", { percent: stat.share.toFixed(0) })
        : undefined,
    marker: stat.cap != null ? { value: stat.cap, label: t("chart.capLine", { amount: money(stat.cap) }) } : undefined,
    badge: stat.overCap ? t("dashboard.overCap") : undefined,
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
      note: storedText(status === "approved" ? "approval.approvedHere" : "approval.rejectedHere"),
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
                    aircraft on a white card is an outline and a shadow. */}
                <span className="start-mark">
                  <AircraftArt id={snapshot.settings.aircraft} size={104} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <h2 className="text-title" style={{ margin: 0 }}>{t("dashboard.blankTitle")}</h2>
                  <p className="text-caption" style={{ marginTop: 4 }}>
                    {t("dashboard.blankBody")}
                  </p>
                </div>
              </div>

              <div className="start-steps">
                <button type="button" className="start-step" onClick={() => onNavigate?.("settings")}>
                  <span className="start-step-index">{t("settings.import")}</span>
                  <span className="text-callout">{t("dashboard.bringInASpreadsheet")}</span>
                  <span className="text-caption">
                    {t("dashboard.loadAnExistingWorkbookOr")}
                  </span>
                </button>
                <button type="button" className="start-step" onClick={() => onNavigate?.("activities")}>
                  <span className="start-step-index">{t("dashboard.setUp")}</span>
                  <span className="text-callout">{t("dashboard.addYourRecurringExpenses")}</span>
                  <span className="text-caption">
                    {t("dashboard.subscriptionsRentLessonsTheseDrive")}
                  </span>
                </button>
                <button type="button" className="start-step" onClick={() => onNavigate?.("spending")}>
                  <span className="start-step-index">{t("dashboard.record")}</span>
                  <span className="text-callout">{t("dashboard.logATransaction")}</span>
                  <span className="text-caption">
                    {t("dashboard.recordHint", { period: periodLabel(settings, language) })}
                  </span>
                </button>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="text-title" style={{ margin: "0 0 12px" }}>{t("dashboard.upcoming")}</h2>
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
                <AlertTriangle size={18} style={{ color: "var(--danger-text)", flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div className="text-title">
                    {overCap.length === 1
                      ? "1 category is over its monthly cap"
                      : `${overCap.length} categories are over their monthly caps`}
                  </div>
                  <div className="text-caption" style={{ marginTop: 4 }}>
                    {overCap
                      .map((s) => `${s.category?.name ?? t("common.uncategorised")} (${t("dashboard.overBy", { amount: money(s.total - (s.cap ?? 0)) })})`)
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
            {/* The card fills the height of the column of figures beside it,
                so its body has to fill the card — otherwise the gauge sits at
                the top of a 440px box with 200px of nothing under it, which is
                what it did. */}
            <Card className="health-card">
              <CardBody className="health-card-body">
                <div className="health-layout">
                  <ProgressRing
                    value={health.score}
                    valueText={health.score != null ? String(Math.round(health.score)) : "—"}
                    label={health.grade ? t(`health.grade.${health.grade}`) : t("health.notEnoughData")}
                    caption={health.score != null ? t("health.outOf100") : undefined}
                    ariaLabel={t("a11y.budgetHealth", {
                      score: health.score != null ? Math.round(health.score) : t("common.unknown"),
                    })}
                    size={230}
                    thickness={16}
                    color={healthColor}
                    labelColor={healthColor}
                    scaleLabels={["0", "100"]}
                  />

                  <div style={{ display: "grid", gap: 12, minWidth: 0, alignContent: "center" }}>
                    <h2 className="text-title" style={{ margin: 0 }}>
                      {t("dashboard.budgetHealthFor", { period: periodLabel(settings, language) })}
                    </h2>
                    {/* One sentence saying what the number means, so the gauge is
                        not a score with no explanation attached to it. */}
                    {health.score != null && (
                      <p className="text-note" style={{ margin: 0 }}>
                        {healthSummary(health.score, pacing?.projectedRemaining ?? null, money, t)}
                      </p>
                    )}

                    {health.factors.length > 0 ? (
                      <div style={{ display: "grid", gap: 10 }}>
                        {health.factors.map((factor) => (
                          <div key={factor.id} style={{ display: "grid", gap: 4, minWidth: 0 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <span className="text-callout">{t(factor.labelKey)}</span>
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
                            {factor.detailKey && (
                              <div className="text-caption" style={{ color: "var(--text-tertiary)" }}>
                                {t(factor.detailKey, factor.detailParams)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-caption">
                        {t("dashboard.recordSpendingAndSetA")}
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
                    <PiggyBank size={14} /> {t("dashboard.approvedBudgetRemaining")}
                  </div>
                  <div className="text-headline money">{pacing != null ? money(pacing.remaining) : "—"}</div>
                  <div className="text-caption" style={{ marginTop: 4 }}>
                    {pacing != null
                      ? t("dashboard.percentOfBudgetUsed", {
                          percent: Math.round(pacing.utilisation ?? 0),
                          amount: money(pacing.budget),
                        })
                      : mode !== "month"
                      ? t("dashboard.budgetIsMonthly")
                      : t("dashboard.noMonthlyBudget")}
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
                    <Zap size={14} />{" "}
                    {t(mode === "week" ? "dashboard.weekSpending" : mode === "year" ? "dashboard.yearSpending" : "dashboard.monthSpending")}
                  </div>
                  <div className="text-headline money">{stats.total != null ? money(stats.total) : t("common.noData")}</div>
                  <div className="text-caption" style={{ marginTop: 4 }}>
                    {t("dashboard.transactionCount", { count: stats.count })}
                    {stats.average != null ? ` · ${t("dashboard.averageAmount", { amount: money(stats.average) })}` : ""}
                  </div>
                  {/* Money this budget did not pay for, in the vocabulary the
                      rest of the application uses for it: the glyph, the
                      colour and the amount. It used to be two sentences
                      explaining, on every visit, a rule that the badge beside
                      every such transaction already states. */}
                  {(funding.otherFundedCount > 0 || funding.outsideBudgetCount > 0) && (
                    <div className="funding-chips">
                      {funding.otherFundedCount > 0 && (
                        <FundingMark kind="other">{money(funding.otherFunded)}</FundingMark>
                      )}
                      {funding.outsideBudgetCount > 0 && (
                        <FundingMark kind="outside">{money(funding.outsideBudget)}</FundingMark>
                      )}
                    </div>
                  )}
                </CardBody>
              </Card>

              {/* Only when there is something to compare against.

                  A first month has no month before it, and this card spent
                  the whole of one saying so: a heading, the words "No data" at
                  headline size, and a sentence explaining that nothing was
                  recorded earlier. That is the same rule the trend chart below
                  already follows — a card whose entire content is "we have no
                  history" has no reason to exist — and it was not being
                  applied here. */}
              {comparison.deltaAbs != null && (
                <Card>
                  <CardBody>
                    <div className="text-footnote" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      {comparison.deltaAbs > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {t("dashboard.versus", { period: comparison.previousLabel })}
                    </div>
                    <div
                      className="text-headline money"
                      style={{ color: comparison.deltaAbs > 0 ? "var(--danger-text)" : "var(--success-text)" }}
                    >
                      {formatDualMoney(comparison.deltaAbs, settings, { showSign: true })}
                    </div>
                    {comparison.deltaPct != null && (
                      <div className="text-caption" style={{ marginTop: 4 }}>
                        {t("dashboard.vsPrevious", {
                          delta: `${comparison.deltaPct > 0 ? "+" : ""}${comparison.deltaPct.toFixed(1)}%`,
                        })}
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}
            </div>
          </div>
      </>
    ),
    charts: (
      <>
        {/* Trend and forecast.

            The trend needs two months to be a trend. Below that it is not
            shown *at all* rather than shown as an empty card with a sentence
            in the middle: a card whose whole content is "we have no history"
            is a card that has no reason to exist, and the forecast beside it
            takes the width instead. It used to draw one bar and eleven
            question marks, which took a third of the first screen. */}
        <div className={`dashboard-row${hasTrend ? "" : " dashboard-row-single"}`}>
          {hasTrend && (
            <Card>
              <CardBody>
                <BarChart
                  title={t(mode === "week" ? "dashboard.trendWeekly" : "dashboard.trendMonthly")}
                  bars={trendBars.map((bar) => ({ label: bar.label, value: bar.value, highlight: bar.highlight }))}
                  height={190}
                  referenceLines={budgetReference}
                  formatValue={(v) => money(v)}
                  formatTick={compactNumber}
                />
              </CardBody>
            </Card>
          )}

          <Card>
            <CardBody>
              {forecast == null || forecast.actual.every((v) => v == null) ? (
                <EmptyState title={t("dashboard.noForecastYet")} description={t("dashboard.forecastingStartsOnceThePeriod")} />
              ) : (
                <>
                  <LineChart
                    title={t("dashboard.forecast")}
                    labels={forecast.labels}
                    series={[
                      { id: "actual", name: t("chart.actual"), color: "var(--series-1)", values: forecast.actual, area: true },
                      { id: "projected", name: t("chart.projected"), color: "var(--series-2)", values: forecast.projected, dashed: true },
                    ]}
                    referenceLines={
                      forecast.budget != null
                        ? [{ value: forecast.budget, label: t("chart.budgetLine", { amount: money(forecast.budget) }) }]
                        : []
                    }
                    formatValue={(v) => money(v)}
                    formatTick={compactNumber}
                  />
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
        <Disclosure title={t("report.detail")} defaultOpen={false}>
        <div className="dashboard-row">
          <Card>
            <CardBody>
              <HorizontalBarChart
                title={t("dashboard.whereTheMoneyWent")}
                description={`${t("dashboard.topCategories")} · ${periodLabel(settings, language)}`}
                rows={categoryRows}
                formatValue={(v) => money(v)}
                emptyMessage={t("dashboard.addTransactionsToSeeYour")}
              />
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <DonutChart
                title={t("dashboard.recurringVsOneOff")}
                description={t("dashboard.howMuchOfThisPeriod")}
                segments={[
                  { id: "recurring", label: t("common.recurring"), value: stats.recurringTotal, color: "var(--series-1)" },
                  { id: "oneoff", label: t("common.oneOff"), value: stats.oneOffTotal, color: "var(--series-2)" },
                ]}
                centerValue={stats.total != null ? money(stats.total) : "—"}
                centerLabel="total"
                formatValue={(v) => money(v)}
                emptyMessage={t("dashboard.thisSplitAppearsOnceThe")}
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginTop: 12 }}>
                <Figure
                  label={t("report.recurring")}
                  value={money(stats.recurringTotal)}
                  detail={
                    stats.recurringShare != null
                      ? t("dashboard.percentOfSpend", { percent: stats.recurringShare.toFixed(0) })
                      : undefined
                  }
                />
                {/* The commitment this budget has to carry, not the gross.
                    An activity somebody else pays for costs real money and
                    costs *this* budget nothing — `includedBudget` is the
                    personal figure, and it is what the remaining budget is
                    measured against. */}
                <Figure
                  label={t("dashboard.committedMonthly")}
                  value={money(calculation.includedBudget)}
                  detail={`${calculation.activityEstimates.length} ${calculation.activityEstimates.length === 1 ? "activity" : "activities"}`}
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
                    <div className="text-title">{t("dashboard.suggestedMonthlyBudget")}</div>
                    <div className="text-caption" style={{ marginTop: 4 }}>
                      {t("dashboard.basedOnActive", {
                        count: calculation.activityEstimates.filter((a) => a.activity.active && a.activity.visible).length,
                      })}
                      {suggestion.recurringTotal > 0 &&
                        ` · ${t("dashboard.totalRecurring", { amount: money(suggestion.recurringTotal) })}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div className="text-headline money">{money(suggestion.suggestedAmount)}</div>
                    <Button variant="primary" onClick={() => handleApproveBudget("approved")}>
                      Approve <ArrowRight size={16} />
                    </Button>
                    <Button variant="ghost" onClick={() => handleApproveBudget("rejected")}>{t("tutorial.skip")}</Button>
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
                      {t(existingApproval.status === "approved" ? "dashboard.budgetApproved" : "dashboard.budgetRejected")}
                    </div>
                    <div className="text-caption" style={{ marginTop: 4 }}>
                      {/* `monthNames()` from the hook, not the English-only
                          `monthName()`: this line read "August 2026" on a
                          French screen. The sentence around it is a key too —
                          " · suggested" was English written into the markup. */}
                      {t("dashboard.approvalSuggested", {
                        month: monthNames()[existingApproval.month - 1] ?? String(existingApproval.month),
                        year: existingApproval.year,
                        amount: money(existingApproval.suggestedAmount),
                      })}
                    </div>
                  </div>
                  <Badge tone={existingApproval.status === "approved" ? "success" : "neutral"}>
                    {t(existingApproval.status === "approved" ? "common.approved" : "common.rejected")}
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
            <h2 className="text-title" style={{ margin: "0 0 12px" }}>{t("dashboard.upcoming")}</h2>
            <UpcomingSchedule snapshot={snapshot} money={money} />
          </CardBody>
        </Card>
      </>
    ),
    savings: (
      <>
        <Disclosure title={t("dashboard.savingsAndWallet")} defaultOpen={false}>
          <Card>
            <CardBody>
              <div style={{ display: "grid", gap: 14 }}>
                {/* Wallet balance, and nothing else.

                    This card used to carry the balance, the remaining budget,
                    the personal balance and a year-to-date figure — a treasury
                    summary on a dashboard, four inches from the Wallet tab that
                    exists to hold exactly that. What somebody wants from a
                    dashboard is *how much money is there*. The breakdown lives
                    one press away, where it is the subject rather than an
                    aside.

                    The figure comes from the same `calculation.wallet` the
                    Wallet tab reads, so the two cannot disagree. */}
                <div>
                  <div className="text-footnote" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <CreditCard size={14} /> {t("wallet.balance")}
                  </div>
                  <div className="text-headline money">
                    {walletHoldings.length === 1 && walletHoldings[0].currency !== settings.baseCurrency ? (
                      /* One currency, and not the one everything is displayed
                         in: the balance *is* that amount, so it is printed as
                         itself with the display equivalent underneath rather
                         than converted away. A wallet holding 200 USD holds
                         200 USD, whatever it is worth today. */
                      <Money amount={walletHoldings[0].amount} currency={walletHoldings[0].currency} strong />
                    ) : (
                      <Total amount={calculation.wallet.walletTotal} />
                    )}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Not wallet money, and so not on the wallet card. A wishlist total
              is a plan and a year-to-date figure is spending; putting either
              beside a cash balance invites them to be read as part of it. */}
          <Card>
            <CardBody>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
                  <Figure
                    label={t("nav.wishlist")}
                    value={money(calculation.wishlist.activeTotal)}
                    detail={t("stats.activeItems", { count: calculation.wishlist.activeCount })}
                  />
                  <Figure
                    label={t("dashboard.ytdSpend")}
                    value={money(calculation.ytdTotal)}
                    detail={
                      calculation.otherFundedYtdTotal > 0 || calculation.outsideBudgetYtdTotal > 0
                        ? [
                            calculation.otherFundedYtdTotal > 0
                              ? t("dashboard.amountByOthers", { amount: money(calculation.otherFundedYtdTotal) })
                              : null,
                            calculation.outsideBudgetYtdTotal > 0
                              ? t("dashboard.amountOutside", { amount: money(calculation.outsideBudgetYtdTotal) })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : undefined
                    }
                  />
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
          <SlidersHorizontal size={14} /> {t("dashboard.customise")}
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
}> = ({ widgets, onChange, onClose }) => {
  const { t } = useTranslation();
  return (
  <EditorSheet
    title={t("dashboard.customiseTheDashboard")}
    subtitle={t("dashboard.changesApplyStraightAwayOn")}
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
                {t(definition.labelKey)}
                {definition.required && (
                  <span className="text-caption widget-required">
                    <Lock size={11} aria-hidden="true" /> {t("dashboard.alwaysShown")}
                  </span>
                )}
              </span>
              <span className="text-caption">{t(definition.descriptionKey)}</span>
            </div>
            <div className="widget-controls">
              <Button
                variant="ghost"
                size="sm"
                icon
                disabled={index === 0}
                aria-label={t("dashboard.moveUp", { name: t(definition.labelKey) })}
                onClick={() => onChange(moveWidget(widgets, widget.id, -1))}
              >
                <ArrowUp size={15} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon
                disabled={index === widgets.length - 1}
                aria-label={t("dashboard.moveDown", { name: t(definition.labelKey) })}
                onClick={() => onChange(moveWidget(widgets, widget.id, 1))}
              >
                <ArrowDown size={15} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon
                disabled={definition.required}
                aria-label={t(widget.visible ? "dashboard.hideWidget" : "dashboard.showWidget", { name: t(definition.labelKey) })}
                title={
                  definition.required
                    ? t("dashboard.requiredWidget")
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
};
