import React from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { calculateYear } from "../../domain/calculations";
import {
  isAtCurrentPeriod,
  periodLabel,
  periodRangeLabel,
  selectedIsoWeekYear,
} from "../../domain/periods";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { SyncStatus } from "./SyncStatus";
import { Sun, Moon, Undo2, Redo2, Wallet, Clock } from "lucide-react";
type BudgetCalculation = ReturnType<typeof calculateYear>;

export const Header: React.FC<{
  calculation: BudgetCalculation;
  setRolloverOpen: (v: boolean) => void;
}> = ({ calculation, setRolloverOpen }) => {
  const snapshot = useBudgetStore((s) => s.snapshot);
  const updateSettings = useBudgetStore((s) => s.updateSettings);
  const undo = useBudgetStore((s) => s.undo);
  const redo = useBudgetStore((s) => s.redo);
  const isCurrentPeriodMutable = useBudgetStore((s) => s.isCurrentPeriodMutable);

  const currentYear = snapshot.settings.selectedYear;
  const mode = snapshot.settings.selectedPeriodMode;
  const activeYear = mode === "week" ? selectedIsoWeekYear(snapshot.settings) : currentYear;

  const latestAudit = snapshot.auditLog[0];

  const periodTitle = periodLabel(snapshot.settings);
  const atCurrentPeriod = isAtCurrentPeriod(snapshot.settings);

  const status = calculation.selectedMonthSpend.status;
  const statusTone = status === "nan" ? "danger" : status === "pending" ? "warning" : "success";

  return (
    <header className="top-header">
      <div className="header-identity">
        <div className="text-footnote header-eyebrow" style={{ marginBottom: 4 }}>
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

        {/* Today's date, the real current period and the way back to it all
            live in the period selector directly below this heading now. They
            were stated here as well, which meant a historical view carried the
            same sentence twice and a phone spent two rows saying it. The
            eyebrow above still distinguishes "Viewing" from "Current period",
            which is the part the heading itself cannot say. */}

        {/* Reference rather than answer, so it is the first thing a phone
            drops: on a 390px screen it was one more line between the user and
            the figures they opened the app for, and it says nothing they did
            not just do themselves. */}
        {latestAudit && (
          <div className="text-caption header-audit">
            <Clock size={12} /> Last: {latestAudit.summary}
          </div>
        )}
      </div>

      <div className="header-actions">
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
