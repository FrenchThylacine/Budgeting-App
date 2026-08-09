import React, { useMemo } from "react";
import { calculateYear } from "../../domain/calculations";
import { useBudgetStore } from "../../store/budgetStore";
import { formatDualMoney } from "../../utils/formatters";
import { EmptyState } from "../ui/EmptyState";
import { Metric } from "../ui/Metric";
import { Section } from "../ui/Section";

export const AnalyticsPanel: React.FC = () => {
  const snapshot = useBudgetStore((s) => s.snapshot); const result = useMemo(() => calculateYear(snapshot), [snapshot]);
  const monthTotal = result.selectedMonthSpend.total; const count = result.selectedMonthSpend.entryCount; const average = monthTotal == null || count === 0 ? null : monthTotal / count;
  return <div className="page-enter" style={{ display: "grid", gap: 24 }}><Section title="Analytics"><div className="dashboard-hero"><Metric label="Month total" value={formatDualMoney(monthTotal, snapshot.settings)} detail={`${count} transactions`} /><Metric label="Average transaction" value={formatDualMoney(average, snapshot.settings)} detail="Recorded transactions only" /><Metric label="Year to date" value={formatDualMoney(result.ytdTotal, snapshot.settings)} detail="All recorded months" /></div></Section><Section title="Category breakdown">{result.categoryTotals.length === 0 ? <EmptyState title="No category data" description="Transactions will appear here once recorded." /> : <div className="item-list">{result.categoryTotals.map((category) => <div key={category.categoryId} className="item-row"><div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 10, height: 10, borderRadius: 99, background: category.color }} />{category.categoryName}{category.bucket === "piloting" && <span className="text-footnote">Piloting</span>}</div><strong>{formatDualMoney(category.total, snapshot.settings)}</strong></div>)}</div>}</Section></div>;
};
