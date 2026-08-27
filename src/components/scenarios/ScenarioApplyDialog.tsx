import React, { useEffect, useMemo, useRef } from "react";
import { ArrowRight, X } from "lucide-react";
import { scenarioDiff } from "../../domain/scenarios";
import { formatMoney } from "../../domain/currency";
import type { BudgetSnapshot, ScenarioPreset } from "../../domain/types";

interface ScenarioApplyDialogProps {
  preset: ScenarioPreset;
  snapshot: BudgetSnapshot;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * What applying a scenario will change, before it changes.
 *
 * Applying one rewrites the monthly budget, every category cap the scenario
 * names, and which activities are running and who pays for them. That used to happen on a single click with
 * nothing shown, which meant the only way to find out what a scenario contained
 * was to apply it and compare — and the only way back was undo, if you noticed
 * in time.
 */
export const ScenarioApplyDialog: React.FC<ScenarioApplyDialogProps> = ({
  preset,
  snapshot,
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const changes = useMemo(() => scenarioDiff(snapshot, preset), [snapshot, preset]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
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
  }, [onCancel]);

  /**
   * One value, whatever kind it is.
   *
   * A scenario change is a number (a budget or a cap), a boolean (an activity
   * switched on or off) or a string (a funding classification). A formatter
   * that only knew about money is what made the piloting boolean read as a
   * currency amount before.
   */
  const format = (value: number | boolean | string | null): string => {
    if (value == null) return "not set";
    if (typeof value === "boolean") return value ? "enabled" : "disabled";
    if (typeof value === "string") return value;
    return formatMoney(value, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scenario-apply-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        style={{ width: "min(560px, 100%)", maxHeight: "min(84dvh, 820px)", overflowY: "auto" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h2 id="scenario-apply-title" className="text-title" style={{ margin: 0, minWidth: 0 }}>
            Apply “{preset.name}”?
          </h2>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onCancel} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        {changes.length === 0 ? (
          <p className="text-body">
            These settings are already in effect. Applying this scenario would change nothing.
          </p>
        ) : (
          <>
            <p className="text-note" style={{ margin: "0 0 14px" }}>
              {changes.length === 1 ? "One setting changes" : `${changes.length} settings change`}. Nothing
              you have recorded is touched — spending, activities and history stay exactly as they are.
            </p>

            <ul className="scenario-diff">
              {changes.map((change) => (
                <li
                  key={`${change.kind}-${change.categoryId ?? change.activityId ?? change.label}`}
                  className="scenario-diff-row"
                >
                  <span className="scenario-diff-label">
                    {change.categoryColor && (
                      <span
                        className="scenario-diff-dot"
                        style={{ background: change.categoryColor }}
                        aria-hidden="true"
                      />
                    )}
                    {change.label}
                  </span>
                  <span className="scenario-diff-values">
                    <span className="scenario-diff-before money">{format(change.before)}</span>
                    <ArrowRight size={13} aria-hidden="true" />
                    <span className="scenario-diff-after money">{format(change.after)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={changes.length === 0}>
            Apply scenario
          </button>
        </div>

        {changes.length > 0 && (
          <p className="text-note" style={{ margin: "12px 0 0" }}>
            This can be undone with Ctrl+Z.
          </p>
        )}
      </div>
    </div>
  );
};
