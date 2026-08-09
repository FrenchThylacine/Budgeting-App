import React, { useMemo } from "react";
import { calculateYear } from "../../domain/calculations";
import { formatDualMoney, statusLabel } from "../../utils/formatters";
import { useBudgetStore } from "../../store/budgetStore";
import { EmptyState } from "../ui/EmptyState";
import { Section } from "../ui/Section";

export const HistoryPanel: React.FC = () => {
  const snapshot = useBudgetStore((s) => s.snapshot); const calculation = useMemo(() => calculateYear(snapshot), [snapshot]);
  return <div className="page-enter" style={{ display: "grid", gap: 20 }}><Section title="Financial history"><div className="text-caption">Closed periods retain their recorded status; missing data is shown as unavailable rather than zero.</div></Section><div className="item-list">{calculation.monthlyTrend.map((period) => <div className="item-row" key={period.month}><div><div className="text-callout" style={{ fontWeight: 600 }}>{period.label} {period.year}</div><div className="text-footnote">{statusLabel(period.status)} · {period.entryCount} transactions</div></div><strong>{formatDualMoney(period.total, snapshot.settings)}</strong></div>)}</div>{snapshot.budgetApprovals.length === 0 && <EmptyState title="No budget approvals" description="Approved budgets are retained here as historical records." />}</div>;
};
