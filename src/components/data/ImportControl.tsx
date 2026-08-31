import React, { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { importJsonBackup, exportJson } from "../../domain/importExport";
/*
 * Type-only here, and fetched when a file is actually chosen. The workbook
 * parser is dead weight on every visit that never imports one — which, after
 * the first, is all of them.
 */

import { ImportPreviewDialog, type ImportPreview } from "../modals/ImportPreviewDialog";
import { useBudgetStore } from "../../store/budgetStore";
import { useTranslation } from "../../i18n/useTranslation";
import { storedText } from "../../domain/storedText";

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
  const { t } = useTranslation();
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

      const { importBudgetWorkbook } = await import("../../domain/workbookImport");
      const result = await importBudgetWorkbook(file);
      setPreview({ fileName: file.name, ...result });
    } catch (caught) {
      // A file that is not this workbook gets a message naming what was wrong,
      // rather than importing whatever it could find. `WorkbookShapeError`
      // extends `Error`, so the narrower check the class import used to allow
      // adds nothing now that the module is loaded on demand.
      /*
       * A `WorkbookShapeError` carries a key and its values, so the reason the
       * file was rejected is said in the reader's language. Anything else is
       * an unexpected failure whose `message` is diagnosis rather than prose,
       * and the generic sentence is the honest thing to show.
       */
      const { WorkbookShapeError } = await import("../../domain/workbookImport");
      setError(
        caught instanceof WorkbookShapeError
          ? t(caught.key, caught.params)
          : t("import.unreadable"),
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
        <Upload size={variant === "compact" ? 14 : 15} /> {t("import.importAFile")}
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
          {t("import.anExcelWorkbookWith")} <strong>{t("settings.budget")}</strong> {t("import.and")} <strong>{t("nav.spending")}</strong> {t("import.sheetsOrAJsonBackup")}
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
            importSnapshot(preview.snapshot, storedText("audit.importedFile", { file: preview.fileName }));
            setPreview(null);
          }}
        />
      )}
    </div>
  );
};
