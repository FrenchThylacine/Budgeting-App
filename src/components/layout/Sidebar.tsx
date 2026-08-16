import React from "react";
import { useAuthStore } from "../../store/authStore";
import { useBudgetStore } from "../../store/budgetStore";
import {
  LayoutDashboard, ListTodo, Receipt, Gift, Wallet, BarChart3,
  FlaskConical, History, Settings, Tags, ChevronLeft, ChevronRight,
  Plane, FileSpreadsheet, Download, FileJson, RefreshCw, FileText,
  LogOut, UserRound
} from "lucide-react";
import { exportCurrentYearToExcel, exportAllYearsToExcel, exportJson } from "../../domain/importExport";
import { buildPeriodReport, reportHtml, type ReportScope } from "../../domain/report";
import { formatMoney } from "../../domain/currency";
import type { BudgetSnapshot } from "../../domain/types";

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

type TabKey = "dashboard" | "activities" | "spending" | "wishlist" | "wallet" | "analytics" | "scenarios" | "history" | "settings" | "categories";

const navItems: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "activities", label: "Activities", icon: ListTodo },
  { key: "spending", label: "Spending", icon: Receipt },
  { key: "wishlist", label: "Wishlist", icon: Gift },
  { key: "wallet", label: "Wallet", icon: Wallet },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "scenarios", label: "Scenarios", icon: FlaskConical },
  { key: "history", label: "History", icon: History },
  { key: "categories", label: "Categories", icon: Tags },
  { key: "settings", label: "Settings", icon: Settings },
];

export const Sidebar: React.FC<{
  activeTab: TabKey;
  setActiveTab: (t: TabKey) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}> = ({ activeTab, setActiveTab, collapsed, setCollapsed }) => {
  const snapshot = useBudgetStore((s) => s.snapshot);
  const resetToSeed = useBudgetStore((s) => s.resetToSeed);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const overviewItems = navItems.slice(0, 6);
  const systemItems = navItems.slice(6);

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="nav-brand">
        <div className="brand-icon">
          <Plane size={20} strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <div className="brand-text">
            <strong>Budget OS</strong>
            <span>Personal Finance</span>
          </div>
        )}
        <button
          className="btn btn-ghost btn-icon"
          style={{ marginLeft: "auto" }}
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="nav-section">
        {!collapsed && <div className="nav-section-title">Overview</div>}
        {overviewItems.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${activeTab === item.key ? "active" : ""}`}
            onClick={() => setActiveTab(item.key)}
            title={collapsed ? item.label : undefined}
            aria-current={activeTab === item.key ? "page" : undefined}
          >
            <item.icon size={18} className="nav-icon" />
            {!collapsed && item.label}
          </button>
        ))}
      </nav>

      <nav className="nav-section">
        {!collapsed && <div className="nav-section-title">System</div>}
        {systemItems.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${activeTab === item.key ? "active" : ""}`}
            onClick={() => setActiveTab(item.key)}
            title={collapsed ? item.label : undefined}
            aria-current={activeTab === item.key ? "page" : undefined}
          >
            <item.icon size={18} className="nav-icon" />
            {!collapsed && item.label}
          </button>
        ))}
      </nav>

      {!collapsed && (
        <div className="nav-section" style={{ marginTop: "auto" }}>
          <div className="nav-section-title">Reports</div>
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => openPeriodReport(snapshot, "month")}>
              <FileText size={14} /> Monthly report
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => openPeriodReport(snapshot, "year")}>
              <FileText size={14} /> Annual report
            </button>
          </div>

          <div className="nav-section-title">Data</div>
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
            <button
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (window.confirm("Reset all data to seed budget? This cannot be undone.")) void resetToSeed();
              }}
            >
              <RefreshCw size={14} /> Reset
            </button>
          </div>

          <div className="nav-section-title" style={{ marginTop: 16 }}>Account</div>
          <div style={{ display: "grid", gap: 8 }}>
            {/* The address is shown, not just "signed in": on a shared device
                it is the only way to tell whose budget is on screen. */}
            <div className="auth-account text-footnote" title={user?.email ?? ""}>
              <UserRound size={14} aria-hidden="true" />
              <span className="auth-account-email">{user?.email ?? "Signed in"}</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => void signOut()}>
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
