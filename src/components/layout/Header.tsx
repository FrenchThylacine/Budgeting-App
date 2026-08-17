import React, { useEffect, useState } from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { calculateYear } from "../../domain/calculations";
import { getIsoWeek, monthName, weekYear } from "../../domain/dates";
import {
  currentPeriodPatch,
  isAtCurrentPeriod,
  movePeriod,
  periodLabel,
  periodPatchForMode,
  periodRangeLabel,
  selectedIsoWeekYear,
} from "../../domain/periods";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { PeriodPopover } from "./PeriodPopover";
import { SyncStatus } from "./SyncStatus";
import {
  ChevronLeft, ChevronRight, Sun, Moon, Undo2, Redo2, Wallet,
  Clock, CalendarCheck
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

  /**
   * The wall clock, refreshed each minute.
   *
   * A period selector that can show any month needs to say, without ambiguity,
   * where "now" actually is — otherwise a view of March looks exactly like
   * today in March. Minute resolution rather than seconds: a ticking second
   * hand is a re-render per second for a number nobody is reading.
   */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const periodTitle = periodLabel(snapshot.settings);
  const atCurrentPeriod = isAtCurrentPeriod(snapshot.settings);
  const realPeriodTitle = periodLabel({ ...snapshot.settings, ...currentPeriodPatch(snapshot.settings) });
  const todayLabel = new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(now);
  const clockLabel = new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(now);
  const goToCurrentPeriod = () => updateSettings(currentPeriodPatch(snapshot.settings));

  const status = calculation.selectedMonthSpend.status;
  const statusTone = status === "nan" ? "danger" : status === "pending" ? "warning" : "success";

  return (
    <header className="top-header">
      <div>
        <div className="text-footnote" style={{ marginBottom: 4 }}>
          {atCurrentPeriod ? "Current period" : "Viewing"}
        </div>
        <h1 className="text-display" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>
          {periodTitle}
        </h1>
        <div className="text-caption" style={{ marginTop: 2 }}>{periodRangeLabel(snapshot.settings)}</div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <Badge tone={statusTone}>{status === "value" ? "Active" : status === "zero" ? "No Spend" : status === "pending" ? "Pending" : "Closed"}</Badge>
          {/* In month mode the stored ISO week often belongs to a different
              month, so showing it there is noise at best and wrong at worst.
              The date range above already states the period exactly. */}
          <span className="text-caption">
            {mode === "week" ? `ISO week ${snapshot.settings.selectedWeek} · ${activeYear}` : mode === "year" ? "Year overview" : "Monthly view"}
            {snapshot.settings.selectedSeason ? ` · ${snapshot.settings.selectedSeason}` : ""}
          </span>
          <SyncStatus />
        </div>

        {/* The real period is stated separately so a historical view can never
            be mistaken for today. */}
        {!atCurrentPeriod && (
          <div className="text-caption" style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ color: "var(--text-tertiary)" }}>
              Today is {todayLabel} · current {mode} is {realPeriodTitle}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={goToCurrentPeriod}>
              <CalendarCheck size={13} /> Go to current {mode}
            </button>
          </div>
        )}

        {latestAudit && (
          <div className="text-caption" style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={12} /> Last: {latestAudit.summary}
          </div>
        )}
      </div>

      <div className="header-actions">
        <PeriodPopover summary={periodTitle} historical={periodTitle !== realPeriodTitle}>
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

          {/* Where "now" is, stated inside the selector itself, and one button
              back to it. Without this, a view of a past month is visually
              identical to the same month lived through at the time. */}
          <div className="period-now">
            <span className="text-caption">
              {todayLabel} · {clockLabel}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={goToCurrentPeriod}
              disabled={atCurrentPeriod}
              title={atCurrentPeriod ? `Already on the current ${mode}` : undefined}
            >
              <CalendarCheck size={13} /> Go to current {mode}
            </button>
          </div>
        </div>
        </PeriodPopover>

        {/* There is no Save button. Every change is written locally and pushed
            on its own, and the sync badge above states which of those has
            happened. The button that used to sit here only stamped
            `lastUpdated` to force a write — so it implied that work was
            unsaved until pressed, which was never true, and it cost a full row
            on a phone. Sync can still be forced from the badge when it reports
            a problem, which is the only time forcing one means anything. */}
        <div className="header-buttons">
          <Button variant="ghost" icon onClick={() => updateSettings({ darkMode: !snapshot.settings.darkMode })} title="Toggle theme">
            {snapshot.settings.darkMode ? <Sun size={17} /> : <Moon size={17} />}
          </Button>
          <Button variant="ghost" icon onClick={undo} title="Undo (Ctrl+Z)">
            <Undo2 size={17} />
          </Button>
          <Button variant="ghost" icon onClick={redo} title="Redo (Ctrl+Y)">
            <Redo2 size={17} />
          </Button>
          <Button variant="primary" onClick={() => setRolloverOpen(true)} disabled={!isCurrentPeriodMutable()} title={isCurrentPeriodMutable() ? undefined : "Historical periods are read-only"}>
            <Wallet size={16} /> Close Month
          </Button>
        </div>
      </div>
    </header>
  );
};
