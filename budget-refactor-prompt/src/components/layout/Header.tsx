import React from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { calculateYear } from "../../domain/calculations";
import { monthName, weeksInIsoYear } from "../../domain/dates";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import {
  ChevronLeft, ChevronRight, Sun, Moon, Undo2, Redo2, Save, Wallet,
  Calendar, Clock
} from "lucide-react";
import type { BudgetCalculation } from "../../domain/types";

export const Header: React.FC<{
  calculation: BudgetCalculation;
  setRolloverOpen: (v: boolean) => void;
}> = ({ calculation, setRolloverOpen }) => {
  const snapshot = useBudgetStore((s) => s.snapshot);
  const updateSettings = useBudgetStore((s) => s.updateSettings);
  const selectYear = useBudgetStore((s) => s.selectYear);
  const undo = useBudgetStore((s) => s.undo);
  const redo = useBudgetStore((s) => s.redo);

  const currentYear = snapshot.settings.selectedYear;
  const maxWeeks = weeksInIsoYear(currentYear);
  const yearOptions = Array.from(
    new Set([currentYear - 1, currentYear, currentYear + 1, 2026, 2027, 2028, 2029, 2030, ...Object.keys(snapshot.years).map(Number)])
  ).sort((a, b) => a - b);

  const latestAudit = snapshot.auditLog[0];

  function moveMonth(delta: number) {
    let nextMonth = snapshot.settings.selectedMonth + delta;
    let nextYear = currentYear;
    if (nextMonth < 1) { nextMonth = 12; nextYear -= 1; }
    if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }
    if (nextYear !== currentYear) selectYear(nextYear);
    updateSettings({ selectedMonth: nextMonth });
  }

  function moveWeek(delta: number) {
    let nextWeek = snapshot.settings.selectedWeek + delta;
    let nextYear = currentYear;
    if (nextWeek < 1) { nextYear -= 1; nextWeek = weeksInIsoYear(nextYear); }
    if (nextWeek > maxWeeks) { nextYear += 1; nextWeek = 1; }
    if (nextYear !== currentYear) selectYear(nextYear);
    updateSettings({ selectedWeek: nextWeek });
  }

  const status = calculation.selectedMonthSpend.status;
  const statusTone = status === "nan" ? "danger" : status === "pending" ? "warning" : "success";

  return (
    <header className="top-header">
      <div>
        <div className="text-footnote" style={{ marginBottom: 4 }}>Current Period</div>
        <h1 className="text-display" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>
          {monthName(calculation.month)} {calculation.year}
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <Badge tone={statusTone}>{status === "value" ? "Active" : status === "zero" ? "No Spend" : status === "pending" ? "Pending" : "Closed"}</Badge>
          <span className="text-caption">Week {calculation.week}{snapshot.settings.selectedSeason ? ` · ${snapshot.settings.selectedSeason}` : ""}</span>
        </div>
        {latestAudit && (
          <div className="text-caption" style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={12} /> Last: {latestAudit.summary}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-end" }}>
        <div className="period-nav">
          <Button variant="ghost" icon onClick={() => moveMonth(-1)} aria-label="Previous month">
            <ChevronLeft size={18} />
          </Button>
          <select
            className="select"
            style={{ width: "auto", minWidth: 120 }}
            value={snapshot.settings.selectedMonth}
            onChange={(e) => updateSettings({ selectedMonth: Number(e.target.value) })}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>
            ))}
          </select>
          <Button variant="ghost" icon onClick={() => moveMonth(1)} aria-label="Next month">
            <ChevronRight size={18} />
          </Button>

          <select
            className="select"
            style={{ width: "auto", minWidth: 80 }}
            value={currentYear}
            onChange={(e) => selectYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <Button variant="ghost" icon onClick={() => moveWeek(-1)} aria-label="Previous week">
            <ChevronLeft size={18} />
          </Button>
          <span className="text-caption" style={{ minWidth: 60, textAlign: "center" }}>W{snapshot.settings.selectedWeek}</span>
          <Button variant="ghost" icon onClick={() => moveWeek(1)} aria-label="Next week">
            <ChevronRight size={18} />
          </Button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="ghost" icon onClick={() => updateSettings({ darkMode: !snapshot.settings.darkMode })} title="Toggle theme">
            {snapshot.settings.darkMode ? <Sun size={17} /> : <Moon size={17} />}
          </Button>
          <Button variant="ghost" icon onClick={undo} title="Undo (Ctrl+Z)">
            <Undo2 size={17} />
          </Button>
          <Button variant="ghost" icon onClick={redo} title="Redo (Ctrl+Y)">
            <Redo2 size={17} />
          </Button>
          <Button variant="secondary" onClick={() => updateSettings({ lastUpdated: new Date().toISOString() })}>
            <Save size={16} /> Save
          </Button>
          <Button variant="primary" onClick={() => setRolloverOpen(true)}>
            <Wallet size={16} /> Close Month
          </Button>
        </div>
      </div>
    </header>
  );
};
