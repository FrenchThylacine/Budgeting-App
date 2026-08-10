import React, { useState, useMemo, useEffect } from "react";
import { useBudgetStore } from "./store/budgetStore";
import { calculateYear } from "./domain/calculations";
import { Sidebar } from "./components/layout/Sidebar";
import { MobileNav } from "./components/layout/MobileNav";
import { Header } from "./components/layout/Header";
import { Dashboard } from "./components/dashboard/Dashboard";
import { ActivityPanel } from "./components/activity/ActivityPanel";
import { SpendingPanel } from "./components/spending/SpendingPanel";
import { WishlistPanel } from "./components/wishlist/WishlistPanel";
import { WalletPanel } from "./components/wallet/WalletPanel";
import { AnalyticsPanel } from "./components/analytics/AnalyticsPanel";
import { ScenarioLab } from "./components/scenarios/ScenarioLab";
import { HistoryPanel } from "./components/history/HistoryPanel";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { CategoryManager } from "./components/categories/CategoryManager";
import { RolloverDialog } from "./components/modals/RolloverDialog";
import { Notifications } from "./components/Notifications";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { isViewingHistoricalPeriod } from "./utils/formatters";

type TabKey = "dashboard" | "activities" | "spending" | "wishlist" | "wallet" | "analytics" | "scenarios" | "history" | "settings" | "categories";

const SIDEBAR_PREF_KEY = "sidebar-collapsed";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_PREF_KEY) === "true"; } catch { return false; }
  });
  const [notice, setNotice] = useState("");
  const [rolloverOpen, setRolloverOpen] = useState(false);

  const snapshot = useBudgetStore((s) => s.snapshot);
  const hydrated = useBudgetStore((s) => s.hydrated);
  const hydrate = useBudgetStore((s) => s.hydrate);

  const calculation = useMemo(() => calculateYear(snapshot), [snapshot]);

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_PREF_KEY, String(sidebarCollapsed)); } catch { /* noop */ }
  }, [sidebarCollapsed]);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", snapshot.settings.darkMode);
    root.style.colorScheme = snapshot.settings.darkMode ? "dark" : "light";
    return () => {
      root.classList.remove("dark");
      root.style.removeProperty("color-scheme");
    };
  }, [snapshot.settings.darkMode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        // undo handled by buttons
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!hydrated) {
    return (
      <div style={{
        display: "grid", placeItems: "center", height: "100vh", color: "var(--text-secondary)", background: "var(--bg)"
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div className="brand-icon" style={{ width: 56, height: 56 }}>
            <span style={{ fontSize: 28 }}>✈</span>
          </div>
          <div className="text-callout">Loading your finances...</div>
        </div>
      </div>
    );
  }

  const tabs: Record<TabKey, React.ReactNode> = {
    dashboard: <Dashboard />,
    activities: <ActivityPanel />,
    spending: <SpendingPanel />,
    wishlist: <WishlistPanel />,
    wallet: <WalletPanel />,
    analytics: <AnalyticsPanel />,
    scenarios: <ScenarioLab />,
    history: <HistoryPanel />,
    settings: <SettingsPanel />,
    categories: <CategoryManager />,
  };

  const isHistorical = isViewingHistoricalPeriod(snapshot.settings);

  return (
    <ErrorBoundary>
      <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
        />

        <main className={`main-area ${isHistorical ? "historical-period" : ""}`}>
          {notice && (
            <div className="notice-bar">
              <span>{notice}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setNotice("")}>Dismiss</button>
            </div>
          )}

          <Header calculation={calculation} setRolloverOpen={setRolloverOpen} />

          {isHistorical && (
            <div className="historical-banner" role="status">
              Historical period · period-bound financial data is read-only.
            </div>
          )}

          {tabs[activeTab]}
        </main>

        <MobileNav activeTab={activeTab} setActiveTab={setActiveTab} />

        {rolloverOpen && (
          <RolloverDialog
            onClose={() => setRolloverOpen(false)}
            calculation={calculation}
          />
        )}

        <Notifications />
      </div>
    </ErrorBoundary>
  );
}
