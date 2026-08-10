import React, { useMemo } from "react";
import { calculateYear, normalizeEntry } from "../../domain/calculations";
import { selectedIsoWeekYear } from "../../domain/periods";
import { weekYear } from "../../domain/dates";
import { useBudgetStore } from "../../store/budgetStore";
import { formatDualMoney } from "../../utils/formatters";
import { EmptyState } from "../ui/EmptyState";
import { Metric } from "../ui/Metric";
import { Section } from "../ui/Section";

export const AnalyticsPanel: React.FC = () => {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const result = useMemo(() => calculateYear(snapshot), [snapshot]);
  const mode = snapshot.settings.selectedPeriodMode ?? "month";

  const analytics = useMemo(() => {
    const allEntries = Object.values(snapshot.years).flatMap((year) => year.spendingEntries);
    const entries = allEntries.filter((entry) => {
      if (mode === "week") return entry.week === snapshot.settings.selectedWeek
        && weekYear(new Date(`${entry.date}T12:00:00`)) === selectedIsoWeekYear(snapshot.settings);
      if (mode === "year") return entry.year === snapshot.settings.selectedYear;
      return entry.year === snapshot.settings.selectedYear && entry.month === snapshot.settings.selectedMonth;
    });
    const includedEntries = snapshot.settings.ignoreNonBudgetSpending
      ? entries.filter((entry) => (entry.source ?? "personal") === "personal")
      : entries;
    const total = includedEntries.reduce((sum, entry) => sum + normalizeEntry(entry, snapshot), 0);
    const categoryMap = new Map(snapshot.categories.map((category) => [category.id, category]));
    const categories = new Map<string, number>();
    for (const entry of includedEntries) {
      categories.set(entry.categoryId, (categories.get(entry.categoryId) ?? 0) + normalizeEntry(entry, snapshot));
    }
    const categoryTotals = [...categories.entries()]
      .map(([categoryId, value]) => ({ category: categoryMap.get(categoryId), value }))
      .sort((a, b) => b.value - a.value);
    const normalTotal = categoryTotals
      .filter(({ category }) => category?.bucket !== "piloting")
      .reduce((sum, { value }) => sum + value, 0);
    return { entries: includedEntries, total, categoryTotals, normalTotal };
  }, [mode, snapshot]);

  const average = analytics.entries.length === 0 ? null : analytics.total / analytics.entries.length;
  const periodLabel = mode === "week"
    ? `Week ${snapshot.settings.selectedWeek} · ${selectedIsoWeekYear(snapshot.settings)}`
    : mode === "year" ? String(snapshot.settings.selectedYear) : result.selectedMonthSpend.label;

  return (
    <div className="page-enter" style={{ display: "grid", gap: 24 }}>
      <Section title={`Analytics · ${periodLabel}`}>
        <div className="dashboard-hero">
          <Metric label="Period spending" value={formatDualMoney(analytics.total, snapshot.settings)} detail={`${analytics.entries.length} transactions`} />
          <Metric label="Average transaction" value={formatDualMoney(average, snapshot.settings)} detail="Recorded transactions only" />
          <Metric label="Budget remaining" value={formatDualMoney(result.delta, snapshot.settings)} detail="Monthly budget context" />
        </div>
      </Section>

      <Section title="Category breakdown">
        {analytics.categoryTotals.length === 0 ? (
          <EmptyState title="No spending for this period" description="Zero recorded spending and unavailable historical data remain distinct in the dashboard history." />
        ) : (
          <div className="item-list">
            {analytics.categoryTotals.map(({ category, value }) => {
              const isPiloting = category?.bucket === "piloting";
              const share = !isPiloting && analytics.normalTotal > 0 ? (value / analytics.normalTotal) * 100 : null;
              return (
                <div key={category?.id ?? "uncategorized"} className="item-row">
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 99, background: category?.color ?? "#64748B" }} />
                    <span>{category?.name ?? "Uncategorized"}</span>
                    {isPiloting && <span className="text-footnote">Excluded from shares</span>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong>{formatDualMoney(value, snapshot.settings)}</strong>
                    {share !== null && <div className="text-footnote">{share.toFixed(1)}% of standard spend</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
};
