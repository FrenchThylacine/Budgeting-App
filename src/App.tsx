import React, { useState, useMemo, useEffect, useRef, Suspense, lazy } from "react";
import { useBudgetStore } from "./store/budgetStore";
import type { TabKey } from "./domain/tabs";
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
const loadCurrencies = () => import("./components/currencies/CurrencyPanel");

const AnalyticsPanel = lazy(() => loadAnalytics().then((m) => ({ default: m.AnalyticsPanel })));
const ScenarioLab = lazy(() => loadScenarios().then((m) => ({ default: m.ScenarioLab })));
const HistoryPanel = lazy(() => loadHistory().then((m) => ({ default: m.HistoryPanel })));
/* Split like the rest: the report module and its stylesheet are fifteen
   kilobytes nothing needs until somebody asks for a report. */
const ReportPanel = lazy(() =>
  import("./components/report/ReportPanel").then((m) => ({ default: m.ReportPanel })),
);
const SettingsPanel = lazy(() => loadSettings().then((m) => ({ default: m.SettingsPanel })));
const CategoryManager = lazy(() => loadCategories().then((m) => ({ default: m.CategoryManager })));
const CurrencyPanel = lazy(() => loadCurrencies().then((m) => ({ default: m.CurrencyPanel })));
/**
 * The tour is deferred too.
 *
 * It is shown once, to a new account, and then never again unless somebody
 * asks for it — so its card, its twelve steps and the permission module behind
 * it have no business in the chunk that has to arrive before anything paints.
 */
const Tutorial = lazy(() => import("./components/onboarding/Tutorial").then((m) => ({ default: m.Tutorial })));
/**
 * The reminder for somebody who chose "Decide later".
 *
 * Deferred with the tour it belongs to: it renders nothing for the vast
 * majority of sessions, and its module is the tour's own.
 */
const TutorialReminder = lazy(() =>
  import("./components/onboarding/TutorialReminder").then((m) => ({ default: m.TutorialReminder })),
);

/**
 * Fetch every deferred panel once the browser is idle.
 *
 * The dashboard still paints without them, so the initial load keeps its gain;
 * by the time anyone reaches for a tab the chunk is already in memory and the
 * switch is instant. Sequential rather than parallel, so warming the cache
 * never competes with a request the user is actually waiting on.
 */
function preloadPanels(): void {
  const loaders = [loadAnalytics, loadSettings, loadCurrencies, loadCategories, loadHistory, loadScenarios];
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
import { ErrorBoundary } from "./components/ErrorBoundary";
import { isViewingHistoricalPeriod } from "./utils/formatters";
import { periodLabel, periodOrdinal } from "./domain/periods";
import { Lock, Unlock } from "lucide-react";
import { useAuthStore } from "./store/authStore";
import { AuthScreen } from "./components/auth/AuthScreen";
import { TabTransition } from "./components/ui/TabTransition";
import { Tricolour } from "./components/ui/Tricolour";
import { LoadingScreen, recallBootAircraft, rememberBootAircraft } from "./components/loading/LoadingScreen";
import { applyTheme, clearTheme, resolveAppearance, themeFor } from "./domain/theme";
import { sanitiseStatusColours, statusColourVariables } from "./domain/statusColours";
import { shouldAutoStartTutorial } from "./domain/tutorial";
import { useTranslation } from "./i18n/useTranslation";
import { resolveStoredText } from "./domain/storedText";
import { refreshRatesOnOpen } from "./domain/exchangeRates";


/**
 * The tabs the period does not govern.
 *
 * Everything else on the shell reads the selected week, month or year:
 * the dashboard and the statistics obviously, but also the wallet's month, the
 * wishlist's and the scenario lab's year, and the history's notes. These three
 * do not. A category is a category in August and in December; so is a
 * currency; so is the dark-mode switch.
 *
 * A control that changes nothing on the screen it is on is worse than a
 * missing one — it invites the reader to try it, and then teaches them that
 * the app's controls are decoration.
 */
const PERIODLESS_TABS = new Set<TabKey>(["categories", "currencies", "settings"]);

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
  /**
   * The tour.
   *
   * `null` means "has not been decided yet this session"; it is resolved once,
   * after hydration, from the stored onboarding state and whether the account
   * has any data. Re-deriving it on every render would reopen the tour the
   * instant the user's Skip is written, because writing it is a state change.
   */
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const tutorialDecided = useRef(false);
  const [rolloverOpen, setRolloverOpen] = useState(false);
  const [historicalDialogOpen, setHistoricalDialogOpen] = useState(false);
  /**
   * The boot overlay, and the aircraft it flies.
   *
   * Read once, on mount: re-reading it would swap the aeroplane mid-departure
   * the moment the snapshot arrives with a different preference in it.
   */
  const [bootComplete, setBootComplete] = useState(false);
  const [bootAircraft] = useState(recallBootAircraft);
  const { t, language } = useTranslation();

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

  /*
   * Exchange rates, on open.
   *
   * Once per session and only when a refresh is genuinely due — the daily
   * publication boundary and the age guard live in `domain/exchangeRates.ts`,
   * and a fresh cache answers without touching the network. Nothing is written
   * unless something actually changed, because an identical rate set stored
   * again is a revision bump and a sync to every other device saying nothing.
   *
   * A failure is recorded rather than swallowed: the Currencies tab reports
   * "the last attempt failed" rather than presenting yesterday's numbers as
   * today's.
   */
  const ratesChecked = useRef(false);
  useEffect(() => {
    if (!hydrated || ratesChecked.current) return;
    ratesChecked.current = true;
    /*
     * No cancellation on unmount, deliberately. Under StrictMode this effect
     * runs, is torn down and runs again on the same fiber — so the ref has
     * already been set by the time the second run arrives, and cancelling the
     * first run's promise threw away the only fetch that was ever made. The
     * result goes to the store rather than to component state, so a write that
     * lands after unmount is simply a write.
     */
    void refreshRatesOnOpen(useBudgetStore.getState().snapshot.settings.exchangeRates)
      .then((result) => {
        if (result) useBudgetStore.getState().updateSettings({ exchangeRates: result.rates });
      })
      .catch(() => undefined); // a rate refresh must never surface as an error
  }, [hydrated]);

  // Warm the deferred panels once there is something on screen.
  useEffect(() => {
    if (hydrated) preloadPanels();
  }, [hydrated]);

  /*
   * Offer the tour to a genuinely new account, once.
   *
   * Decided a single time per session, on the first hydrated snapshot: an
   * account that has completed or skipped it never sees it again, and neither
   * does one that already has data — being walked through the basics after
   * importing five years of records is patronising.
   */
  useEffect(() => {
    if (!hydrated || tutorialDecided.current) return;
    tutorialDecided.current = true;
    if (shouldAutoStartTutorial(snapshot)) setTutorialOpen(true);
  }, [hydrated, snapshot]);

  // Reopened from Settings: the stored marks are cleared there, and this
  // brings the card back without a reload.
  useEffect(() => {
    const onReplay = () => setTutorialOpen(true);
    window.addEventListener("budget-os:replay-tutorial", onReplay);
    return () => window.removeEventListener("budget-os:replay-tutorial", onReplay);
  }, []);

  /*
   * Cross-panel navigation.
   *
   * Settings links to the Currencies tab, and the tab state lives here. An
   * event rather than prop-drilling a setter through two lazily loaded panels:
   * the alternative is a callback threaded through components that have no
   * other reason to know navigation exists.
   */
  useEffect(() => {
    const onNavigate = (event: Event) => {
      const target = (event as CustomEvent<string>).detail;
      if (typeof target === "string") setActiveTab(target as TabKey);
    };
    window.addEventListener("budget-os:navigate", onNavigate);
    return () => window.removeEventListener("budget-os:navigate", onNavigate);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_PREF_KEY, String(sidebarCollapsed)); } catch { /* noop */ }
  }, [sidebarCollapsed]);
  /*
   * The theme.
   *
   * Three inputs: the chosen preset, the chosen appearance, and — when the
   * appearance is "system" — what the operating system is doing right now. The
   * last one is subscribed to rather than read once, because a laptop that
   * switches to dark at sunset should take the application with it.
   */
  const themePreset = snapshot.settings.themePreset;
  const appearance = snapshot.settings.appearance;
  const darkModeSetting = snapshot.settings.darkMode === true;
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches === true,
  );
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const theme = themeFor(themePreset);
    const dark = resolveAppearance(appearance, darkModeSetting, systemDark, theme);
    // `=== true`, not the raw value: classList.toggle ignores an `undefined`
    // second argument and flips the class instead of clearing it. A snapshot
    // stored without `darkMode` therefore inverted the theme on every run of
    // this effect, leaving a dark page with light-scheme form controls.
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
    applyTheme(root, theme, dark);
    return () => {
      root.classList.remove("dark");
      root.style.removeProperty("color-scheme");
      clearTheme(root);
    };
  }, [themePreset, appearance, darkModeSetting, systemDark]);

  /*
   * The reader's own status colours, over whatever the theme said.
   *
   * A separate effect from the theme's, and it must run *after* it: `applyTheme`
   * writes the theme's whole palette, so setting these inside it would put the
   * order of two effects in charge of which palette wins. Written here, they
   * are re-applied whenever either the theme or the choice changes, and cleared
   * kind by kind so switching one back to the theme's does not clear the other
   * two.
   */
  const statusColours = snapshot.settings.statusColours;
  useEffect(() => {
    const root = document.documentElement;
    const variables = statusColourVariables(sanitiseStatusColours(statusColours));
    for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
    return () => {
      for (const name of Object.keys(variables)) root.style.removeProperty(name);
    };
  }, [statusColours, themePreset, appearance, darkModeSetting, systemDark]);

  /*
   * The loading screen runs before the snapshot exists, so it cannot read the
   * chosen aircraft from it. The choice is mirrored into local storage purely
   * as a hint for the *next* cold start.
   */
  useEffect(() => {
    if (hydrated) rememberBootAircraft(snapshot.settings.aircraft);
  }, [hydrated, snapshot.settings.aircraft]);

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

  /*
   * The boot overlay covers the application until there is something real
   * underneath it, and then flies away — which is what uncovers the page. Three
   * states, not two: "still checking" must not look like "signed out", or the
   * sign-in form flashes at an already-signed-in user on every load.
   */
  const appReady = authChecked && (!user || hydrated);
  const boot = !bootComplete ? (
    <LoadingScreen
      ready={appReady}
      aircraft={bootAircraft}
      caption={!authChecked ? t("boot.checkingSession") : t("boot.loading")}
      onFinished={() => setBootComplete(true)}
    />
  ) : null;

  if (!appReady) return boot;

  if (!user) {
    return (
      <>
        {boot}
        <AuthScreen />
      </>
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
    report: <ReportPanel />,
    settings: <SettingsPanel />,
    categories: <CategoryManager />,
    currencies: <CurrencyPanel />,
  };

  const isHistorical = isViewingHistoricalPeriod(snapshot.settings);

  return (
    <ErrorBoundary>
      {boot}
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
              <button className="btn btn-ghost btn-sm" onClick={() => setNotice("")}>{t("common.dismiss")}</button>
            </div>
          )}

          {syncNotice && (
            <div className="notice-bar" role="alert">
              <span>{resolveStoredText(syncNotice, t)}</span>
              <button className="btn btn-ghost btn-sm" onClick={clearSyncNotice}>{t("common.dismiss")}</button>
            </div>
          )}

          <Header calculation={calculation} setRolloverOpen={setRolloverOpen} />

          {/* Renders nothing unless the tour was put off; see
              `shouldOfferReminder`. */}
          <Suspense fallback={null}>
            <TutorialReminder onResume={() => setTutorialOpen(true)} />
          </Suspense>

          {/* Above the historical indicator in the DOM *and* in the paint
              order, which is what makes its popover reach the pointer. See
              `.period-bar` in the stylesheet: the fix was removing the blanket
              `z-index: 1` from every child of the main area, not adding a
              larger number here. */}
          {PERIODLESS_TABS.has(activeTab) ? null : <PeriodSelector />}

          {isHistorical && (
            historicalEditUnlocked ? (
              <div className="historical-banner historical-banner-unlocked" role="alert">
                <Unlock size={16} aria-hidden="true" />
                <span>{t("historical.editing", { period: periodLabel(snapshot.settings, language) })}</span>
                {/* Pushed to the trailing edge by the stylesheet, not by an
                    inline style: inline wins over every rule, so the phone
                    layout could not stack it without `!important`. */}
                <button className="btn btn-secondary btn-sm" onClick={lockHistoricalEditing}>
                  <Lock size={14} /> {t("historical.relock")}
                </button>
              </div>
            ) : (
              <div className="historical-banner" role="status">
                <Lock size={16} aria-hidden="true" />
                <span>{t("historical.readOnly")}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setHistoricalDialogOpen(true)}>
                  <Unlock size={14} /> {t("historical.edit")}
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
                  <span className="text-caption">{t("common.loading")}</span>
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
            periodLabel={periodLabel(snapshot.settings, language)}
            onCancel={() => setHistoricalDialogOpen(false)}
            onConfirm={() => {
              unlockHistoricalEditing();
              setHistoricalDialogOpen(false);
            }}
          />
        )}

        {tutorialOpen && (
          // No fallback: a card that is about to appear should appear, not be
          // preceded by a placeholder for one.
          <Suspense fallback={null}>
            <Tutorial
              onNavigate={(tab) => setActiveTab(tab as TabKey)}
              onClose={() => setTutorialOpen(false)}
            />
          </Suspense>
        )}

      </div>
    </ErrorBoundary>
  );
}
