import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useBudgetStore } from "../../store/budgetStore";
import { formatDualMoney } from "../../utils/formatters";
import { Button } from "../ui/Button";
import { useTranslation } from "../../i18n/useTranslation";
import type { TabKey } from "../../domain/tabs";

interface RolloverDialogProps {
  onClose: () => void;
  calculation: { year: number; month: number; rolloverDelta: number | null; selectedMonthSpend: { status: string } };
  /** Phase 5.14's "obvious next action": a press straight to the wallet. */
  onNavigate?: (tab: TabKey) => void;
}

/**
 * Phase 5.14 — the close is a decision, not just an action
 * ==========================================================
 *
 * Phase 5.2 confirmed the mechanics: an approved month's over/underspend is
 * *meant* to land on Personal Balance, never on Remaining Budget — that
 * figure is a separate, continuous wallet ledger a month-close never
 * touches. What was missing was never the arithmetic, it was every one of
 * the things the brief asks a close to say: which period, where the money
 * goes, that Remaining Budget and every transaction are untouched, and what
 * to do next.
 *
 * So this is two screens in one dialog rather than a confirm-and-vanish:
 * the question, then — once it is answered — a receipt. Closing a month is
 * the one action in this app that quietly moves money between two balances
 * a user is otherwise taught are independent; it is exactly the moment that
 * deserves to say so out loud.
 */
export const RolloverDialog: React.FC<RolloverDialogProps> = ({ onClose, calculation, onNavigate }) => {
  const { t } = useTranslation();
  const snapshot = useBudgetStore((s) => s.snapshot);
  const closeMonth = useBudgetStore((s) => s.closeMonth);
  const unavailable = calculation.rolloverDelta === null;
  const [outcome, setOutcome] = useState<{ applied: boolean } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  /*
   * Phase 5.17.C: every other dialog in this app (`EditorSheet`,
   * `OccurrenceOverrideDialog`, `ScenarioApplyDialog`) already traps focus
   * and closes on Escape; this one, added in Phase 5.14, was the one
   * exception — found by checking this dialog specifically against that
   * established pattern, not by a codebase-wide sweep.
   */
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
    // Deliberately empty: open/close set-up, not per-render work — the same
    // reasoning `EditorSheet` documents for its own identical effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = (applyRollover: boolean) => {
    if (unavailable) return;
    closeMonth(calculation.year, calculation.month, applyRollover);
    setOutcome({ applied: applyRollover });
  };

  const goToWallet = () => {
    onNavigate?.("wallet");
    onClose();
  };

  const delta = calculation.rolloverDelta;
  const amount = delta != null ? formatDualMoney(delta, snapshot.settings, { showSign: true }) : "";

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rollover-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {outcome ? (
          <>
            <h2 id="rollover-title" className="text-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircle2 size={20} style={{ color: "var(--success)" }} aria-hidden="true" />
              {t("rollover.monthClosedTitle", { month: calculation.month, year: calculation.year })}
            </h2>
            <p className="text-caption">
              {outcome.applied
                ? t("rollover.doneWithRollover", { amount })
                : t("rollover.doneWithoutRollover", { amount })}
            </p>
            <p className="text-caption" style={{ marginTop: 8 }}>{t("rollover.doneReassurance")}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24, flexWrap: "wrap" }}>
              <Button variant="ghost" onClick={onClose}>{t("common.close")}</Button>
              <Button variant="primary" onClick={goToWallet}>{t("rollover.seeWallet")}</Button>
            </div>
          </>
        ) : (
          <>
            <h2 id="rollover-title" className="text-title">
              {t("rollover.closeMonthFor", { month: calculation.month, year: calculation.year })}
            </h2>
            {unavailable ? (
              <p className="text-caption">{t("rollover.thisPeriodHasNoRecorded")}</p>
            ) : (
              // One sentence with the figure in it, rather than two fragments a
              // translation cannot reorder — and it names the destination
              // (Personal Balance) and what stays untouched either way
              // (Remaining Budget, every transaction), per Phase 5.2's
              // confirmed policy, rather than leaving both to be inferred.
              <>
                <p className="text-caption">{t("rollover.delta", { amount })}</p>
                <p className="text-caption" style={{ marginTop: 8 }}>{t("rollover.deltaDestination")}</p>
              </>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24, flexWrap: "wrap" }}>
              <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
              {!unavailable && <Button variant="secondary" onClick={() => close(false)}>{t("rollover.closeWithoutRollover")}</Button>}
              {!unavailable && <Button variant="primary" onClick={() => close(true)}>{t("rollover.closeAndRollOver")}</Button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
