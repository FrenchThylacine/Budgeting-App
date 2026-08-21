import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, X } from "lucide-react";
import type { BudgetSnapshot } from "../../domain/types";
import type { WorkbookImportSummary } from "../../domain/workbookImport";

export interface ImportPreview {
  fileName: string;
  snapshot: BudgetSnapshot;
  summary: WorkbookImportSummary;
  warnings: string[];
}

interface ImportPreviewDialogProps {
  preview: ImportPreview;
  /** The budget currently loaded, so the dialog can say what is being replaced. */
  current: BudgetSnapshot;
  onConfirm: () => void;
  onCancel: () => void;
  onBackup: () => void;
}

interface Change {
  label: string;
  before: number;
  after: number;
}

/**
 * Consent gate for an import.
 *
 * An import replaces the whole budget: the server's save performs a targeted
 * delete of anything absent from the incoming snapshot, so a year or a category
 * that is not in the file is removed rather than merged. That is a much larger
 * consequence than "open a file" suggests, and it was previously wired to
 * nothing at all — the importer existed but no control ever called it.
 *
 * The dialog therefore shows what will be gained and, more importantly, what
 * will be lost, before anything is written.
 */
export const ImportPreviewDialog: React.FC<ImportPreviewDialogProps> = ({
  preview,
  current,
  onConfirm,
  onCancel,
  onBackup,
}) => {
  const [acknowledged, setAcknowledged] = useState(false);
  const [backedUp, setBackedUp] = useState(false);
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

  const changes = useMemo<Change[]>(() => {
    const count = (snapshot: BudgetSnapshot, pick: (year: BudgetSnapshot["years"][string]) => number): number =>
      Object.values(snapshot.years).reduce((total, year) => total + pick(year), 0);

    return [
      { label: "Years", before: Object.keys(current.years).length, after: Object.keys(preview.snapshot.years).length },
      { label: "Categories", before: current.categories.length, after: preview.snapshot.categories.length },
      { label: "Activities", before: count(current, (y) => y.activities.length), after: count(preview.snapshot, (y) => y.activities.length) },
      { label: "Transactions", before: count(current, (y) => y.spendingEntries.length), after: count(preview.snapshot, (y) => y.spendingEntries.length) },
      { label: "Wishlist items", before: count(current, (y) => y.wishlistItems.length), after: count(preview.snapshot, (y) => y.wishlistItems.length) },
      { label: "Wallet entries", before: count(current, (y) => y.walletEntries.length), after: count(preview.snapshot, (y) => y.walletEntries.length) },
    ];
  }, [current, preview.snapshot]);

  // Years present today that the file does not mention are the real loss: the
  // save deletes them outright.
  const droppedYears = useMemo(
    () => Object.keys(current.years).filter((year) => !(year in preview.snapshot.years)).sort(),
    [current.years, preview.snapshot.years],
  );

  const approvals = current.budgetApprovals.length;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        ref={dialogRef}
        className="modal modal-danger"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="import-preview-title"
        aria-describedby="import-preview-description"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        style={{ width: "min(640px, 100%)", maxHeight: "min(86dvh, 900px)", overflowY: "auto" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <span className="modal-icon-warning" aria-hidden="true">
              <FileSpreadsheet size={20} />
            </span>
            <h2 id="import-preview-title" className="text-title" style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>
              Replace your budget with {preview.fileName}?
            </h2>
          </div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onCancel} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <div id="import-preview-description">
          <p className="text-body" style={{ marginBottom: 14 }}>
            This <strong>replaces</strong> your budget rather than merging into it. Anything not present in
            the file is removed.
          </p>

          <div className="import-table-wrap">
            <table className="import-table">
              <caption className="sr-only">What the import changes</caption>
              <thead>
                <tr>
                  <th scope="col">&nbsp;</th>
                  <th scope="col">Now</th>
                  <th scope="col">After</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((change) => {
                  const delta = change.after - change.before;
                  return (
                    <tr key={change.label}>
                      <th scope="row">{change.label}</th>
                      <td className="tabular">{change.before}</td>
                      <td className="tabular">
                        {change.after}
                        {delta !== 0 && (
                          <span className={delta > 0 ? "import-delta-up" : "import-delta-down"}>
                            {delta > 0 ? ` +${delta}` : ` ${delta}`}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-footnote" style={{ marginTop: 10 }}>
            Years in the file: <strong>{preview.summary.years.join(", ") || "none"}</strong>
          </p>

          {droppedYears.length > 0 && (
            <p className="auth-banner auth-banner-error" role="alert" style={{ marginTop: 12 }}>
              <AlertTriangle size={16} aria-hidden="true" />
              <span>
                {droppedYears.length === 1 ? "Year" : "Years"} <strong>{droppedYears.join(", ")}</strong>{" "}
                {droppedYears.length === 1 ? "is" : "are"} not in this file and will be deleted, along with
                every transaction in {droppedYears.length === 1 ? "it" : "them"}.
              </span>
            </p>
          )}

          {approvals > 0 && (
            <p className="text-note" style={{ marginTop: 10 }}>
              {approvals} approved {approvals === 1 ? "budget" : "budgets"} will be cleared. An approval
              records a decision you made, and a spreadsheet contains none to replace it with.
            </p>
          )}

          {preview.warnings.length > 0 && (
            <>
              <h3 className="text-callout" style={{ margin: "16px 0 6px" }}>Notes from the file</h3>
              <ul className="modal-consequences">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </>
          )}

          <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                onBackup();
                setBackedUp(true);
              }}
            >
              <Download size={15} /> {backedUp ? "Backup downloaded" : "Download a backup first"}
            </button>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span className="text-callout">
                I understand my current budget will be replaced by this file.
              </span>
            </label>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={!acknowledged}>
            Replace my budget
          </button>
        </div>
      </div>
    </div>
  );
};
