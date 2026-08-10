import React from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { calculateYear } from "../../domain/calculations";
import { getIsoWeek, monthName, weekYear } from "../../domain/dates";
import { movePeriod, periodLabel, periodPatchForMode, selectedIsoWeekYear } from "../../domain/periods";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import {
  ChevronLeft, ChevronRight, Sun, Moon, Undo2, Redo2, Save, Wallet,
  Calendar, Clock
} from "lucide-react";
type BudgetCalculation = ReturnType<typeof calculateYear>;

export const Header: React.FC<{
  calculation: BudgetCalculation;
  setRolloverOpen: (v: boolean) => void;
}> = ({ calculation, setRolloverOpen }) => {
  const snapshot = useBudgetStore((s) => s.snapshot);
  const updateSettings = useBudgetStore((s) => s.updateSettings);
  const selectYear = useBudgetStore((s) => s.selectYear);
  const undo = useBudgetStore((s) => s.undo);
  const redo = useBudgetStore((s) => s.redo);
  const isCurrentPeriodMutable = useBudgetStore((s) => s.isCurrentPeriodMutable);

  const currentYear = snapshot.settings.selectedYear;
  const mode = snapshot.settings.selectedPeriodMode;
  const activeYear = mode === "week" ? selectedIsoWeekYear(snapshot.settings) : currentYear;
  const yearOptions = Array.from(
    new Set([activeYear - 1, activeYear, activeYear + 1, 2026, 2027, 2028, 2029, 2030, ...Object.keys(snapshot.years).map(Number)])
  ).sort((a, b) => a - b);

  const latestAudit = snapshot.auditLog[0];

  function selectMonth(month: number, year = currentYear) {
    const date = new Date(Date.UTC(year, month - 1, 1));
    updateSettings({ selectedYear: year, selectedMonth: month, selectedWeek: getIsoWeek(date), selectedWeekYear: weekYear(date) });
  }

  const periodTitle = periodLabel(snapshot.settings);

  const status = calculation.selectedMonthSpend.status;
  const statusTone = status === "nan" ? "danger" : status === "pending" ? "warning" : "success";

  return (
    <header className="top-header">
      <div>
        <div className="text-footnote" style={{ marginBottom: 4 }}>Current Period</div>
        <h1 className="text-display" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>
          {periodTitle}
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <Badge tone={statusTone}>{status === "value" ? "Active" : status === "zero" ? "No Spend" : status === "pending" ? "Pending" : "Closed"}</Badge>
          <span className="text-caption">{mode === "month" ? `Week ${calculation.week}` : mode === "week" ? `${activeYear} ISO week` : "Year overview"}{snapshot.settings.selectedSeason ? ` · ${snapshot.settings.selectedSeason}` : ""}</span>
        </div>
        {latestAudit && (
          <div className="text-caption" style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={12} /> Last: {latestAudit.summary}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-end" }}>
        <div className="period-selector" aria-label="Period selector">
          <div className="period-mode-toggle" role="group" aria-label="Period type">
            {(["month", "week", "year"] as const).map((periodMode) => (
              <button key={periodMode} className={`period-mode ${mode === periodMode ? "active" : ""}`} onClick={() => updateSettings(periodPatchForMode(snapshot.settings, periodMode))} type="button">{periodMode}</button>
            ))}
          </div>
          <div className="period-nav">
          <Button variant="ghost" icon onClick={() => updateSettings(movePeriod(snapshot.settings, -1))} aria-label={`Previous ${mode}`}>
            <ChevronLeft size={18} />
          </Button>
          {mode === "month" && <select
            className="select"
            style={{ width: "auto", minWidth: 120 }}
            value={snapshot.settings.selectedMonth}
            onChange={(e) => selectMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>
            ))}
          </select>}

          {mode === "week" && <div className="period-current-label">W{snapshot.settings.selectedWeek}</div>}
          <select
            className="select"
            style={{ width: "auto", minWidth: 80 }}
            value={activeYear}
            onChange={(e) => mode === "week" ? updateSettings({ selectedWeekYear: Number(e.target.value) }) : selectYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <Button variant="ghost" icon onClick={() => updateSettings(movePeriod(snapshot.settings, 1))} aria-label={`Next ${mode}`}>
            <ChevronRight size={18} />
          </Button>
          </div>
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
          <Button variant="primary" onClick={() => setRolloverOpen(true)} disabled={!isCurrentPeriodMutable()} title={isCurrentPeriodMutable() ? undefined : "Historical periods are read-only"}>
            <Wallet size={16} /> Close Month
          </Button>
        </div>
      </div>
    </header>
  );
};
