import React from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { formatDualMoney } from "../../utils/formatters";
import { Button } from "../ui/Button";

interface RolloverDialogProps {
  onClose: () => void;
  calculation: { year: number; month: number; rolloverDelta: number | null; selectedMonthSpend: { status: string } };
}

export const RolloverDialog: React.FC<RolloverDialogProps> = ({ onClose, calculation }) => {
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
        <h2 id="rollover-title" className="text-title">Close month</h2>
        {unavailable ? (
          <p className="text-caption">This period has no recorded total. To preserve missing historical data, automatic rollover is unavailable.</p>
        ) : (
          <p className="text-caption">
            The recorded month-end delta is <strong>{formatDualMoney(calculation.rolloverDelta, snapshot.settings, { showSign: true })}</strong>.
            Choose whether to add it to the wallet; closing a month does not alter its transactions.
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24, flexWrap: "wrap" }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {!unavailable && <Button variant="secondary" onClick={() => close(false)}>Close without rollover</Button>}
          {!unavailable && <Button variant="primary" onClick={() => close(true)}>Close and roll over</Button>}
        </div>
      </div>
    </div>
  );
};
