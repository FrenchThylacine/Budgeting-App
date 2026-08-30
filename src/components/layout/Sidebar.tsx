import React, { useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { useBudgetStore } from "../../store/budgetStore";
import {
  LayoutDashboard, ListTodo, Receipt, Gift, Wallet, BarChart3,
  FlaskConical, History, Settings, Tags, ChevronLeft, ChevronRight,
  FileSpreadsheet, Download, FileJson, RefreshCw, FileText,
  LogOut, UserRound, Upload, CalendarRange, Coins, ChevronDown
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { exportCurrentYearToExcel, exportAllYearsToExcel, exportJson } from "../../domain/importExport";
import { AppMark } from "../ui/AppMark";
import { ImportControl } from "../data/ImportControl";
import type { CustomRange, ReportScope } from "../../domain/report";
import { EditorSheet } from "../ui/EditorSheet";
import { Button } from "../ui/Button";
import { Field, FieldGroup } from "../ui/Field";
import { todayDateInput } from "../../domain/dates";
import { formatMoney } from "../../domain/currency";
import type { BudgetSnapshot } from "../../domain/types";
import type { Translator } from "../../domain/i18n";
import { useTranslation } from "../../i18n/useTranslation";

/**
 * Render the report into a new window and let the browser produce the PDF.
 *
 * Using the print pipeline keeps the report pixel-accurate and printable
 * without adding a PDF library to the bundle. The document is written from a
 * self-contained HTML string, so it also works with no network.
 */
async function openPeriodReport(snapshot: BudgetSnapshot, scope: ReportScope, t: Translator): Promise<void> {
  /*
   * Loaded on demand.
   *
   * The report model and its print stylesheet are about fifteen kilobytes that
   * nothing needs until somebody presses a report button — and the first paint
   * was carrying them for every visit that never generates one.
   */
  const { buildPeriodReport, reportHtml } = await import("../../domain/report");

  // The reader's own language, all the way through: the model resolves its
  // labels and formats its dates against it, and the document declares it.
  const report = buildPeriodReport(snapshot, scope, new Date(), t);
  const html = reportHtml(
    report,
    (value) => formatMoney(value, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode),
    t,
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

/**
 * A collapsed group of actions in the navigation.
 *
 * Deliberately not the page-level `Disclosure`: that one is a section heading
 * with a summary and a `text-title`, sized for a panel. This is a navigation
 * row that happens to open.
 */
const NavGroup: React.FC<{ title: string; icon: LucideIcon; children: React.ReactNode }> = ({
  title,
  icon: Icon,
  children,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={`nav-group${open ? " is-open" : ""}`}>
      <button type="button" className="nav-group-trigger" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon size={16} />
        <span>{title}</span>
        <ChevronDown size={15} aria-hidden="true" className="nav-group-chevron" />
      </button>
      {open && <div className="nav-group-body">{children}</div>}
    </div>
  );
};

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
    <aside className="sidebar" aria-label={t("nav.primaryNavigation")}>
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
          <AppMark size={30} />
        </span>
        {!collapsed && (
          <span className="brand-text">
            <strong>Budget OS</strong>
            <span>{t("nav.personalFinance")}</span>
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
            /* A stable hook for the browser verification harness. The class
               names are styling and may change; this is the tab's identity. */
            data-tab={item.key}
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
            /* A stable hook for the browser verification harness. The class
               names are styling and may change; this is the tab's identity. */
            data-tab={item.key}
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
            void openPeriodReport(snapshot, range, t);
            setRangeOpen(false);
          }}
        />
      )}

      {!collapsed && (
        <div className="nav-section" style={{ marginTop: "auto" }}>
          {/* Two doors where there were nine buttons.

              Reports and data used to sit permanently open at the bottom of
              the navigation: three report buttons, three exports, an import
              and a red **Reset** — nine controls, on every screen, for actions
              taken monthly at most. The reset in particular had no business
              being one press from every page in the application.

              Both groups are closed by default and one press from open, which
              is the right distance for something used occasionally and the
              wrong distance for nothing at all. */}
          <NavGroup title={t("nav.reports")} icon={FileText}>
            <button className="btn btn-secondary btn-sm" onClick={() => void openPeriodReport(snapshot, "month", t)}>
              <FileText size={14} /> {t("reports.monthly")}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => void openPeriodReport(snapshot, "year", t)}>
              <FileText size={14} /> {t("reports.annual")}
            </button>
            {/* Any window, not only the ones the period selector offers: a
                quarter, a trip, the six weeks a renovation took. */}
            <button className="btn btn-secondary btn-sm" onClick={() => setRangeOpen(true)}>
              <CalendarRange size={14} /> {t("reports.custom")}
            </button>
          </NavGroup>

          <NavGroup title={t("nav.data")} icon={Download}>
            <button className="btn btn-secondary btn-sm" onClick={() => exportCurrentYearToExcel(snapshot)}>
              <FileSpreadsheet size={14} /> {t("nav.exportYear")}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportAllYearsToExcel(snapshot)}>
              <Download size={14} /> {t("nav.exportAll")}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportJson(snapshot)}>
              <FileJson size={14} /> {t("nav.backupJson")}
            </button>
            <ImportControl variant="compact" />
            <button
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (window.confirm(t("nav.resetConfirm"))) void resetToSeed();
              }}
            >
              <RefreshCw size={14} /> {t("nav.reset")}
            </button>
          </NavGroup>

          <div className="nav-section-title" style={{ marginTop: 16 }}>{t("nav.account")}</div>
          <div style={{ display: "grid", gap: 8 }}>
            {/* The address is shown, not just "signed in": on a shared device
                it is the only way to tell whose budget is on screen. */}
            <div className="auth-account text-footnote" title={user?.email ?? ""}>
              <UserRound size={14} aria-hidden="true" />
              <span className="auth-account-email">{user?.email ?? t("nav.signedIn")}</span>
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
  const { t } = useTranslation();
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
      label: t("common.thisQuarter"),
      apply: () => {
        const now = new Date();
        const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        setFrom(quarterStart.toISOString().slice(0, 10));
        setTo(today);
      },
    },
    {
      label: t("common.yearToDate"),
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
      title={t("nav.reportForACustomRange")}
      subtitle={t("nav.anyWindowYouLikeOpens")}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant="primary" form="range-report-form" disabled={!valid}>
            <FileText size={14} /> {t("nav.generateReport")}
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
        <FieldGroup title={t("nav.quickRanges")}>
          <Field label={t("nav.commonWindows")} span group>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {presets.map((preset) => (
                <button key={preset.label} type="button" className="chip" onClick={preset.apply}>
                  {preset.label}
                </button>
              ))}
            </div>
          </Field>
        </FieldGroup>

        <FieldGroup title={t("nav.dates")}>
          <Field label={t("nav.from")}>
            <input className="input" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input className="input" type="date" required value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field
            label={t("nav.whatThisCovers")}
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
                ? t("reports.rangeBackwards")
                : entryCount === 0
                  ? t("reports.rangeEmpty")
                  : t("dashboard.transactionCount", { count: entryCount })}
            </p>
          </Field>
        </FieldGroup>
      </form>
    </EditorSheet>
  );
};
