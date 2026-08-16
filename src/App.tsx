import React, { useState, useMemo, useEffect, Suspense, lazy } from "react";
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
/**
 * Panels loaded on demand.
 *
 * The dashboard is what loads first, and it does not need the chart library,
 * the icon catalogue or the scenario tools. Bundling them into the initial
 * download made every first paint wait for code most sessions never open.
 * Named exports are unwrapped here because React.lazy expects a default.
 */
const AnalyticsPanel = lazy(() => import("./components/analytics/AnalyticsPanel").then((m) => ({ default: m.AnalyticsPanel })));
const ScenarioLab = lazy(() => import("./components/scenarios/ScenarioLab").then((m) => ({ default: m.ScenarioLab })));
const HistoryPanel = lazy(() => import("./components/history/HistoryPanel").then((m) => ({ default: m.HistoryPanel })));
const SettingsPanel = lazy(() => import("./components/settings/SettingsPanel").then((m) => ({ default: m.SettingsPanel })));
const CategoryManager = lazy(() => import("./components/categories/CategoryManager").then((m) => ({ default: m.CategoryManager })));
import { RolloverDialog } from "./components/modals/RolloverDialog";
import { HistoricalEditDialog } from "./components/modals/HistoricalEditDialog";
import { Notifications } from "./components/Notifications";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { isViewingHistoricalPeriod } from "./utils/formatters";
import { periodLabel } from "./domain/periods";
import { Lock, Plane, Unlock } from "lucide-react";
import { useAuthStore } from "./store/authStore";
import { AuthScreen } from "./components/auth/AuthScreen";

type TabKey = "dashboard" | "activities" | "spending" | "wishlist" | "wallet" | "analytics" | "scenarios" | "history" | "settings" | "categories";

const SIDEBAR_PREF_KEY = "sidebar-collapsed";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_PREF_KEY) === "true"; } catch { return false; }
  });
  const [notice, setNotice] = useState("");
  const [rolloverOpen, setRolloverOpen] = useState(false);
  const [historicalDialogOpen, setHistoricalDialogOpen] = useState(false);

  const snapshot = useBudgetStore((s) => s.snapshot);
  const hydrated = useBudgetStore((s) => s.hydrated);
  const hydrate = useBudgetStore((s) => s.hydrate);
  const syncNotice = useBudgetStore((s) => s.syncNotice);
  const clearSyncNotice = useBudgetStore((s) => s.clearSyncNotice);
  const user = useAuthStore((s) => s.user);
  const authChecked = useAuthStore((s) => s.checked);
  const checkSession = useAuthStore((s) => s.checkSession);

  const historicalEditUnlocked = useBudgetStore((s) => s.historicalEditUnlocked);
  const unlockHistoricalEditing = useBudgetStore((s) => s.unlockHistoricalEditing);
  const lockHistoricalEditing = useBudgetStore((s) => s.lockHistoricalEditing);

  const calculation = useMemo(() => calculateYear(snapshot), [snapshot]);

  useEffect(() => { void checkSession(); }, [checkSession]);

  // Deliberately gated on `user`. Hydrating before the session is known would
  // request a budget as nobody — and, on a network hiccup, fall back to
  // whatever this device last cached, which may belong to another account.
  useEffect(() => {
    if (user) void hydrate();
  }, [user, hydrate]);
  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_PREF_KEY, String(sidebarCollapsed)); } catch { /* noop */ }
  }, [sidebarCollapsed]);
  useEffect(() => {
    const root = document.documentElement;
    // `=== true`, not the raw value: classList.toggle ignores an `undefined`
    // second argument and flips the class instead of clearing it. A snapshot
    // stored without `darkMode` therefore inverted the theme on every run of
    // this effect, leaving a dark page with light-scheme form controls.
    const dark = snapshot.settings.darkMode === true;
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
    return () => {
      root.classList.remove("dark");
      root.style.removeProperty("color-scheme");
    };
  }, [snapshot.settings.darkMode]);

  // Keyboard shortcuts.
  //
  // This previously called preventDefault on Ctrl+Z and then did nothing,
  // which disabled native undo inside every text field while providing no
  // undo of its own. Now it performs the action, and stays out of the way
  // while the user is typing so native field-level undo keeps working.
  useEffect(() => {
    const isTextEntry = (target: EventTarget | null): boolean => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      const tag = element.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable;
    };

    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || isTextEntry(event.target)) return;
      const key = event.key.toLowerCase();

      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        useBudgetStore.getState().undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        useBudgetStore.getState().redo();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Three states, not two: "still checking" must not look like "signed out",
  // or the sign-in form flashes at an already-signed-in user on every load.
  if (!authChecked) {
    return (
      <div className="boot-screen" role="status" aria-live="polite">
        <div className="boot-inner">
          <div className="boot-mark">
            <Plane size={30} strokeWidth={2.2} aria-hidden="true" />
          </div>
          <div style={{ display: "grid", justifyItems: "center", gap: 4 }}>
            <div className="text-title">Budget OS</div>
            <div className="text-caption">Checking your session…</div>
          </div>
          <div className="boot-track" aria-hidden="true">
            <div className="boot-fill" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (!hydrated) {
    return (
      <div className="boot-screen" role="status" aria-live="polite">
        <div className="boot-inner">
          <div className="boot-mark">
            <Plane size={30} strokeWidth={2.2} aria-hidden="true" />
          </div>
          <div style={{ display: "grid", justifyItems: "center", gap: 4 }}>
            <div className="text-title">Budget OS</div>
            <div className="text-caption">Loading your finances…</div>
          </div>
          <div className="boot-track" aria-hidden="true">
            <div className="boot-fill" />
          </div>
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

          {syncNotice && (
            <div className="notice-bar" role="alert">
              <span>{syncNotice}</span>
              <button className="btn btn-ghost btn-sm" onClick={clearSyncNotice}>Dismiss</button>
            </div>
          )}

          <Header calculation={calculation} setRolloverOpen={setRolloverOpen} />

          {isHistorical && (
            historicalEditUnlocked ? (
              <div className="historical-banner historical-banner-unlocked" role="alert">
                <Unlock size={16} aria-hidden="true" />
                <span>
                  Editing <strong>{periodLabel(snapshot.settings)}</strong> — a closed period. Changes are
                  recorded in the audit trail.
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={lockHistoricalEditing}
                  style={{ marginLeft: "auto" }}
                >
                  <Lock size={14} /> Relock
                </button>
              </div>
            ) : (
              <div className="historical-banner" role="status">
                <Lock size={16} aria-hidden="true" />
                <span>Historical period · period-bound financial data is read-only.</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setHistoricalDialogOpen(true)}
                  style={{ marginLeft: "auto" }}
                >
                  <Unlock size={14} /> Edit this period
                </button>
              </div>
            )
          )}

          {/* Keying on the tab restarts the enter animation, so switching
              views reads as a transition rather than an instant swap. */}
          {/* The animation lives on the inner element, not on this one.
              A lazily loaded panel suspends, so the outer wrapper mounts with
              the fallback inside it and the transition plays over an empty
              box — then the real content swaps in without remounting and
              never animates at all. Keying the inner element means the
              animation fires when the content actually arrives. */}
          <div className="tab-panel-frame">
            {/* A lazily loaded panel suspends on first open. The fallback keeps
                the layout height so the page does not jump, and announces
                itself rather than flashing an empty region. */}
            <Suspense
              fallback={
                <div className="panel-loading" role="status" aria-live="polite">
                  <span className="panel-loading-bar" aria-hidden="true" />
                  <span className="text-caption">Loading…</span>
                </div>
              }
            >
              <div key={activeTab} className="tab-panel">{tabs[activeTab]}</div>
            </Suspense>
          </div>
        </main>

        <MobileNav activeTab={activeTab} setActiveTab={setActiveTab} />

        {rolloverOpen && (
          <RolloverDialog
            onClose={() => setRolloverOpen(false)}
            calculation={calculation}
          />
        )}

        {historicalDialogOpen && (
          <HistoricalEditDialog
            periodLabel={periodLabel(snapshot.settings)}
            onCancel={() => setHistoricalDialogOpen(false)}
            onConfirm={() => {
              unlockHistoricalEditing();
              setHistoricalDialogOpen(false);
            }}
          />
        )}

        <Notifications />
      </div>
    </ErrorBoundary>
  );
}
