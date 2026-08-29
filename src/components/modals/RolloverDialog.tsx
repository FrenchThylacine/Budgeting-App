import React from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { formatDualMoney } from "../../utils/formatters";
import { Button } from "../ui/Button";
import { useTranslation } from "../../i18n/useTranslation";

interface RolloverDialogProps {
  onClose: () => void;
  calculation: { year: number; month: number; rolloverDelta: number | null; selectedMonthSpend: { status: string } };
}

export const RolloverDialog: React.FC<RolloverDialogProps> = ({ onClose, calculation }) => {
  const { t } = useTranslation();
  const snapshot = useBudgetStore((s) => s.snapshot);
  const closeMonth = useBudgetStore((s) => s.closeMonth);
  const unavailable = calculation.rolloverDelta === null;

  const close = (applyRollover: boolean) => {
    if (unavailable) return;
    closeMonth(calculation.year, calculation.month, applyRollover);
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rollover-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="rollover-title" className="text-title">{t("rollover.closeMonth")}</h2>
        {unavailable ? (
          <p className="text-caption">{t("rollover.thisPeriodHasNoRecorded")}</p>
        ) : (
          // One sentence with the figure in it, rather than two fragments a
          // translation cannot reorder.
          <p className="text-caption">
            {t("rollover.delta", {
              amount: formatDualMoney(calculation.rolloverDelta, snapshot.settings, { showSign: true }),
            })}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24, flexWrap: "wrap" }}>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          {!unavailable && <Button variant="secondary" onClick={() => close(false)}>{t("rollover.closeWithoutRollover")}</Button>}
          {!unavailable && <Button variant="primary" onClick={() => close(true)}>{t("rollover.closeAndRollOver")}</Button>}
        </div>
      </div>
    </div>
  );
};
