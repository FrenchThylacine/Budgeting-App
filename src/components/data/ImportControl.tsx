import React, { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { importJsonBackup, exportJson } from "../../domain/importExport";
import { WorkbookShapeError, importBudgetWorkbook } from "../../domain/workbookImport";
import { ImportPreviewDialog, type ImportPreview } from "../modals/ImportPreviewDialog";
import { useBudgetStore } from "../../store/budgetStore";

interface ImportControlProps {
  /** `full` gives the button a label and room to breathe; `compact` fits the sidebar. */
  variant?: "full" | "compact";
  className?: string;
}

/**
 * Open a workbook or a JSON backup, preview it, then replace the budget.
 *
 * Extracted so the same flow can sit in Settings — where anyone looking for it
 * would go first — and in the sidebar, without two copies of the parsing,
 * error handling and preview wiring drifting apart.
 */
export const ImportControl: React.FC<ImportControlProps> = ({ variant = "full", className = "" }) => {
  const snapshot = useBudgetStore((s) => s.snapshot);
  const importSnapshot = useBudgetStore((s) => s.importSnapshot);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Read the chosen file into a preview. Nothing is written here — the import
   * only happens if the user confirms in the dialog.
   */
  const handleFileChosen = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    // Cleared immediately so choosing the same file twice still fires a change
    // event, which is otherwise a confusing dead click.
    event.target.value = "";
    if (!file) return;

    setError(null);
    try {
      if (file.name.toLowerCase().endsWith(".json")) {
        const restored = await importJsonBackup(file);
        setPreview({
          fileName: file.name,
          snapshot: restored,
          summary: {
            years: Object.keys(restored.years).map(Number).sort((a, b) => a - b),
            activities: Object.values(restored.years).reduce((n, y) => n + y.activities.length, 0),
            wishlistItems: Object.values(restored.years).reduce((n, y) => n + y.wishlistItems.length, 0),
            spendingEntries: Object.values(restored.years).reduce((n, y) => n + y.spendingEntries.length, 0),
            walletEntries: Object.values(restored.years).reduce((n, y) => n + y.walletEntries.length, 0),
            spendingByCurrency: {},
          },
          warnings: [],
        });
        return;
      }

      const result = await importBudgetWorkbook(file);
      setPreview({ fileName: file.name, ...result });
    } catch (caught) {
      // A file that is not this workbook gets a message naming what was wrong,
      // rather than importing whatever it could find.
      setError(
        caught instanceof WorkbookShapeError || caught instanceof Error
          ? caught.message
          : "That file could not be read.",
      );
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        className={variant === "compact" ? "btn btn-secondary btn-sm" : "btn btn-secondary"}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={variant === "compact" ? 14 : 15} /> Import a file
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.json"
        onChange={(event) => void handleFileChosen(event)}
        hidden
      />

      {variant === "full" && (
        <p className="text-note" style={{ margin: "8px 0 0" }}>
          An Excel workbook with <strong>Budget</strong> and <strong>Spending</strong> sheets, or a JSON
          backup exported from this app. You will see exactly what changes before anything is written.
        </p>
      )}

      {error && (
        <p className="auth-banner auth-banner-error" role="alert" style={{ marginTop: 10 }}>
          <span>{error}</span>
        </p>
      )}

      {preview && (
        <ImportPreviewDialog
          preview={preview}
          current={snapshot}
          onBackup={() => exportJson(snapshot)}
          onCancel={() => setPreview(null)}
          onConfirm={() => {
            // Goes through importSnapshot, so the change lands on the undo
            // stack and can be reversed without re-selecting the file.
            importSnapshot(preview.snapshot, `Imported ${preview.fileName}.`);
            setPreview(null);
          }}
        />
      )}
    </div>
  );
};
