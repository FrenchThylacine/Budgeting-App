import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "../ui/Button";
import { useTranslation } from "../../i18n/useTranslation";

interface HistoricalEditDialogProps {
  periodLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Consent gate for editing a closed period.
 *
 * Editing history is legitimate — a receipt found late, a miscategorised
 * expense — but it changes figures the user may already have acted on. The
 * dialog therefore states the consequences plainly and requires a deliberate
 * acknowledgement rather than a single reflexive click.
 */
export const HistoricalEditDialog: React.FC<HistoricalEditDialogProps> = ({
  periodLabel,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      // Keep focus inside the dialog while it is open.
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
  }, [onCancel]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        ref={dialogRef}
        className="modal modal-danger"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="historical-edit-title"
        aria-describedby="historical-edit-description"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        style={{ width: "min(520px, 100%)" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <span className="modal-icon-warning" aria-hidden="true">
              <AlertTriangle size={20} />
            </span>
            <h2 id="historical-edit-title" className="text-title" style={{ margin: 0 }}>
              {t("historical.editAClosedPeriod")}
            </h2>
          </div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onCancel} aria-label={t("override.closeDialog")}>
            <X size={18} />
          </button>
        </div>

        <div id="historical-edit-description">
          <p className="text-body" style={{ marginBottom: 14 }}>
            {t("historical.youAreAboutToUnlock")} <strong>{periodLabel}</strong> {t("historical.forEditingThisPeriodIs")}
          </p>

          <ul className="modal-consequences">
            <li>{t("historical.totalsAnalyticsAndPeriodComparisons")}</li>
            <li>{t("historical.aRolloverAlreadyCarriedInto")}</li>
            <li>{t("historical.approvedBudgetsStayLockedAn")}</li>
            <li>{t("historical.everyChangeIsWrittenTo")}</li>
          </ul>

          <p className="text-caption" style={{ marginTop: 14 }}>
            {t("historical.thePeriodRelocksAutomaticallyAs")}
          </p>

          <label
            className="text-callout"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              marginTop: 16,
              padding: "12px 14px",
              background: "var(--danger-soft)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>{t("historical.iUnderstandThisRewritesA")}</span>
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
          <Button variant="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={!acknowledged}>
            {t("historical.unlockEditing")}
          </Button>
        </div>
      </div>
    </div>
  );
};
