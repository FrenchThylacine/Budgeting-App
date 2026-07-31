import React from "react";
import { useBudgetStore } from "../../store/budgetStore";
import {
  LayoutDashboard, ListTodo, Receipt, Gift, Wallet, BarChart3,
  FlaskConical, History, Settings, Tags, ChevronLeft, ChevronRight,
  Plane, FileSpreadsheet, Download, FileJson, RefreshCw
} from "lucide-react";
import { exportCurrentYearToExcel, exportAllYearsToExcel, exportJson } from "../../domain/importExport";

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
        </div>
      )}
    </aside>
  );
};
