import React, { useState, useMemo, useEffect, useRef, Suspense, lazy } from "react";
import { useBudgetStore } from "./store/budgetStore";
import { calculateYear } from "./domain/calculations";
import { Sidebar } from "./components/layout/Sidebar";
import { MobileNav } from "./components/layout/MobileNav";
import { Header } from "./components/layout/Header";
import { PeriodSelector } from "./components/layout/PeriodSelector";
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
/**
 * The import is named so it can be used twice: once by React.lazy, and once to
 * warm the chunk ahead of time.
 *
 * Splitting these out of the initial bundle cut the first load by 40%, but it
 * moved the cost to the moment a tab is opened — measured at 190–370ms locally
 * and considerably worse over a real network. That delay lands exactly when
 * the transition is playing, so the animation appeared to stutter when what
 * was actually happening was a chunk being fetched.
 */
const loadAnalytics = () => import("./components/analytics/AnalyticsPanel");
const loadScenarios = () => import("./components/scenarios/ScenarioLab");
const loadHistory = () => import("./components/history/HistoryPanel");
const loadSettings = () => import("./components/settings/SettingsPanel");
const loadCategories = () => import("./components/categories/CategoryManager");

const AnalyticsPanel = lazy(() => loadAnalytics().then((m) => ({ default: m.AnalyticsPanel })));
const ScenarioLab = lazy(() => loadScenarios().then((m) => ({ default: m.ScenarioLab })));
const HistoryPanel = lazy(() => loadHistory().then((m) => ({ default: m.HistoryPanel })));
const SettingsPanel = lazy(() => loadSettings().then((m) => ({ default: m.SettingsPanel })));
const CategoryManager = lazy(() => loadCategories().then((m) => ({ default: m.CategoryManager })));

/**
 * Fetch every deferred panel once the browser is idle.
 *
 * The dashboard still paints without them, so the initial load keeps its gain;
 * by the time anyone reaches for a tab the chunk is already in memory and the
 * switch is instant. Sequential rather than parallel, so warming the cache
 * never competes with a request the user is actually waiting on.
 */
function preloadPanels(): void {
  const loaders = [loadAnalytics, loadSettings, loadCategories, loadHistory, loadScenarios];
  let index = 0;
  const next = () => {
    if (index >= loaders.length) return;
    loaders[index++]()
      .catch(() => undefined) // a warm-up that fails must never surface
      .then(() => schedule(next));
  };
  const schedule = (fn: () => void) => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(() => fn(), { timeout: 2000 });
    else window.setTimeout(fn, 200);
  };
  schedule(next);
}
import { RolloverDialog } from "./components/modals/RolloverDialog";
import { HistoricalEditDialog } from "./components/modals/HistoricalEditDialog";
import { Notifications } from "./components/Notifications";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { isViewingHistoricalPeriod } from "./utils/formatters";
import { periodLabel, periodOrdinal } from "./domain/periods";
import { Lock, Unlock } from "lucide-react";
import { useAuthStore } from "./store/authStore";
import { AuthScreen } from "./components/auth/AuthScreen";
import { TabTransition } from "./components/ui/TabTransition";
import { AircraftArt, AircraftMark } from "./components/ui/AircraftMark";
import { Tricolour } from "./components/ui/Tricolour";

type TabKey = "dashboard" | "activities" | "spending" | "wishlist" | "wallet" | "analytics" | "scenarios" | "history" | "settings" | "categories";

/*
 * The tab transition no longer takes a direction.
 *
 * It used to receive each tab's position in the navigation so the sweep could
 * run the way the eye had travelled. The direction is now fixed — left to
 * right, every time — so the ordering that fed it was information nothing
 * read, and a list that had to be kept in step with the sidebar for no gain.
 */

const SIDEBAR_PREF_KEY = "sidebar-collapsed";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const panelFrameRef = useRef<HTMLDivElement>(null);
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

  // Warm the deferred panels once there is something on screen.
  useEffect(() => {
    if (hydrated) preloadPanels();
  }, [hydrated]);
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

  /**
   * Move the page when the period changes — always the same way.
   *
   * This used to mirror the direction of travel: forward slid in from the
   * right, back from the left. That is defensible and it is not what this
   * application wants. A motion whose direction changes is a second thing to
   * read, and the period is already stated in three places; a single,
   * predictable left-to-right sweep reads as "the view refreshed" rather than
   * as an assertion about time the user has to decode. The *data* still moves
   * whichever way the arrow said.
   *
   * The animation is applied to the frame rather than by remounting the panel,
   * so a typed search or a scroll position survives the period change —
   * remounting to get an animation costs the user their place.
   */
  const periodOrder = periodOrdinal(snapshot.settings);
  const previousOrder = useRef(periodOrder);
  useEffect(() => {
    const frame = panelFrameRef.current;
    const changed = periodOrder !== previousOrder.current;
    previousOrder.current = periodOrder;
    if (!frame || !changed) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    // Removed first, so a rapid second press restarts the animation rather
    // than being swallowed because the class is already present.
    frame.classList.remove("period-shift");
    void frame.offsetWidth;
    frame.classList.add("period-shift");
    const timer = window.setTimeout(() => frame.classList.remove("period-shift"), 320);
    return () => window.clearTimeout(timer);
  }, [periodOrder]);

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
          <div className="boot-craft">
            <AircraftArt size={132} />
          </div>
          <div style={{ display: "grid", justifyItems: "center", gap: 4 }}>
            <div className="boot-title">Budget OS</div>
            <div className="boot-caption">Checking your session…</div>
          </div>
          <div className="boot-route" aria-hidden="true" />
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
          <div className="boot-craft">
            <AircraftArt size={132} />
          </div>
          <div style={{ display: "grid", justifyItems: "center", gap: 4 }}>
            <div className="boot-title">Budget OS</div>
            <div className="boot-caption">Loading your finances…</div>
          </div>
          <div className="boot-route" aria-hidden="true" />
        </div>
      </div>
    );
  }

  const tabs: Record<TabKey, React.ReactNode> = {
    dashboard: <Dashboard onNavigate={setActiveTab} />,
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
      <Tricolour className="tricolour-app" />
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

          {/* Above the historical indicator in the DOM *and* in the paint
              order, which is what makes its popover reach the pointer. See
              `.period-bar` in the stylesheet: the fix was removing the blanket
              `z-index: 1` from every child of the main area, not adding a
              larger number here. */}
          <PeriodSelector />

          {isHistorical && (
            historicalEditUnlocked ? (
              <div className="historical-banner historical-banner-unlocked" role="alert">
                <Unlock size={16} aria-hidden="true" />
                <span>
                  Editing <strong>{periodLabel(snapshot.settings)}</strong> — a closed period. Changes are
                  recorded in the audit trail.
                </span>
                {/* Pushed to the trailing edge by the stylesheet, not by an
                    inline style: inline wins over every rule, so the phone
                    layout could not stack it without `!important`. */}
                <button className="btn btn-secondary btn-sm" onClick={lockHistoricalEditing}>
                  <Lock size={14} /> Relock
                </button>
              </div>
            ) : (
              <div className="historical-banner" role="status">
                <Lock size={16} aria-hidden="true" />
                <span>Historical period · period-bound financial data is read-only.</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setHistoricalDialogOpen(true)}>
                  <Unlock size={14} /> Edit this period
                </button>
              </div>
            )
          )}

          {/* Keying on the tab restarts the enter animation, so switching
              views reads as a transition rather than an instant swap. */}
          <div className="tab-panel-frame" ref={panelFrameRef}>
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
              <TabTransition tabKey={activeTab}>
                {tabs[activeTab]}
              </TabTransition>
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
