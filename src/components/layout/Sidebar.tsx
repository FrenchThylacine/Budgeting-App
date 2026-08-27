import React, { useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { useBudgetStore } from "../../store/budgetStore";
import {
  LayoutDashboard, ListTodo, Receipt, Gift, Wallet, BarChart3,
  FlaskConical, History, Settings, Tags, ChevronLeft, ChevronRight,
  FileSpreadsheet, Download, FileJson, RefreshCw, FileText,
  LogOut, UserRound, Upload, CalendarRange, Coins
} from "lucide-react";
import { exportCurrentYearToExcel, exportAllYearsToExcel, exportJson } from "../../domain/importExport";
import { FinMark } from "../ui/FinMark";
import { ImportControl } from "../data/ImportControl";
import { buildPeriodReport, reportHtml, type CustomRange, type ReportScope } from "../../domain/report";
import { EditorSheet } from "../ui/EditorSheet";
import { Button } from "../ui/Button";
import { Field, FieldGroup } from "../ui/Field";
import { todayDateInput } from "../../domain/dates";
import { formatMoney } from "../../domain/currency";
import type { BudgetSnapshot } from "../../domain/types";
import { useTranslation } from "../../i18n/useTranslation";

/**
 * Render the report into a new window and let the browser produce the PDF.
 *
 * Using the print pipeline keeps the report pixel-accurate and printable
 * without adding a PDF library to the bundle. The document is written from a
 * self-contained HTML string, so it also works with no network.
 */
function openPeriodReport(snapshot: BudgetSnapshot, scope: ReportScope): void {
  const report = buildPeriodReport(snapshot, scope);
  const html = reportHtml(report, (value) =>
    formatMoney(value, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode),
  );

  const win = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
  if (!win) {
    // Pop-up blocked: fall back to a download so the report is never lost.
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${report.title.replace(/\s+/g, "-").toLowerCase()}-report.html`;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  win.document.write(html);
  win.document.close();
}

type TabKey =
  | "dashboard"
  | "activities"
  | "spending"
  | "wishlist"
  | "wallet"
  | "analytics"
  | "scenarios"
  | "history"
  | "settings"
  | "categories"
  | "currencies";

/**
 * Navigation carries translation *keys*, not words.
 *
 * The label is resolved at render time from the active language, which is the
 * whole point of the i18n layer: a component that stores "Dashboard" cannot be
 * translated without editing the component.
 */
const navItems: { key: TabKey; labelKey: string; icon: React.ElementType }[] = [
  { key: "dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { key: "activities", labelKey: "nav.activities", icon: ListTodo },
  { key: "spending", labelKey: "nav.spending", icon: Receipt },
  { key: "wishlist", labelKey: "nav.wishlist", icon: Gift },
  { key: "wallet", labelKey: "nav.wallet", icon: Wallet },
  { key: "analytics", labelKey: "nav.analytics", icon: BarChart3 },
  { key: "scenarios", labelKey: "nav.scenarios", icon: FlaskConical },
  { key: "history", labelKey: "nav.history", icon: History },
  { key: "categories", labelKey: "nav.categories", icon: Tags },
  { key: "currencies", labelKey: "nav.currencies", icon: Coins },
  { key: "settings", labelKey: "nav.settings", icon: Settings },
];

export const Sidebar: React.FC<{
  activeTab: TabKey;
  setActiveTab: (t: TabKey) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}> = ({ activeTab, setActiveTab, collapsed, setCollapsed }) => {
  const { t } = useTranslation();
  const snapshot = useBudgetStore((s) => s.snapshot);
  const resetToSeed = useBudgetStore((s) => s.resetToSeed);
  const importSnapshot = useBudgetStore((s) => s.importSnapshot);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [rangeOpen, setRangeOpen] = useState(false);

  const overviewItems = navItems.slice(0, 6);
  const systemItems = navItems.slice(6);

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      {/* The mark *is* the control.

          There were two things here: a decorative logo tile and, beside it, a
          small chevron button that collapsed the sidebar. The logo is the
          largest, most obvious target in the panel and it did nothing; the
          control that did something was a 28px chevron at the far edge. They
          are now one button — the whole brand block — with the chevron kept as
          the affordance that says what pressing it will do. Collapsed, the
          mark is all that remains, and it is still the way back.

          The sidebar does not exist below 768px, where the bottom navigation
          takes over, so this is a desktop control by construction rather than
          by a media query that could drift. */}
      <button
        type="button"
        className="nav-brand"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
        title={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
      >
        <span className="brand-icon">
          <FinMark size={30} />
        </span>
        {!collapsed && (
          <span className="brand-text">
            <strong>Budget OS</strong>
            <span>Personal Finance</span>
          </span>
        )}
        <span className="brand-chevron" aria-hidden="true">
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </span>
      </button>

      <nav className="nav-section">
        {!collapsed && <div className="nav-section-title">{t("nav.overview")}</div>}
        {overviewItems.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${activeTab === item.key ? "active" : ""}`}
            onClick={() => setActiveTab(item.key)}
            title={collapsed ? t(item.labelKey) : undefined}
            aria-current={activeTab === item.key ? "page" : undefined}
          >
            <item.icon size={18} className="nav-icon" />
            {!collapsed && t(item.labelKey)}
          </button>
        ))}
      </nav>

      <nav className="nav-section">
        {!collapsed && <div className="nav-section-title">{t("nav.system")}</div>}
        {systemItems.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${activeTab === item.key ? "active" : ""}`}
            onClick={() => setActiveTab(item.key)}
            title={collapsed ? t(item.labelKey) : undefined}
            aria-current={activeTab === item.key ? "page" : undefined}
          >
            <item.icon size={18} className="nav-icon" />
            {!collapsed && t(item.labelKey)}
          </button>
        ))}
      </nav>

      {rangeOpen && (
        <CustomRangeReport
          snapshot={snapshot}
          onClose={() => setRangeOpen(false)}
          onGenerate={(range) => {
            openPeriodReport(snapshot, range);
            setRangeOpen(false);
          }}
        />
      )}

      {!collapsed && (
        <div className="nav-section" style={{ marginTop: "auto" }}>
          <div className="nav-section-title">{t("nav.reports")}</div>
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => openPeriodReport(snapshot, "month")}>
              <FileText size={14} /> {t("reports.monthly")}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => openPeriodReport(snapshot, "year")}>
              <FileText size={14} /> {t("reports.annual")}
            </button>
            {/* Any window, not only the ones the period selector offers: a
                quarter, a trip, the six weeks a renovation took. */}
            <button className="btn btn-secondary btn-sm" onClick={() => setRangeOpen(true)}>
              <CalendarRange size={14} /> {t("reports.custom")}
            </button>
          </div>

          <div className="nav-section-title">{t("nav.data")}</div>
          <div style={{ display: "grid", gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => exportCurrentYearToExcel(snapshot)}>
              <FileSpreadsheet size={14} /> Export Year
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportAllYearsToExcel(snapshot)}>
              <Download size={14} /> Export All
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportJson(snapshot)}>
              <FileJson size={14} /> Backup JSON
            </button>
            <ImportControl variant="compact" />
            <button
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (window.confirm("Reset all data to seed budget? This cannot be undone.")) void resetToSeed();
              }}
            >
              <RefreshCw size={14} /> Reset
            </button>
          </div>

          <div className="nav-section-title" style={{ marginTop: 16 }}>{t("nav.account")}</div>
          <div style={{ display: "grid", gap: 8 }}>
            {/* The address is shown, not just "signed in": on a shared device
                it is the only way to tell whose budget is on screen. */}
            <div className="auth-account text-footnote" title={user?.email ?? ""}>
              <UserRound size={14} aria-hidden="true" />
              <span className="auth-account-email">{user?.email ?? "Signed in"}</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => void signOut()}>
              <LogOut size={14} /> {t("nav.signOut")}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};


/**
 * Choose the window a report covers.
 *
 * Presets first, because "this quarter" and "the last 90 days" are what people
 * actually ask for, and typing two dates to express them is friction for no
 * gain. The two date fields remain, for the windows no preset can name.
 */
const CustomRangeReport: React.FC<{
  snapshot: BudgetSnapshot;
  onClose: () => void;
  onGenerate: (range: CustomRange) => void;
}> = ({ snapshot, onClose, onGenerate }) => {
  const today = todayDateInput();
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 3);
    return date.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(today);

  const daysBack = (days: number): string => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1));
    return date.toISOString().slice(0, 10);
  };

  const presets: { label: string; apply: () => void }[] = [
    { label: "Last 30 days", apply: () => { setFrom(daysBack(30)); setTo(today); } },
    { label: "Last 90 days", apply: () => { setFrom(daysBack(90)); setTo(today); } },
    {
      label: "This quarter",
      apply: () => {
        const now = new Date();
        const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        setFrom(quarterStart.toISOString().slice(0, 10));
        setTo(today);
      },
    },
    {
      label: "Year to date",
      apply: () => {
        setFrom(`${new Date().getFullYear()}-01-01`);
        setTo(today);
      },
    },
  ];

  // An inverted range is not a range. Refusing beats silently swapping the
  // dates, which would produce a report for a window nobody asked for.
  const valid = from !== "" && to !== "" && from <= to;
  const entryCount = valid
    ? Object.values(snapshot.years)
        .flatMap((record) => record.spendingEntries)
        .filter((entry) => entry.date >= from && entry.date <= to).length
    : 0;

  return (
    <EditorSheet
      title="Report for a custom range"
      subtitle="Any window you like. Opens in a new tab, ready to print or save as a PDF."
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" form="range-report-form" disabled={!valid}>
            <FileText size={14} /> Generate report
          </Button>
        </>
      }
    >
      <form
        id="range-report-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onGenerate({ from, to });
        }}
        style={{ display: "grid", gap: 20 }}
      >
        <FieldGroup title="Quick ranges">
          <Field label="Common windows" span group>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {presets.map((preset) => (
                <button key={preset.label} type="button" className="chip" onClick={preset.apply}>
                  {preset.label}
                </button>
              ))}
            </div>
          </Field>
        </FieldGroup>

        <FieldGroup title="Dates">
          <Field label="From">
            <input className="input" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input className="input" type="date" required value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field
            label="What this covers"
            span
            group
            hint={
              valid
                ? "Your budget is set per month, so a range has no budget figure to measure against — the report says so rather than prorating one."
                : undefined
            }
          >
            <p className="text-callout" style={{ margin: 0 }}>
              {!valid
                ? "The end date must not be before the start date."
                : entryCount === 0
                  ? "No transactions fall in this range. The report will say so rather than showing zeroes."
                  : `${entryCount} transaction${entryCount === 1 ? "" : "s"}.`}
            </p>
          </Field>
        </FieldGroup>
      </form>
    </EditorSheet>
  );
};
