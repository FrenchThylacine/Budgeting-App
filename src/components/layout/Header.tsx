import React from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { calculateYear } from "../../domain/calculations";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { SyncStatus } from "./SyncStatus";
import { Sun, Moon, Undo2, Redo2, Wallet } from "lucide-react";
import { resolveAppearance, themeFor } from "../../domain/theme";
import { useTranslation } from "../../i18n/useTranslation";

type BudgetCalculation = ReturnType<typeof calculateYear>;

/**
 * The application's action strip.
 *
 * It used to be a block: an eyebrow reading "Current period", the period as an
 * `<h1>`, its date range, a status badge, "Monthly view · normal", the sync
 * badge, a line saying what you had just done, and four buttons. The period
 * selector sits directly beneath it and states the mode, the period, the date
 * range, today's date and the way back to the present — so **five of those
 * eight lines said something the next element said again**, and on a phone they
 * cost the whole first screen.
 *
 * What is left is what only this element can say: the two states worth
 * flagging, whether the work has reached the server, and the four actions that
 * belong to the application rather than to a panel.
 *
 * The state badges are shown *only when they are not the ordinary case*. A
 * current month is "pending" by definition and saying so every time trains
 * people to ignore the badge — which is exactly what makes the one that
 * matters, a closed period with no data in it, invisible.
 */
export const Header: React.FC<{
  calculation: BudgetCalculation;
  setRolloverOpen: (v: boolean) => void;
}> = ({ calculation, setRolloverOpen }) => {
  const { t } = useTranslation();
  const snapshot = useBudgetStore((s) => s.snapshot);
  const updateSettings = useBudgetStore((s) => s.updateSettings);
  const undo = useBudgetStore((s) => s.undo);
  const redo = useBudgetStore((s) => s.redo);
  const isCurrentPeriodMutable = useBudgetStore((s) => s.isCurrentPeriodMutable);

  const period = calculation.selectedMonthSpend;
  const mutable = isCurrentPeriodMutable();

  /*
   * The theme toggle writes both fields.
   *
   * `appearance` is what the application reads; `darkMode` is what every
   * snapshot written before it existed carries, and what an export and an older
   * client still read. Writing one and not the other would put the toggle and
   * the page in disagreement the moment either is read by the other.
   */
  const theme = themeFor(snapshot.settings.themePreset);
  const systemDark =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
  const dark = resolveAppearance(snapshot.settings.appearance, snapshot.settings.darkMode === true, systemDark, theme);

  return (
    <header className="top-header">
      <div className="header-state">
        {period.isClosed && <Badge tone="neutral">{t("header.closedPeriod")}</Badge>}
        {period.status === "nan" && <Badge tone="danger">{t("header.noRecords")}</Badge>}
        <SyncStatus />
      </div>

      {/* There is no Save button. Every change is written locally and pushed on
          its own, and the sync badge states which of those has happened. The
          button that used to sit here only stamped `lastUpdated` to force a
          write — so it implied that work was unsaved until pressed, which was
          never true, and it cost a full row on a phone. */}
      <div className="header-buttons">
        <Button
          variant="ghost"
          icon
          // A theme that is dark by design has nothing to toggle, and a control
          // that silently does nothing is worse than one that is not there.
          disabled={theme.darkOnly}
          onClick={() => updateSettings({ appearance: dark ? "light" : "dark", darkMode: !dark })}
          title={t("header.toggleTheme")}
          aria-label={t("header.toggleTheme")}
        >
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </Button>
        <Button variant="ghost" icon onClick={undo} title={t("header.undoCtrlZ")} aria-label={t("header.undoCtrlZ")}>
          <Undo2 size={17} />
        </Button>
        <Button variant="ghost" icon onClick={redo} title={t("header.redoCtrlY")} aria-label={t("header.redoCtrlY")}>
          <Redo2 size={17} />
        </Button>
        <Button
          variant="primary"
          onClick={() => setRolloverOpen(true)}
          disabled={!mutable}
          title={mutable ? undefined : t("common.readOnly")}
        >
          <Wallet size={16} /> {t("header.closeMonth")}
        </Button>
      </div>
    </header>
  );
};
