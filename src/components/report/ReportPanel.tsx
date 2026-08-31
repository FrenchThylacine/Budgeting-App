import React, { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, Printer } from "lucide-react";
import type { CustomRange, ReportScope } from "../../domain/report";
import { formatMoney } from "../../domain/currency";
import { fontStack } from "../../domain/fonts";
import { resolveThemePreset } from "../../domain/customTheme";
import { useBudgetStore } from "../../store/budgetStore";
import { useTranslation } from "../../i18n/useTranslation";
import { Button } from "../ui/Button";
import { Section } from "../ui/Section";

/**
 * The report, before it is printed
 * ================================
 *
 * The report used to be three buttons in the navigation, each of which opened
 * a new browser window containing a finished document. That is a strange thing
 * to ask of somebody: commit to a window, then find out whether the range was
 * the one you meant.
 *
 * ─── Why this shows the real document rather than a preview of it ────────────
 *
 * The obvious build is a React component that renders the report *model* with
 * the application's own components — responsive by construction, styled like
 * the rest of the interface. It is also two renderers for one document, and
 * they drift: somebody adds a column to the printed table and the preview goes
 * on showing the old one, which is worse than no preview because it is a
 * preview that lies.
 *
 * So this is the actual report, in an iframe, from the same `reportHtml` the
 * print and the download use. What you see is what comes out. The
 * responsiveness the brief asks for is therefore the *report's* own — its
 * stylesheet reflows on a narrow screen and keeps A4 for `@media print` — so a
 * phone gets a readable document rather than an A4 page scaled to nothing.
 *
 * ─── Why `srcDoc` and not a blob URL ─────────────────────────────────────────
 *
 * A blob URL is a same-origin document that has to be revoked, and forgetting
 * to revoke it leaks the whole report for the life of the tab. `srcDoc` is
 * inert, needs no cleanup, and re-renders when the budget changes.
 */

type ScopeChoice = "month" | "year" | "custom";

export const ReportPanel: React.FC = () => {
  const { t, language } = useTranslation();
  const snapshot = useBudgetStore((state) => state.snapshot);
  const [choice, setChoice] = useState<ScopeChoice>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const year = snapshot.settings.selectedYear;
  const month = snapshot.settings.selectedMonth;

  // Sensible bounds for a custom range: the selected month, which is the one
  // the reader is already looking at.
  useEffect(() => {
    if (from && to) return;
    const pad = (value: number) => String(value).padStart(2, "0");
    const last = new Date(year, month, 0).getDate();
    setFrom(`${year}-${pad(month)}-01`);
    setTo(`${year}-${pad(month)}-${pad(last)}`);
  }, [year, month, from, to]);

  const scope: ReportScope | null = useMemo(() => {
    if (choice === "month") return "month";
    if (choice === "year") return "year";
    if (!from || !to || from > to) return null;
    return { from, to } satisfies CustomRange;
  }, [choice, from, to]);

  /*
   * Rebuilt whenever the budget, the language or the range changes.
   *
   * The report module is fifteen kilobytes that nothing needs until somebody
   * asks for a report, so it stays a dynamic import — which is why this is an
   * effect with a cancellation flag rather than a `useMemo`.
   */
  useEffect(() => {
    if (!scope) {
      setHtml(null);
      return;
    }
    let cancelled = false;
    setFailed(false);
    void (async () => {
      try {
        const { buildPeriodReport, reportHtml } = await import("../../domain/report");
        const report = buildPeriodReport(snapshot, scope, new Date(), t);
        const document = reportHtml(
          report,
          (value) => formatMoney(value, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode),
          t,
          {
            screen: true,
            statusColours: snapshot.settings.statusColours,
            fontStack: fontStack(snapshot.settings.fontChoice),
            // The reader's accent follows onto paper; the paper stays white.
            themeAccent: resolveThemePreset(snapshot.settings.themePreset, snapshot.settings.customTheme).light["--accent"],
          },
        );
        if (!cancelled) setHtml(document);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshot, scope, t, language]);

  const frameRef = React.useRef<HTMLIFrameElement>(null);

  const print = () => {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };

  const openInTab = () => {
    if (!html) return;
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  const download = () => {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `budget-os-${choice === "custom" ? `${from}_${to}` : `${year}${choice === "month" ? `-${String(month).padStart(2, "0")}` : ""}`}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-enter report-page">
      <Section
        title={t("nav.report")}
        action={
          <div className="report-actions">
            <Button variant="secondary" size="sm" onClick={openInTab} disabled={!html}>
              <ExternalLink size={14} /> {t("report.openInTab")}
            </Button>
            <Button variant="secondary" size="sm" onClick={download} disabled={!html}>
              <Download size={14} /> {t("report.download")}
            </Button>
            <Button variant="primary" size="sm" onClick={print} disabled={!html}>
              <Printer size={14} /> {t("report.print")}
            </Button>
          </div>
        }
      >
        {/* One control, three answers. The range fields appear only for the
            answer that needs them. */}
        <div className="report-scope" role="radiogroup" aria-label={t("report.period")}>
          {(["month", "year", "custom"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={choice === option}
              className={`report-scope-option${choice === option ? " is-active" : ""}`}
              onClick={() => setChoice(option)}
            >
              {t(`report.scope.${option}`)}
            </button>
          ))}
        </div>

        {choice === "custom" && (
          <div className="report-range">
            <label>
              <span className="text-footnote">{t("report.from")}</span>
              <input className="input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label>
              <span className="text-footnote">{t("report.to")}</span>
              <input className="input" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
          </div>
        )}

        <div className="report-preview">
          {failed ? (
            <p className="text-note">{t("report.failed")}</p>
          ) : html ? (
            <iframe
              ref={frameRef}
              className="report-frame"
              title={t("report.previewTitle")}
              srcDoc={html}
              /* No scripts: this document is generated from the reader's own
                 data and never needs to run anything. */
              sandbox="allow-same-origin allow-modals"
            />
          ) : (
            <p className="text-note">{t("report.chooseARange")}</p>
          )}
        </div>
      </Section>
    </div>
  );
};
