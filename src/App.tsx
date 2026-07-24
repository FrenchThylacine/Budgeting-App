import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Analytics } from "@vercel/analytics/react";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  Archive,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FileSpreadsheet,
  History,
  Menu,
  Moon,
  Pencil,
  Plane,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Search,
  Settings as SettingsIcon,
  ShoppingBag,
  SlidersHorizontal,
  StickyNote,
  Sun,
  Trash2,
  Undo2,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { calculateSuggestedMonthlyBudget, calculateYear, monthlyEstimateNative, yearlyEstimateNative } from "./domain/calculations";
import { convertAmount, CURRENCY_OPTIONS, formatMoney, normalizeAmount, parseAmount } from "./domain/currency";
import {
  dateInputValue,
  formatDateTime,
  getIsoWeek,
  monthFromDateInput,
  monthName,
  MONTH_NAMES,
  startOfIsoWeek,
  weekFromDateInput,
  weeksInIsoYear,
} from "./domain/dates";
import {
  exportAllYearsToExcel,
  exportCurrentYearToExcel,
  exportJson,
  exportWalletCsv,
  exportWishlistCsv,
  importBudgetWorkbook,
  importJsonBackup,
} from "./domain/importExport";
import type {
  Activity,
  BudgetSnapshot,
  BudgetCategory,
  CurrencyCode,
  RecurrenceType,
  Settings,
  SpendingEntry,
  WalletEntry,
  WishlistItem,
} from "./domain/types";
import { useBudgetStore } from "./store/budgetStore";

type TabKey = "activities" | "spending" | "wishlist" | "wallet" | "analytics" | "history" | "settings";
type BudgetCalculation = ReturnType<typeof calculateYear>;
type WishlistView = "active" | "purchased" | "archived" | "all";

interface Filters {
  query: string;
  categoryId: string;
  currency: string;
  season: string;
  historyQuery: string;
}

interface ActivityDraft {
  name: string;
  categoryId: string;
  currency: CurrencyCode;
  recurrenceType: RecurrenceType;
  recurrenceInterval: number;
  pricePerSession: string;
  pricePerPurchase: string;
  pricePerMonth: string;
  yearlyEstimate: string;
  seasonalTag: string;
  active: boolean;
  visible: boolean;
  notes: string;
}

interface WishlistDraft {
  name: string;
  actualPrice: string;
  currency: CurrencyCode;
  priority: WishlistItem["priority"];
  bought: boolean;
  inWishlist: boolean;
  active: boolean;
  notes: string;
}

const tabs: Array<{ key: TabKey; label: string; icon: typeof ActivityIcon }> = [
  { key: "activities", label: "Activities", icon: ActivityIcon },
  { key: "spending", label: "Spending", icon: CalendarDays },
  { key: "wishlist", label: "Wishlist", icon: ShoppingBag },
  { key: "wallet", label: "Wallet", icon: Wallet },
  { key: "analytics", label: "Analysis", icon: BarChart3 },
  { key: "history", label: "History", icon: History },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

const recurrenceTypes: RecurrenceType[] = ["none", "weekly", "monthly", "yearly", "session", "purchase", "custom"];
const SIDEBAR_PREF_KEY = "premium-budget.sidebar-collapsed";

export default function App() {
  const store = useBudgetStore();
  const { snapshot, hydrated } = store;
  const [activeTab, setActiveTab] = useState<TabKey>("activities");
  const [notice, setNotice] = useState<string>("");
  const [rolloverOpen, setRolloverOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(SIDEBAR_PREF_KEY) === "true");
  const [filters, setFilters] = useState<Filters>({
    query: "",
    categoryId: "all",
    currency: "all",
    season: "all",
    historyQuery: "",
  });

  useEffect(() => {
    void store.hydrate();
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_PREF_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", snapshot.settings.darkMode);
  }, [snapshot.settings.darkMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        store.undo();
      }
      if (key === "y") {
        event.preventDefault();
        store.redo();
      }
      if (key === "k") {
        event.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);

  // Month-boundary detector: schedule an exact timeout to next month start and wake on visibilitychange
  useEffect(() => {
    let lastMonth = new Date().getMonth() + 1;
    let timeoutId: number | undefined;

    function scheduleNext() {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
      const ms = Math.max(0, next.getTime() - now.getTime());
      timeoutId = window.setTimeout(() => {
        lastMonth = new Date().getMonth() + 1;
        window.dispatchEvent(new CustomEvent("open-budget-suggestion"));
        scheduleNext();
      }, ms);
    }

    function onVisibility() {
      // if the user changed system time or resumed after sleep, detect month change
      const nowMonth = new Date().getMonth() + 1;
      if (nowMonth !== lastMonth) {
        lastMonth = nowMonth;
        window.dispatchEvent(new CustomEvent("open-budget-suggestion"));
      }
      // reschedule to ensure the timeout is correct
      if (timeoutId) window.clearTimeout(timeoutId);
      scheduleNext();
    }

    scheduleNext();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const calculation = useMemo(() => calculateYear(snapshot), [snapshot]);
  const record = snapshot.years[String(snapshot.settings.selectedYear)];
  const historical = isViewingHistoricalPeriod(snapshot.settings);
  const [changelogOpen, setChangelogOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setChangelogOpen(true);
    window.addEventListener("open-changelog", onOpen as EventListener);
    return () => window.removeEventListener("open-changelog", onOpen as EventListener);
  }, []);

  if (!hydrated || !record) {
    return (
      <main className="loading-screen">
        <Database size={34} />
        <strong>Loading Budget OS</strong>
        <span>Restoring your local budget data...</span>
      </main>
    );
  }

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        filters={filters}
        setFilters={setFilters}
        setNotice={setNotice}
      />
      <main className={historical ? "main-area historical-period" : "main-area"}>
        {historical && <div className="historical-label">Historical data</div>}
        <Header calculation={calculation} setRolloverOpen={setRolloverOpen} />
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button className="icon-button" title="Dismiss" onClick={() => setNotice("")}> 
              <X size={16} />
            </button>
          </div>
        )}
        <SummaryCards calculation={calculation} />
        <BudgetSuggestionPanel />
        <section className="workspace">
          {activeTab === "activities" && <ActivityPanel filters={filters} calculation={calculation} />}
          {activeTab === "spending" && <SpendingPanel filters={filters} calculation={calculation} />}
          {activeTab === "wishlist" && <WishlistPanel filters={filters} />}
          {activeTab === "wallet" && <WalletPanel calculation={calculation} openRollover={() => setRolloverOpen(true)} />}
          {activeTab === "analytics" && <AnalyticsPanel calculation={calculation} />}
          {activeTab === "history" && <HistoryPanel filters={filters} setFilters={setFilters} />}
          {activeTab === "settings" && <SettingsPanel />}
        </section>
      </main>
      {rolloverOpen && <RolloverDialog calculation={calculation} onClose={() => setRolloverOpen(false)} />}
      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />
      <Analytics />
    </div>
  );
}

function Sidebar({
  activeTab,
  setActiveTab,
  collapsed,
  setCollapsed,
  filters,
  setFilters,
  setNotice,
}: {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  filters: Filters;
  setFilters: (filters: Filters) => void;
  setNotice: (notice: string) => void;
}) {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const applySeasonalPreset = useBudgetStore((state) => state.applySeasonalPreset);
  const applyScenarioPreset = useBudgetStore((state) => state.applyScenarioPreset);
  const importSnapshot = useBudgetStore((state) => state.importSnapshot);
  const resetToSeed = useBudgetStore((state) => state.resetToSeed);
  const workbookInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);

  async function handleWorkbookImport(file: File | undefined) {
    if (!file) return;
    try {
      const imported = await importBudgetWorkbook(file);
      importSnapshot(imported, `Imported ${file.name}.`);
      setNotice(`Imported ${file.name} into the app model.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Workbook import failed.");
    }
  }

  async function handleJsonImport(file: File | undefined) {
    if (!file) return;
    try {
      const imported = await importJsonBackup(file);
      importSnapshot(imported, `Restored ${file.name}.`);
      setNotice(`Restored ${file.name}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "JSON restore failed.");
    }
  }

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="brand-block">
        <div className="brand-mark">
          <Plane size={22} />
        </div>
        {!collapsed && (
          <div className="brand-copy">
            <strong>Budget OS</strong>
            <span>Personal finance cockpit</span>
          </div>
        )}
        <button className="icon-button collapse-button" title={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}>
          <Menu size={17} />
        </button>
      </div>

      <nav className="side-nav">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              className={activeTab === tab.key ? "side-nav-item active" : "side-nav-item"}
              onClick={() => setActiveTab(tab.key)}
              title={tab.label}
            >
              <Icon size={19} />
              {!collapsed && <span>{tab.label}</span>}
            </button>
          );
        })}
      </nav>

      {!collapsed && (
        <>
          <section className="sidebar-section">
            <div className="section-title">
              <Search size={15} />
              Find & Filter
            </div>
            <label>
              Search
              <input id="global-search" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="Ctrl+K to search" />
            </label>
            <div className="filter-grid">
              <label>
                Category
                <select value={filters.categoryId} onChange={(event) => setFilters({ ...filters, categoryId: event.target.value })}>
                  <option value="all">All</option>
                  {snapshot.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Currency
                <select value={filters.currency} onChange={(event) => setFilters({ ...filters, currency: event.target.value })}>
                  <option value="all">All</option>
                  {CURRENCY_OPTIONS.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Season
              <select value={filters.season} onChange={(event) => setFilters({ ...filters, season: event.target.value })}>
                <option value="all">All seasons</option>
                <option value="normal">Normal</option>
                <option value="summer">Summer</option>
                <option value="school-term">School term</option>
                <option value="travel">Travel</option>
              </select>
            </label>
          </section>

          <section className="sidebar-section">
            <div className="section-title">
              <SlidersHorizontal size={15} />
              Presets
            </div>
            <div className="pill-grid">
              {snapshot.seasonalPresets.map((preset) => (
                <button key={preset.id} className="soft-button" onClick={() => applySeasonalPreset(preset.id)} title={preset.notes}>
                  {preset.name}
                </button>
              ))}
            </div>
            <div className="pill-grid">
              {snapshot.scenarioPresets.map((preset) => (
                <button key={preset.id} className="soft-button" onClick={() => applyScenarioPreset(preset.id)} title={preset.notes}>
                  {preset.name}
                </button>
              ))}
            </div>
          </section>

          <section className="sidebar-section">
            <div className="section-title">
              <Database size={15} />
              Data
            </div>
            <input ref={workbookInput} className="hidden-input" type="file" accept=".xlsx,.xls" onChange={(event) => void handleWorkbookImport(event.target.files?.[0])} />
            <input ref={jsonInput} className="hidden-input" type="file" accept=".json" onChange={(event) => void handleJsonImport(event.target.files?.[0])} />
            <div className="data-actions">
              <button className="command-button" onClick={() => workbookInput.current?.click()}>
                <Upload size={16} />
                Import
              </button>
              <button className="command-button" onClick={() => jsonInput.current?.click()}>
                <FileJson size={16} />
                Restore
              </button>
              <button className="command-button" onClick={() => exportCurrentYearToExcel(snapshot)}>
                <FileSpreadsheet size={16} />
                Year
              </button>
              <button className="command-button" onClick={() => exportAllYearsToExcel(snapshot)}>
                <Download size={16} />
                All
              </button>
              <button className="command-button" onClick={() => exportJson(snapshot)}>
                <FileJson size={16} />
                JSON
              </button>
            </div>
            <button
              className="danger-soft"
              onClick={() => {
                if (window.confirm("Reset local data back to the imported seed budget?")) void resetToSeed();
              }}
            >
              <RefreshCw size={15} />
              Reset seed
            </button>
          </section>
        </>
      )}
    </aside>
  );
}

function Header({ calculation, setRolloverOpen }: { calculation: BudgetCalculation; setRolloverOpen: (value: boolean) => void }) {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const updateSettings = useBudgetStore((state) => state.updateSettings);
  const selectYear = useBudgetStore((state) => state.selectYear);
  const undo = useBudgetStore((state) => state.undo);
  const redo = useBudgetStore((state) => state.redo);
  const currentYear = snapshot.settings.selectedYear;
  const maxWeeks = weeksInIsoYear(currentYear);
  const yearOptions = Array.from(new Set([currentYear - 1, currentYear, currentYear + 1, 2026, 2027, 2028, 2029, 2030, ...Object.keys(snapshot.years).map(Number)])).sort(
    (a, b) => a - b,
  );

  const latestAudit = snapshot.auditLog[0];

  function moveMonth(delta: number) {
    let nextMonth = snapshot.settings.selectedMonth + delta;
    let nextYear = currentYear;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    }
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    if (nextYear !== currentYear) selectYear(nextYear);
    updateSettings({ selectedMonth: nextMonth });
  }

  function moveWeek(delta: number) {
    let nextWeek = snapshot.settings.selectedWeek + delta;
    let nextYear = currentYear;
    if (nextWeek < 1) {
      nextYear -= 1;
      nextWeek = weeksInIsoYear(nextYear);
    }
    if (nextWeek > maxWeeks) {
      nextYear += 1;
      nextWeek = 1;
    }
    if (nextYear !== currentYear) selectYear(nextYear);
    updateSettings({ selectedWeek: nextWeek });
  }

  return (
    <header className="top-header">
      <div className="header-title">
        <p className="eyebrow">Current period</p>
        <h1>
          {monthName(calculation.month)} {calculation.year}
        </h1>
        <div className="period-meta">
          <Badge tone={calculation.selectedMonthSpend.status === "nan" ? "danger" : "neutral"}>{statusLabel(calculation.selectedMonthSpend.status)}</Badge>
          <span>Week {calculation.week}</span>
          <span>{snapshot.settings.selectedSeason}</span>
        </div>
      </div>

      <div className="period-switcher" aria-label="Period controls">
        <button className="icon-button" title="Previous month" onClick={() => moveMonth(-1)}>
          <ChevronLeft size={17} />
        </button>
        <div className="compact-period-controls">
          <label>
            <span>Month</span>
            <select value={snapshot.settings.selectedMonth} onChange={(event) => updateSettings({ selectedMonth: Number(event.target.value) })}>
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Week</span>
            <select value={snapshot.settings.selectedWeek} onChange={(event) => updateSettings({ selectedWeek: Number(event.target.value) })}>
              {Array.from({ length: maxWeeks }, (_, index) => index + 1).map((week) => (
                <option key={week} value={week}>
                  Week {week}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Year</span>
            <select value={currentYear} onChange={(event) => selectYear(Number(event.target.value))}>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="icon-button" title="Next month" onClick={() => moveMonth(1)}>
          <ChevronRight size={17} />
        </button>
        <div className="week-buttons">
          <button className="soft-button compact" onClick={() => moveWeek(-1)}>
            <ChevronLeft size={15} />
            Week
          </button>
          <button className="soft-button compact" onClick={() => moveWeek(1)}>
            Week
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="header-actions">
        <LiveClock />
        <div className="timestamp">
          <span>Last updated</span>
          <strong>{formatDateTime(snapshot.settings.lastUpdated)}</strong>
        </div>
        {latestAudit && (
          <div className="recent-change">
            <span>Recent change</span>
            <strong title={latestAudit.summary}>{latestAudit.summary}</strong>
          </div>
        )}
        <button className="icon-button" title="Changelog" onClick={() => window.dispatchEvent(new CustomEvent("open-changelog"))}>
          <History size={17} />
        </button>
        <select className="currency-pill" value={snapshot.settings.baseCurrency} onChange={(event) => updateSettings({ baseCurrency: event.target.value as CurrencyCode })} title="Base currency">
          {CURRENCY_OPTIONS.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
        <button className="icon-button" title={snapshot.settings.darkMode ? "Light mode" : "Dark mode"} onClick={() => updateSettings({ darkMode: !snapshot.settings.darkMode })}>
          {snapshot.settings.darkMode ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button className="icon-button" title="Undo (Ctrl+Z)" onClick={undo}>
          <Undo2 size={17} />
        </button>
        <button className="icon-button" title="Redo (Ctrl+Y)" onClick={redo}>
          <Redo2 size={17} />
        </button>
        <button className="primary-button" onClick={() => updateSettings({ lastUpdated: new Date().toISOString() })}>
          <Save size={17} />
          Save
        </button>
        <button className="primary-button warn" onClick={() => setRolloverOpen(true)}>
          <Wallet size={17} />
          Close Month
        </button>
      </div>
    </header>
  );
}

function LiveClock() {
  const enabled = useBudgetStore((state) => state.snapshot.settings.liveClockEnabled);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return (
    <div className="clock-card">
      <CalendarDays size={17} />
      <div>
        <span>{now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
        <strong>{enabled ? now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "Clock off"}</strong>
      </div>
    </div>
  );
}

function SummaryCards({ calculation }: { calculation: BudgetCalculation }) {
  const settings = useBudgetStore((state) => state.snapshot.settings);
  const spent = calculation.selectedMonthSpend.total;
  const progress = spent != null && calculation.monthlyBudgetBase > 0 ? Math.min(100, Math.max(0, (spent / calculation.monthlyBudgetBase) * 100)) : null;
  const cards = [
    { label: "Current budget", value: calculation.monthlyBudgetBase, accent: "blue", detail: "Approved monthly budget" },
    { label: "Remaining", value: calculation.delta, accent: calculation.delta != null && calculation.delta < 0 ? "rose" : "green", detail: "Budget minus spending" },
    { label: "Monthly spending", value: spent, accent: "rose", detail: statusLabel(calculation.selectedMonthSpend.status) },
    { label: "Recurring expenses", value: calculation.generalBudget, accent: "amber", detail: "Active recurring, no piloting" },
    { label: "Wallet", value: calculation.wallet.personalWalletTotal, accent: "cyan", detail: "Personal wallet" },
    { label: "Budget progress", value: progress, accent: "violet", detail: progress == null ? "Pending" : `${Math.round(progress)}% used`, progress: true },
  ];
  return (
    <section className="summary-grid compact-summary">
      {cards.map((card) => (
        <article key={card.label} className={`summary-card ${card.accent}`}>
          <span>{card.label}</span>
          <strong>
            {card.progress
              ? card.value == null
                ? "Pending"
                : `${Math.round(card.value)}%`
              : formatDualMoney(card.value, settings, { showSign: card.label === "Remaining" })}
          </strong>
          {card.progress && card.value != null && (
            <div className="progress-track">
              <div style={{ width: `${card.value}%` }} />
            </div>
          )}
          <small>{card.detail}</small>
        </article>
      ))}
      <article className="summary-card split-card">
        <span>Budget split</span>
        <div className="split-row">
          <strong>{formatDualMoney(calculation.generalBudget, settings)}</strong>
          <small>General</small>
        </div>
        <div className="split-row">
          <strong>{formatDualMoney(calculation.pilotingBudget, settings)}</strong>
          <small>Piloting</small>
        </div>
      </article>
    </section>
  );
}

function BudgetSuggestionPanel() {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const recordBudgetApproval = useBudgetStore((state) => state.recordBudgetApproval);
  const suggestion = useMemo(() => calculateSuggestedMonthlyBudget(snapshot), [snapshot]);
  const existing = snapshot.budgetApprovals.find(
    (approval) => approval.year === snapshot.settings.selectedYear && approval.month === snapshot.settings.selectedMonth,
  );
  const [editedAmount, setEditedAmount] = useState(String(suggestion.suggestedAmount));
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    setEditedAmount(String(suggestion.suggestedAmount));
  }, [suggestion.suggestedAmount, snapshot.settings.selectedYear, snapshot.settings.selectedMonth]);

  useEffect(() => {
    // Auto-open modal at start of month or when user navigates to current month with no approval
    if (!existing && isViewingCurrentMonth(snapshot.settings)) {
      setShowModal(true);
    }

    // Listen for explicit open events (month boundary detector)
    const onOpen = () => {
      if (!existing && isViewingCurrentMonth(snapshot.settings)) setShowModal(true);
    };
    window.addEventListener("open-budget-suggestion", onOpen as EventListener);
    return () => window.removeEventListener("open-budget-suggestion", onOpen as EventListener);
  }, [existing, snapshot.settings.selectedYear, snapshot.settings.selectedMonth]);

  const approvedAmount = parseAmount(editedAmount);
  const noActiveRecurring = suggestion.recurringTotal === 0;

  function doRecord(status: "approved" | "rejected") {
    recordBudgetApproval({
      year: snapshot.settings.selectedYear,
      month: snapshot.settings.selectedMonth,
      suggestedAmount: suggestion.suggestedAmount,
      approvedAmount: status === "approved" ? approvedAmount : null,
      currency: snapshot.settings.baseCurrency,
      status,
      recurringTotal: suggestion.recurringTotal,
      note: status === "approved" ? "Approved from dashboard suggestion." : "Rejected from dashboard suggestion.",
    });
    setShowModal(false);
  }

  if (existing || !isViewingCurrentMonth(snapshot.settings)) {
    return existing ? (
      <section className={`budget-suggestion ${existing.status}`}>
        <div>
          <p className="eyebrow">Monthly budget approval</p>
          <h2>{existing.status === "approved" ? "Budget approved" : "Suggestion rejected"}</h2>
          <span>
            {monthName(existing.month)} {existing.year} · {formatDualMoney(existing.approvedAmount ?? existing.suggestedAmount, snapshot.settings)}
          </span>
        </div>
        <Badge tone={existing.status === "approved" ? "success" : "neutral"}>{existing.status}</Badge>
      </section>
    ) : null;
  }

  return (
    <>
      <section className="budget-suggestion">
        <div>
          <p className="eyebrow">Monthly budget approval</p>
          <h2>Suggested budget for {monthName(snapshot.settings.selectedMonth)}</h2>
          <span>
            Based on active recurring expenses excluding piloting: {formatDualMoney(suggestion.recurringTotal, snapshot.settings)}.
            {noActiveRecurring ? (
              <> Use the edit field below to set a starting budget for this month.</>
            ) : (
              <> Rounded up to <strong>{formatDualMoney(suggestion.suggestedAmount, snapshot.settings)}</strong>.</>
            )}
          </span>
        </div>
        <div className="suggestion-controls">
          <label>
            Edit suggestion
            <input inputMode="decimal" value={editedAmount} onChange={(event) => setEditedAmount(event.target.value)} />
          </label>
          <button className="primary-button" disabled={approvedAmount == null} onClick={() => doRecord("approved")}>
            Approve
          </button>
          <button className="soft-button compact" onClick={() => doRecord("rejected")}>
            Reject
          </button>
          <button className="soft-button compact" onClick={() => setShowModal(true)}>
            Open modal
          </button>
        </div>
      </section>

      {showModal && (
        <Modal title={`Approve suggested budget for ${monthName(snapshot.settings.selectedMonth)}`} onClose={() => setShowModal(false)}>
          <div className="modal-summary">
            <div>
              <p className="eyebrow">Suggested amount</p>
              <h2>{formatDualMoney(suggestion.suggestedAmount, snapshot.settings)}</h2>
              <p>Based on recurring total {formatDualMoney(suggestion.recurringTotal, snapshot.settings)}</p>
            </div>
          </div>
          <label>
            Final approved amount
            <input inputMode="decimal" value={editedAmount} onChange={(event) => setEditedAmount(event.target.value)} />
          </label>
          <div className="modal-actions">
            <button className="soft-button compact" onClick={() => setShowModal(false)}>
              Cancel
            </button>
            <button className="soft-button compact" onClick={() => doRecord("rejected")}>
              Reject
            </button>
            <button className="primary-button" disabled={parseAmount(editedAmount) == null} onClick={() => doRecord("approved")}>
              Approve
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function ActivityPanel({ filters, calculation }: { filters: Filters; calculation: BudgetCalculation }) {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const record = snapshot.years[String(snapshot.settings.selectedYear)];
  const addActivity = useBudgetStore((state) => state.addActivity);
  const updateActivity = useBudgetStore((state) => state.updateActivity);
  const removeActivity = useBudgetStore((state) => state.removeActivity);
  const duplicateActivity = useBudgetStore((state) => state.duplicateActivity);
  const moveActivity = useBudgetStore((state) => state.moveActivity);
  const [editorActivity, setEditorActivity] = useState<Activity | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState<"order" | "name" | "cost">("order");
  const estimateMap = new Map(calculation.activityEstimates.map((item) => [item.activity.id, item]));
  const activities = record.activities
    .filter((activity) => matchesActivityFilters(activity, filters))
    .filter((activity) => (showArchived ? !activity.active || !activity.visible : activity.active && activity.visible))
    .sort((a, b) => sortActivities(a, b, sortBy, estimateMap));

  function saveDraft(draft: ActivityDraft, existing?: Activity) {
    const payload = activityPayloadFromDraft(draft);
    if (existing) {
      updateActivity(existing.id, payload);
    } else {
      addActivity(payload);
    }
    setEditorActivity(null);
    setCreating(false);
  }

  return (
    <div className="panel-stack">
      <div className="section-toolbar">
        <div>
          <p className="eyebrow">Activity plan</p>
          <h2>Recurring costs without the spreadsheet fog</h2>
        </div>
        <div className="toolbar-actions">
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}>
            <option value="order">Manual order</option>
            <option value="name">Name</option>
            <option value="cost">Monthly cost</option>
          </select>
          <button className={showArchived ? "soft-button active compact" : "soft-button compact"} onClick={() => setShowArchived(!showArchived)}>
            <Archive size={16} />
            {showArchived ? "Archived" : "Active"}
          </button>
          <button className="primary-button" onClick={() => setCreating(true)}>
            <Plus size={17} />
            Create activity
          </button>
        </div>
      </div>

      <div className="activity-grid">
        {activities.map((activity) => {
          const estimate = estimateMap.get(activity.id);
          const category = snapshot.categories.find((item) => item.id === activity.categoryId);
          const archived = !activity.active || !activity.visible;
          return (
            <article key={activity.id} className={archived ? "activity-card archived" : "activity-card"}>
              <div className="card-topline">
                <div>
                  <h3>{activity.name}</h3>
                  <div className="card-meta">
                    <Badge tone={category?.bucket === "piloting" ? "info" : "neutral"}>{category?.name ?? "Other"}</Badge>
                    <Badge tone={archived ? "danger" : "success"}>{archived ? "Archived" : "Active"}</Badge>
                  </div>
                </div>
                <NoteButton value={activity.notes} onSave={(notes) => updateActivity(activity.id, { notes })} />
              </div>
              <div className="activity-cost">
                <span>{activityPrimaryCostLabel(activity)}</span>
                <strong>{activityPrimaryCost(activity, snapshot)}</strong>
              </div>
              <div className="impact-grid">
                <div>
                  <span>Monthly impact</span>
                  <strong>{formatMoney(estimate?.monthlyBase ?? 0, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)}</strong>
                </div>
                <div>
                  <span>Yearly impact</span>
                  <strong>{formatMoney(estimate?.yearlyBase ?? 0, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)}</strong>
                </div>
              </div>
              <div className="card-meta">
                <Badge tone="neutral">{activity.recurrenceType}</Badge>
                <Badge tone="neutral">Every {activity.recurrenceInterval}</Badge>
                <Badge tone="neutral">{activity.seasonalTag}</Badge>
              </div>
              <div className="card-actions">
                <button className="icon-button" title="Move up" onClick={() => moveActivity(activity.id, -1)}>
                  <ChevronLeft size={15} />
                </button>
                <button className="icon-button" title="Move down" onClick={() => moveActivity(activity.id, 1)}>
                  <ChevronRight size={15} />
                </button>
                <button className="icon-button" title="Duplicate" onClick={() => duplicateActivity(activity.id)}>
                  <Copy size={15} />
                </button>
                <button className="icon-button" title="Edit" onClick={() => setEditorActivity(activity)}>
                  <Pencil size={15} />
                </button>
                <button className="icon-button" title={archived ? "Restore" : "Archive"} onClick={() => updateActivity(activity.id, archived ? { active: true, visible: true } : { active: false, visible: false })}>
                  {archived ? <Eye size={15} /> : <Archive size={15} />}
                </button>
                <button
                  className="icon-button danger"
                  title="Delete permanently"
                  onClick={() => {
                    if (window.confirm(`Delete ${activity.name} permanently? Use Archive if you only want to hide it.`)) removeActivity(activity.id);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {activities.length === 0 && <EmptyState title={showArchived ? "No archived activities." : "No active activities match this view."} detail="Use Create activity or loosen the filters." />}
      {(creating || editorActivity) && <ActivityEditorModal activity={editorActivity} onClose={() => { setCreating(false); setEditorActivity(null); }} onSave={saveDraft} />}
    </div>
  );
}

function ActivityEditorModal({ activity, onClose, onSave }: { activity: Activity | null; onClose: () => void; onSave: (draft: ActivityDraft, existing?: Activity) => void }) {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const [draft, setDraft] = useState<ActivityDraft>(() => activityToDraft(activity, snapshot));
  const previewActivity = { ...activityPayloadFromDraft(draft), id: activity?.id ?? "preview", order: activity?.order ?? 0 };
  const monthlyNative = monthlyEstimateNative(previewActivity);
  const yearlyNative = yearlyEstimateNative(previewActivity, monthlyNative);
  const monthlyBase = normalizeAmount(monthlyNative, draft.currency, snapshot.settings);
  const yearlyBase = normalizeAmount(yearlyNative, draft.currency, snapshot.settings);

  return (
    <Modal title={activity ? "Edit activity" : "Create activity"} onClose={onClose}>
      <form
        className="editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.name.trim()) return;
          onSave(draft, activity ?? undefined);
        }}
      >
        <label className="wide-field">
          Name
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Activity name" />
        </label>
        <label>
          Category
          <select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>
            {snapshot.categories
              .filter((category) => category.bucket !== "wallet")
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Currency
          <select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value as CurrencyCode })}>
            {CURRENCY_OPTIONS.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
        <label>
          Recurrence
          <select value={draft.recurrenceType} onChange={(event) => setDraft({ ...draft, recurrenceType: event.target.value as RecurrenceType })}>
            {recurrenceTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Frequency
          <input type="number" min="1" value={draft.recurrenceInterval} onChange={(event) => setDraft({ ...draft, recurrenceInterval: Number(event.target.value) || 1 })} />
        </label>
        <label>
          Per session
          <input inputMode="decimal" value={draft.pricePerSession} onChange={(event) => setDraft({ ...draft, pricePerSession: event.target.value })} />
        </label>
        <label>
          Per month
          <input inputMode="decimal" value={draft.pricePerMonth} onChange={(event) => setDraft({ ...draft, pricePerMonth: event.target.value })} />
        </label>
        <label>
          Per purchase
          <input inputMode="decimal" value={draft.pricePerPurchase} onChange={(event) => setDraft({ ...draft, pricePerPurchase: event.target.value })} />
        </label>
        <label>
          Per year
          <input inputMode="decimal" value={draft.yearlyEstimate} onChange={(event) => setDraft({ ...draft, yearlyEstimate: event.target.value })} />
        </label>
        <label>
          Season
          <input value={draft.seasonalTag} onChange={(event) => setDraft({ ...draft, seasonalTag: event.target.value })} />
        </label>
        <div className="check-cluster">
          <label className="check-row">
            <input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />
            Active
          </label>
          <label className="check-row">
            <input type="checkbox" checked={draft.visible} onChange={(event) => setDraft({ ...draft, visible: event.target.checked })} />
            Visible
          </label>
        </div>
        <label className="wide-field">
          Notes
          <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Optional private note" />
        </label>
        <div className="equivalent-panel">
          <div>
            <span>Monthly equivalent</span>
            <strong>{formatMoney(monthlyBase, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)}</strong>
          </div>
          <div>
            <span>Yearly equivalent</span>
            <strong>{formatMoney(yearlyBase, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)}</strong>
          </div>
        </div>
        <div className="modal-actions wide-field">
          <button type="button" className="soft-button compact" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button">
            <Save size={17} />
            Save activity
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SpendingPanel({ filters, calculation }: { filters: Filters; calculation: BudgetCalculation }) {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const record = snapshot.years[String(snapshot.settings.selectedYear)];
  const addSpendingEntry = useBudgetStore((state) => state.addSpendingEntry);
  const updateSpendingEntry = useBudgetStore((state) => state.updateSpendingEntry);
  const removeSpendingEntry = useBudgetStore((state) => state.removeSpendingEntry);
  const [draft, setDraft] = useState({
    date: dateInputValue(new Date()),
    amount: "",
    currency: snapshot.settings.baseCurrency,
    categoryId: "cat-spending",
    activityId: "",
    isPiloting: false,
    source: "personal",
    note: "",
  });
  const entries = record.spendingEntries
    .filter((entry) => entry.month === snapshot.settings.selectedMonth)
    .filter((entry) => matchesEntryFilters(entry, filters))
    .sort((a, b) => a.date.localeCompare(b.date));

  function submitDraft(event: FormEvent) {
    event.preventDefault();
    const amount = parseAmount(draft.amount);
    if (amount == null) return;
    addSpendingEntry({
      year: snapshot.settings.selectedYear,
      month: monthFromDateInput(draft.date),
      week: weekFromDateInput(draft.date),
      date: draft.date,
      categoryId: draft.categoryId,
      activityId: draft.activityId || undefined,
      amount,
      currency: draft.currency as CurrencyCode,
      recurrenceType: "none",
      isPiloting: draft.isPiloting,
      source: draft.source,
      note: draft.note,
    });
    setDraft({ ...draft, amount: "", note: "" });
  }

  function markSelectedWeekZero() {
    const date = dateInputValue(startOfIsoWeek(snapshot.settings.selectedYear, snapshot.settings.selectedWeek));
    addSpendingEntry({
      year: snapshot.settings.selectedYear,
      month: monthFromDateInput(date),
      week: snapshot.settings.selectedWeek,
      date,
      categoryId: "cat-spending",
      amount: 0,
      currency: snapshot.settings.baseCurrency,
      recurrenceType: "none",
      isPiloting: false,
      note: "Explicit zero spend marker. This keeps 0 distinct from NaN.",
    });
  }

  return (
    <div className="panel-stack">
      <div className="section-toolbar">
        <div>
          <p className="eyebrow">Spending</p>
          <h2>Quick entries for {monthName(snapshot.settings.selectedMonth)}</h2>
        </div>
        <div className="toolbar-actions">
          <Badge tone={calculation.selectedWeekSpend.status === "nan" ? "danger" : "neutral"}>Week: {statusLabel(calculation.selectedWeekSpend.status)}</Badge>
          <button className="soft-button compact" onClick={markSelectedWeekZero}>
            <Plus size={15} />
            Mark week 0
          </button>
        </div>
      </div>
      <form className="quick-add spending-add" onSubmit={submitDraft}>
        <input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
            <input inputMode="decimal" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} placeholder="Amount, 0 allowed" />
        <select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value as CurrencyCode })}>
          {CURRENCY_OPTIONS.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
        <select
          value={draft.categoryId}
          onChange={(event) => {
            const category = snapshot.categories.find((item) => item.id === event.target.value);
            setDraft({ ...draft, categoryId: event.target.value, isPiloting: category?.bucket === "piloting" });
          }}
        >
          {snapshot.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select value={draft.activityId} onChange={(event) => setDraft({ ...draft, activityId: event.target.value })}>
          <option value="">No activity</option>
          {record.activities.map((activity) => (
            <option key={activity.id} value={activity.id}>
              {activity.name}
            </option>
          ))}
        </select>
        <label>
          Source
          <select value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })}>
            <option value="personal">Personal (my budget)</option>
            <option value="shared">Shared / split</option>
            <option value="external">External / reimbursed</option>
          </select>
        </label>
        <label className="check-row compact">
          <input type="checkbox" checked={draft.isPiloting} onChange={(event) => setDraft({ ...draft, isPiloting: event.target.checked })} />
          Pilot
        </label>
        <NoteButton value={draft.note} onSave={(note) => setDraft({ ...draft, note })} />
        <button className="primary-button" type="submit">
          <Plus size={17} />
          Add
        </button>
      </form>

      <div className="table-shell clean-table-shell">
        <table className="data-table compact-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Week</th>
              <th>Category</th>
              <th>Activity</th>
              <th>Amount</th>
              <th>Source</th>
              <th>Pilot</th>
              <th>Note</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
              <td>
                <input type="date" value={entry.date} onChange={(event) => updateSpendingEntry(entry.id, { date: event.target.value })} />
              </td>
              <td>
                <Badge tone={entry.week === snapshot.settings.selectedWeek ? "info" : "neutral"}>Week {entry.week}</Badge>
              </td>
              <td>
                <select value={entry.categoryId} onChange={(event) => updateSpendingEntry(entry.id, { categoryId: event.target.value })}>
                  {snapshot.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select value={entry.activityId ?? ""} onChange={(event) => updateSpendingEntry(entry.id, { activityId: event.target.value || undefined })}>
                  <option value="">No activity</option>
                  {record.activities.map((activity) => (
                    <option key={activity.id} value={activity.id}>
                      {activity.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="money-edit">
                <input inputMode="decimal" value={entry.amount} onChange={(event) => updateSpendingEntry(entry.id, { amount: Number(event.target.value) })} />
                <select value={entry.currency} onChange={(event) => updateSpendingEntry(entry.id, { currency: event.target.value as CurrencyCode })}>
                  {CURRENCY_OPTIONS.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select value={entry.source ?? 'personal'} onChange={(event) => updateSpendingEntry(entry.id, { source: event.target.value })}>
                  <option value="personal">Personal</option>
                  <option value="shared">Shared</option>
                  <option value="external">External</option>
                </select>
              </td>
              <td>
                <input type="checkbox" checked={entry.isPiloting} onChange={(event) => updateSpendingEntry(entry.id, { isPiloting: event.target.checked })} />
              </td>
              <td>
                <NoteButton value={entry.note} onSave={(note) => updateSpendingEntry(entry.id, { note })} />
              </td>
              <td>
                <button
                  className="icon-button danger"
                  title="Delete"
                  onClick={() => {
                    if (window.confirm("Delete this spending entry?")) removeSpendingEntry(entry.id);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && <EmptyState title="No spending entries in this month." detail="A closed empty month will show NaN. Use Mark week 0 only when the real value is zero." />}
      </div>
    </div>
  );
}

function WishlistPanel({ filters }: { filters: Filters }) {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const record = snapshot.years[String(snapshot.settings.selectedYear)];
  const addWishlistItem = useBudgetStore((state) => state.addWishlistItem);
  const updateWishlistItem = useBudgetStore((state) => state.updateWishlistItem);
  const removeWishlistItem = useBudgetStore((state) => state.removeWishlistItem);
  const [view, setView] = useState<WishlistView>("active");
  const [editing, setEditing] = useState<WishlistItem | null>(null);
  const [creating, setCreating] = useState(false);
  const items = record.wishlistItems
    .filter((item) => matchesWishlistFilters(item, filters))
    .filter((item) => wishlistViewMatches(item, view))
    .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || Number(a.bought) - Number(b.bought));

  function saveDraft(draft: WishlistDraft, existing?: WishlistItem) {
    const actualPrice = parseAmount(draft.actualPrice);
    const payload = {
      name: draft.name.trim(),
      categoryId: "cat-wishlist",
      actualPrice,
      effectiveValue: draft.active && draft.inWishlist && !draft.bought && actualPrice != null ? actualPrice : 0,
      currency: draft.currency,
      bought: draft.bought,
      inWishlist: draft.bought ? false : draft.inWishlist,
      priority: draft.priority,
      notes: draft.notes,
      active: draft.active,
    };
    if (existing) {
      updateWishlistItem(existing.id, payload);
    } else {
      addWishlistItem(payload);
    }
    setEditing(null);
    setCreating(false);
  }

  return (
    <div className="panel-stack">
      <div className="section-toolbar">
        <div>
          <p className="eyebrow">Wishlist</p>
          <h2>Active wants, purchases, and history</h2>
        </div>
        <div className="toolbar-actions">
          <div className="segmented-control">
            {(["active", "purchased", "archived", "all"] as WishlistView[]).map((item) => (
              <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>
                {item}
              </button>
            ))}
          </div>
          <button className="primary-button" onClick={() => setCreating(true)}>
            <Plus size={17} />
            Add item
          </button>
        </div>
      </div>

      <div className="wishlist-grid">
        {items.map((item) => (
          <article key={item.id} className={!item.active ? "wishlist-card archived" : "wishlist-card"}>
            <div className="card-topline">
              <div>
                <h3>{item.name}</h3>
                <div className="card-meta">
                  <Badge tone={item.bought ? "success" : item.inWishlist ? "info" : "neutral"}>{item.bought ? "Purchased" : item.inWishlist ? "Wishlist" : "History"}</Badge>
                  <Badge tone="neutral">{item.priority}</Badge>
                </div>
              </div>
              <NoteButton value={item.notes} onSave={(notes) => updateWishlistItem(item.id, { notes })} />
            </div>
            <div className="activity-cost">
              <span>Actual price</span>
              <strong>{formatMoney(normalizeAmount(item.actualPrice, item.currency, snapshot.settings), snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)}</strong>
            </div>
            <div className="impact-grid">
              <div>
                <span>Effective</span>
                <strong>{formatMoney(normalizeAmount(item.effectiveValue, item.currency, snapshot.settings), snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)}</strong>
              </div>
              <div>
                <span>Added</span>
                <strong>{formatDateTime(item.dateAdded)}</strong>
              </div>
            </div>
            <div className="check-cluster inline">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={item.bought}
                  onChange={(event) => updateWishlistItem(item.id, { bought: event.target.checked, inWishlist: event.target.checked ? false : item.inWishlist })}
                />
                Bought
              </label>
              <label className="check-row">
                <input type="checkbox" checked={item.inWishlist} onChange={(event) => updateWishlistItem(item.id, { inWishlist: event.target.checked })} />
                Active list
              </label>
            </div>
            <div className="card-actions">
              <button className="icon-button" title="Edit" onClick={() => setEditing(item)}>
                <Pencil size={15} />
              </button>
              <button className="icon-button" title={item.active ? "Archive" : "Restore"} onClick={() => updateWishlistItem(item.id, item.active ? { active: false, inWishlist: false } : { active: true })}>
                {item.active ? <Archive size={15} /> : <Eye size={15} />}
              </button>
              <button
                className="icon-button danger"
                title="Delete permanently"
                onClick={() => {
                  if (window.confirm(`Delete ${item.name} permanently? Archiving keeps history.`)) removeWishlistItem(item.id);
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {items.length === 0 && <EmptyState title="Nothing in this wishlist view." detail="Purchased items stay searchable and are flushed from the active list when a new year is created." />}
      {(creating || editing) && <WishlistEditorModal item={editing} onClose={() => { setCreating(false); setEditing(null); }} onSave={saveDraft} />}
    </div>
  );
}

function WishlistEditorModal({ item, onClose, onSave }: { item: WishlistItem | null; onClose: () => void; onSave: (draft: WishlistDraft, existing?: WishlistItem) => void }) {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const [draft, setDraft] = useState<WishlistDraft>(() => wishlistToDraft(item, snapshot));
  const actualPrice = parseAmount(draft.actualPrice);
  const effective = draft.active && draft.inWishlist && !draft.bought ? actualPrice : 0;

  return (
    <Modal title={item ? "Edit wishlist item" : "Add wishlist item"} onClose={onClose}>
      <form
        className="editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.name.trim()) return;
          onSave(draft, item ?? undefined);
        }}
      >
        <label className="wide-field">
          Name
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <label>
          Price
          <input inputMode="decimal" value={draft.actualPrice} onChange={(event) => setDraft({ ...draft, actualPrice: event.target.value })} />
        </label>
        <label>
          Currency
          <select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value as CurrencyCode })}>
            {CURRENCY_OPTIONS.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as WishlistItem["priority"] })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="dream">Dream</option>
          </select>
        </label>
        <div className="check-cluster">
          <label className="check-row">
            <input type="checkbox" checked={draft.bought} onChange={(event) => setDraft({ ...draft, bought: event.target.checked, inWishlist: event.target.checked ? false : draft.inWishlist })} />
            Bought
          </label>
          <label className="check-row">
            <input type="checkbox" checked={draft.inWishlist} onChange={(event) => setDraft({ ...draft, inWishlist: event.target.checked })} />
            In wishlist
          </label>
          <label className="check-row">
            <input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />
            Active
          </label>
        </div>
        <label className="wide-field">
          Notes
          <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        </label>
        <div className="equivalent-panel wide-field">
          <div>
            <span>Effective value</span>
            <strong>{formatMoney(normalizeAmount(effective, draft.currency, snapshot.settings), snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{draft.bought ? "Purchased" : draft.inWishlist ? "Active wishlist" : "History"}</strong>
          </div>
        </div>
        <div className="modal-actions wide-field">
          <button type="button" className="soft-button compact" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button">
            <Save size={17} />
            Save item
          </button>
        </div>
      </form>
    </Modal>
  );
}

function WalletPanel({ calculation, openRollover }: { calculation: BudgetCalculation; openRollover: () => void }) {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const record = snapshot.years[String(snapshot.settings.selectedYear)];
  const addWalletEntry = useBudgetStore((state) => state.addWalletEntry);
  const updateWalletEntry = useBudgetStore((state) => state.updateWalletEntry);
  const removeWalletEntry = useBudgetStore((state) => state.removeWalletEntry);
  const [draft, setDraft] = useState({ amount: "", currency: snapshot.settings.baseCurrency, source: "", type: "personal" as WalletEntry["type"], note: "" });

  function submitDraft(event: FormEvent) {
    event.preventDefault();
    const amount = parseAmount(draft.amount);
    if (amount == null) return;
    addWalletEntry({
      year: snapshot.settings.selectedYear,
      month: snapshot.settings.selectedMonth,
      amount,
      currency: draft.currency as CurrencyCode,
      source: draft.source || "Manual wallet entry",
      type: draft.type,
      note: draft.note,
    });
    setDraft({ ...draft, amount: "", source: "", note: "" });
  }

  return (
    <div className="panel-stack">
      <div className="wallet-overview">
        <SummaryMini label="Wallet total" value={calculation.wallet.walletTotal} />
        <SummaryMini label="Personal wallet" value={calculation.wallet.personalWalletTotal} />
        <SummaryMini label="Rollover total" value={calculation.wallet.rolloverTotal} />
        <button className="primary-button warn" onClick={openRollover}>
          <Wallet size={17} />
          Month close
        </button>
      </div>
      <form className="quick-add" onSubmit={submitDraft}>
        <input inputMode="decimal" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} placeholder="Wallet amount" />
        <select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value as CurrencyCode })}>
          {CURRENCY_OPTIONS.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
        <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as WalletEntry["type"] })}>
          <option value="personal">Personal</option>
          <option value="budget">Budget</option>
          <option value="rollover">Rollover</option>
          <option value="adjustment">Adjustment</option>
        </select>
        <input value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })} placeholder="Source" />
        <NoteButton value={draft.note} onSave={(note) => setDraft({ ...draft, note })} />
        <button className="primary-button" type="submit">
          <Plus size={17} />
          Add
        </button>
      </form>
      <div className="table-shell clean-table-shell">
        <table className="data-table compact-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Amount</th>
              <th>Source</th>
              <th>Type</th>
              <th>Note</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {record.walletEntries.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <select value={entry.month} onChange={(event) => updateWalletEntry(entry.id, { month: Number(event.target.value) })}>
                    {MONTH_NAMES.map((name, index) => (
                      <option key={name} value={index + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="money-edit">
                  <input inputMode="decimal" value={entry.amount} onChange={(event) => updateWalletEntry(entry.id, { amount: Number(event.target.value) })} />
                  <select value={entry.currency} onChange={(event) => updateWalletEntry(entry.id, { currency: event.target.value as CurrencyCode })}>
                    {CURRENCY_OPTIONS.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input value={entry.source} onChange={(event) => updateWalletEntry(entry.id, { source: event.target.value })} />
                </td>
                <td>
                  <select value={entry.type} onChange={(event) => updateWalletEntry(entry.id, { type: event.target.value as WalletEntry["type"] })}>
                    <option value="opening">Opening</option>
                    <option value="personal">Personal</option>
                    <option value="budget">Budget</option>
                    <option value="rollover">Rollover</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                </td>
                <td>
                  <NoteButton value={entry.note} onSave={(note) => updateWalletEntry(entry.id, { note })} />
                </td>
                <td>{formatDateTime(entry.createdAt)}</td>
                <td>
                  <button
                    className="icon-button danger"
                    title="Delete"
                    onClick={() => {
                      if (window.confirm("Delete this wallet entry?")) removeWalletEntry(entry.id);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnalyticsPanel({ calculation }: { calculation: BudgetCalculation }) {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const record = snapshot.years[String(snapshot.settings.selectedYear)];
  const [includeExternal, setIncludeExternal] = useState(false);
  const selected = (includeExternal ? calculation.selectedMonthSpend.total : calculation.selectedMonthSpend.personalTotal ?? calculation.selectedMonthSpend.total) ?? null;
  const previous = calculation.month > 1 ? calculation.monthlyTrend[calculation.month - 2] : null;
  const previousValue = (includeExternal ? previous?.total : previous?.personalTotal ?? previous?.total) ?? null;
  const change = selected != null && previousValue != null ? selected - previousValue : null;
  const weeklyData = calculation.weeklyTrend.slice(0, Math.max(calculation.week, 12)).map((summary) => ({
    name: `W${summary.week}`,
    total: summary.status === "value" || summary.status === "zero" ? summary.total : null,
  }));
  const categoryData = calculation.categoryTotals.map((item) => ({ ...item, name: item.categoryName }));
  const normalCategoryData = categoryData.filter((item) => item.bucket !== "piloting");
  const normalCategoryTotal = normalCategoryData.reduce((total, item) => total + item.total, 0);
  // monthly data: prefer personal-only values when available so external/reimbursed spend does not distort analytics
  const monthlyData = calculation.monthlyTrend.map((summary) => ({
    name: summary.label.slice(0, 3),
    total: (summary.personalTotal ?? summary.total) as number | null,
    budget: calculation.monthlyBudgetBase,
    status: summary.status,
  }));
  const personalSelected = calculation.selectedMonthSpend.personalTotal ?? calculation.selectedMonthSpend.total ?? 0;
  const recurringVsActualData = [
    { name: "Recurring", value: calculation.generalBudget, color: "#2563EB" },
    { name: "Non-recurring", value: Math.max(0, personalSelected - calculation.generalBudget), color: "#DB2777" },
  ];
  let walletRunning = 0;
  const walletData = record.walletEntries
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((entry) => {
      walletRunning += normalizeAmount(entry.amount, entry.currency, snapshot.settings);
      return { name: `${monthName(entry.month).slice(0, 3)} ${entry.type}`, total: walletRunning };
    });

  return (
    <div className="panel-stack">
      <div className="insight-grid">
        <InsightCard label="Month vs previous" value={change == null ? "Pending" : formatMoney(change, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode, { showSign: true })} detail={previous ? `Compared with ${previous.label}` : "No previous month in this year"} tone={change != null && change > 0 ? "danger" : "success"} />
        <InsightCard label="Normal categories" value={`${normalCategoryData.length}`} detail="Piloting excluded from category share" tone="info" />
        <InsightCard label="YTD spend" value={formatMoney(calculation.ytdTotal, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)} detail="Selected year through current month" tone="neutral" />
        <InsightCard label="Wishlist pressure" value={formatMoney(calculation.wishlist.activeTotal, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)} detail={`${calculation.wishlist.activeCount} open items`} tone="neutral" />
      </div>

      <ScenarioLab />

      <div className="analytics-grid">
        <div className="analytics-controls" style={{ padding: 8 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={includeExternal} onChange={(e) => setIncludeExternal(e.target.checked)} />
            Include external / shared spend in analytics
          </label>
        </div>
        <ChartPanel title="Monthly spend vs budget">
          <ResponsiveContainer width="100%" height={270}>
            <ComposedChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => formatMoney(Number(value), snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)} />
              <Legend />
              <Area type="monotone" dataKey="total" name="Spend" stroke="#2563EB" fill="#BFDBFE" connectNulls={false} />
              <Line type="monotone" dataKey="budget" name="Budget" stroke="#16A34A" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Category breakdown">
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={normalCategoryData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => formatMoney(Number(value), snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)} />
              <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {normalCategoryData.map((entry) => (
                  <Cell key={entry.categoryId} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Weekly burn">
          <ResponsiveContainer width="100%" height={270}>
            <LineChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => formatMoney(Number(value), snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)} />
              <Line type="monotone" dataKey="total" stroke="#DB2777" strokeWidth={3} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Normal category share">
          <ResponsiveContainer width="100%" height={270}>
            <PieChart>
              <Pie data={normalCategoryData} dataKey="total" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={4}>
                {normalCategoryData.map((entry) => (
                  <Cell key={entry.categoryId} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => {
                  const numeric = Number(value);
                  const share = normalCategoryTotal > 0 ? ` (${Math.round((numeric / normalCategoryTotal) * 100)}%)` : "";
                  return `${formatMoney(numeric, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)}${share}`;
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Recurring vs non-recurring">
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={recurringVsActualData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => formatMoney(Number(value), snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {recurringVsActualData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Wallet trajectory">
          <ResponsiveContainer width="100%" height={270}>
            <LineChart data={walletData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => formatMoney(Number(value), snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)} />
              <Line type="monotone" dataKey="total" stroke="#0891B2" strokeWidth={3} dot />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>
    </div>
  );
}

function ScenarioLab() {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const addActivity = useBudgetStore((state) => state.addActivity);
  const [draft, setDraft] = useState({
    name: "Future plan",
    amount: "",
    currency: snapshot.settings.baseCurrency,
    recurrenceType: "monthly" as RecurrenceType,
    recurrenceInterval: 1,
    categoryId: "cat-other",
  });
  const amount = parseAmount(draft.amount);
  const scenario = activityPayloadFromDraft({
    name: draft.name,
    categoryId: draft.categoryId,
    currency: draft.currency as CurrencyCode,
    recurrenceType: draft.recurrenceType,
    recurrenceInterval: draft.recurrenceInterval,
    pricePerSession: draft.recurrenceType === "session" || draft.recurrenceType === "weekly" ? draft.amount : "",
    pricePerPurchase: draft.recurrenceType === "purchase" ? draft.amount : "",
    pricePerMonth: draft.recurrenceType === "monthly" || draft.recurrenceType === "custom" ? draft.amount : "",
    yearlyEstimate: draft.recurrenceType === "yearly" ? draft.amount : "",
    seasonalTag: snapshot.settings.selectedSeason,
    active: true,
    visible: true,
    notes: "Created from Scenario Lab.",
  });
  const monthly = amount == null ? null : normalizeAmount(monthlyEstimateNative({ ...scenario, id: "scenario", order: 0 }), scenario.currency, snapshot.settings);
  const yearly = amount == null ? null : normalizeAmount(yearlyEstimateNative({ ...scenario, id: "scenario", order: 0 }), scenario.currency, snapshot.settings);

  return (
    <section className="scenario-lab">
      <div>
        <p className="eyebrow">Scenario lab</p>
        <h2>Try a hypothetical expense before it touches the real budget</h2>
      </div>
      <div className="scenario-form">
        <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Scenario name" />
        <input inputMode="decimal" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} placeholder="Amount" />
        <select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value as CurrencyCode })}>
          {CURRENCY_OPTIONS.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
        <select value={draft.recurrenceType} onChange={(event) => setDraft({ ...draft, recurrenceType: event.target.value as RecurrenceType })}>
          {recurrenceTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input type="number" min="1" value={draft.recurrenceInterval} onChange={(event) => setDraft({ ...draft, recurrenceInterval: Number(event.target.value) || 1 })} />
        <select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>
          {snapshot.categories
            .filter((category) => category.bucket !== "wallet")
            .map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
        </select>
        <button
          className="primary-button"
          disabled={amount == null || !draft.name.trim()}
          onClick={() => {
            addActivity(scenario);
            setDraft({ ...draft, amount: "" });
          }}
        >
          <CheckCircle2 size={17} />
          Confirm as activity
        </button>
      </div>
      <div className="scenario-results">
        <div>
          <span>Monthly impact</span>
          <strong>{formatMoney(monthly, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)}</strong>
        </div>
        <div>
          <span>Yearly impact</span>
          <strong>{formatMoney(yearly, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)}</strong>
        </div>
      </div>
    </section>
  );
}

function HistoryPanel({ filters, setFilters }: { filters: Filters; setFilters: (filters: Filters) => void }) {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const updateCategory = useBudgetStore((state) => state.updateCategory);
  const record = snapshot.years[String(snapshot.settings.selectedYear)];
  const history = snapshot.auditLog.filter((entry) => `${entry.summary} ${entry.type}`.toLowerCase().includes(filters.historyQuery.toLowerCase()));

  function exportAuditCsv() {
    try {
      const rows = ["createdAt,type,summary,metadata"];
      for (const item of snapshot.auditLog) {
        const meta = item.metadata ? JSON.stringify(item.metadata).replace(/\"/g, '""') : "";
        rows.push(`"${item.createdAt}","${String(item.type)}","${String(item.summary).replace(/"/g, '""')}","${meta.replace(/"/g, '""')}"`);
      }
      const blob = new Blob([rows.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-${new Date().toISOString()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed.");
    }
  }

  function tryUndoArchive(item: any) {
    const catId = item.metadata && item.metadata.id;
    if (!catId) return;
    const category = snapshot.categories.find((c) => c.id === catId);
    if (!category || !category.archived) return;
    if (!window.confirm(`Restore category ${category.name}?`)) return;
      updateCategory(catId, { archived: false });
  }

  return (
    <div className="panel-stack">
      <div className="section-toolbar">
        <div>
          <p className="eyebrow">History</p>
          <h2>Rollovers, changes, and exports</h2>
        </div>
        <div className="toolbar-actions">
          <input value={filters.historyQuery} onChange={(event) => setFilters({ ...filters, historyQuery: event.target.value })} placeholder="Search history" />
          <button className="command-button compact" onClick={() => exportWishlistCsv(snapshot)}>
            <Download size={16} />
            Wishlist CSV
          </button>
          <button className="command-button compact" onClick={() => exportWalletCsv(snapshot)}>
            <Download size={16} />
            Wallet CSV
          </button>
          <button className="command-button compact" onClick={exportAuditCsv}>
            <Download size={16} />
            Audit CSV
          </button>
        </div>
      </div>
      <div className="history-grid">
        <section className="history-card">
          <h3>Budget approvals</h3>
          {snapshot.budgetApprovals.length === 0 && <EmptyState title="No budget approvals yet." />}
          {snapshot.budgetApprovals.map((item) => (
            <div key={item.id} className="timeline-row">
              <Badge tone={item.status === "approved" ? "success" : "neutral"}>{item.status}</Badge>
              <strong>
                {monthName(item.month)} {item.year}
              </strong>
              <span>{formatDualMoney(item.approvedAmount ?? item.suggestedAmount, snapshot.settings)}</span>
              <small>{formatDateTime(item.decidedAt)}</small>
            </div>
          ))}
        </section>
        <section className="history-card">
          <h3>Rollover history</h3>
          {record.closedMonths.length === 0 && <EmptyState title="No closed months yet." />}
          {record.closedMonths.map((item) => (
            <div key={item.id} className="timeline-row">
              <Badge tone={item.status === "blocked-missing-data" ? "danger" : "success"}>{item.status.replaceAll("-", " ")}</Badge>
              <strong>{monthName(item.month)}</strong>
              <span>{item.delta == null ? "NaN" : formatMoney(item.delta, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode, { showSign: true })}</span>
              <small>{formatDateTime(item.confirmedAt)}</small>
            </div>
          ))}
        </section>
        <section className="history-card">
          <h3>Audit log</h3>
          {history.map((item) => (
            <div key={item.id} className="timeline-row">
              <Badge tone="neutral">{item.type}</Badge>
              <strong>{item.summary}</strong>
              <small>{formatDateTime(item.createdAt)}</small>
              {item.summary && item.summary.toLowerCase().includes('archived category') && (
                <div style={{ marginLeft: 'auto' }}>
                  <button className="soft-button compact" onClick={() => tryUndoArchive(item)}>Restore</button>
                </div>
              )}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function SettingsPanel() {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const updateSettings = useBudgetStore((state) => state.updateSettings);
  return (
    <div className="settings-grid">
      <section className="settings-card">
        <h3>Budget settings</h3>
        <label>
          Monthly budget
          <input type="number" value={snapshot.settings.monthlyBudget} onChange={(event) => updateSettings({ monthlyBudget: Number(event.target.value) })} />
        </label>
        <label>
          Monthly budget currency
          <select value={snapshot.settings.monthlyBudgetCurrency} onChange={(event) => updateSettings({ monthlyBudgetCurrency: event.target.value as CurrencyCode })}>
            {CURRENCY_OPTIONS.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rounding rule
          <select value={snapshot.settings.roundingRule} onChange={(event) => updateSettings({ roundingRule: event.target.value as Settings["roundingRule"] })}>
            <option value="none">None</option>
            <option value="nearest-1">Nearest 1</option>
            <option value="nearest-5">Nearest 5</option>
            <option value="nearest-10">Nearest 10</option>
            <option value="ceil-10">Ceil 10</option>
          </select>
        </label>
        <label>
          Currency display
          <select value={snapshot.settings.currencyDisplayMode} onChange={(event) => updateSettings({ currencyDisplayMode: event.target.value as Settings["currencyDisplayMode"] })}>
            <option value="both">Symbol + code</option>
            <option value="symbol">Symbol</option>
            <option value="code">Code</option>
          </select>
        </label>
      </section>
      <section className="settings-card">
        <h3>Exchange rates</h3>
        <label>
          EUR/USD
          <input type="number" value={snapshot.settings.exchangeRates.eurUsd} onChange={(event) => updateSettings({ exchangeRates: { ...snapshot.settings.exchangeRates, eurUsd: Number(event.target.value) } })} />
        </label>
        <label>
          USD/L.L.
          <input type="number" value={snapshot.settings.exchangeRates.usdLbp} onChange={(event) => updateSettings({ exchangeRates: { ...snapshot.settings.exchangeRates, usdLbp: Number(event.target.value) } })} />
        </label>
      </section>
      <section className="settings-card">
        <h3>Automation</h3>
        <label className="check-row">
          <input type="checkbox" checked={snapshot.settings.autoWalletRollupEnabled} onChange={(event) => updateSettings({ autoWalletRollupEnabled: event.target.checked })} />
          Auto wallet rollup enabled
        </label>
        <label className="check-row">
          <input type="checkbox" checked={snapshot.settings.autoWishlistFlushEnabled} onChange={(event) => updateSettings({ autoWishlistFlushEnabled: event.target.checked })} />
          Flush bought wishlist items on new year
        </label>
        <label className="check-row">
          <input type="checkbox" checked={snapshot.settings.pilotIncludedInBudget} onChange={(event) => updateSettings({ pilotIncludedInBudget: event.target.checked })} />
          Include pilots in full budget
        </label>
        <label className="check-row">
          <input type="checkbox" checked={snapshot.settings.promptBeforeMonthClose} onChange={(event) => updateSettings({ promptBeforeMonthClose: event.target.checked })} />
          Prompt before rollover
        </label>
        <label className="check-row">
          <input type="checkbox" checked={snapshot.settings.liveClockEnabled} onChange={(event) => updateSettings({ liveClockEnabled: event.target.checked })} />
          Live clock
        </label>
        <label className="check-row">
          <input type="checkbox" checked={snapshot.settings.saveTimestampEnabled} onChange={(event) => updateSettings({ saveTimestampEnabled: event.target.checked })} />
          Save timestamp
        </label>
      </section>

      <section className="settings-card">
        <h3>Categories</h3>
        <div>
          <small style={{ color: 'var(--muted)' }}>Create, rename, reorder, and archive categories. Piloting stays separate.</small>
        </div>
        <CategoryManager />
      </section>
    </div>
  );
}

function CategoryManager() {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const addCategory = useBudgetStore((state) => state.addCategory);
  const updateCategory = useBudgetStore((state) => state.updateCategory);
  const archiveCategory = useBudgetStore((state) => state.archiveCategory);
  const reorderCategory = useBudgetStore((state) => state.reorderCategory);
  const [newName, setNewName] = useState("");
  const [newBucket, setNewBucket] = useState<BudgetCategory["bucket"]>("general");
  const [newColor, setNewColor] = useState("#64748B");
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const dragSourceRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function handleAdd() {
    if (!newName.trim()) return;
    addCategory({ name: newName.trim(), bucket: newBucket, color: newColor });
    setNewName("");
  }

  function handleArchive(id: string) {
    setConfirmArchiveId(id);
  }

  function confirmArchive() {
    if (confirmArchiveId) archiveCategory(confirmArchiveId);
    setConfirmArchiveId(null);
  }

  function onDragStart(e: React.DragEvent, id: string) {
    dragSourceRef.current = id;
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function onDragEnter(e: React.DragEvent, id: string) {
    setDragOverId(id);
  }
  function onDragLeave() {
    setDragOverId(null);
  }

  function onDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    const sourceId = dragSourceRef.current;
    dragSourceRef.current = null;
    setDragOverId(null);
    if (sourceId && sourceId !== targetId) reorderCategory(sourceId, targetId);
  }

  return (
    <div>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 140px 120px auto', marginBottom: 8 }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New category name" />
        <select value={newBucket} onChange={(e) => setNewBucket(e.target.value as any)}>
          <option value="general">General</option>
          <option value="piloting">Piloting</option>
          <option value="personal">Personal</option>
          <option value="wallet">Wallet</option>
        </select>
        <input value={newColor} onChange={(e) => setNewColor(e.target.value)} placeholder="#hex" />
        <button className="primary-button" onClick={handleAdd}>
          <Plus size={13} /> Create
        </button>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {snapshot.categories.map((cat, index) => (
          <div
            key={cat.id}
            draggable
            onDragStart={(e) => onDragStart(e, cat.id)}
            onDragOver={onDragOver}
            onDragEnter={(e) => onDragEnter(e, cat.id)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, cat.id)}
            className={"category-row" + (dragOverId === cat.id ? " drag-over" : "")}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") {
                e.preventDefault();
                if (index > 0) reorderCategory(cat.id, snapshot.categories[index - 1].id);
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (index < snapshot.categories.length - 1) reorderCategory(cat.id, snapshot.categories[index + 1].id);
              }
              if (e.key === "Enter") {
                // focus first input in row
                const input = (e.currentTarget.querySelector("input") as HTMLInputElement | null) ?? null;
                input?.focus();
              }
            }}
          >
            <div className="drag-handle" title="Drag to reorder">
              <Menu size={14} />
            </div>
            <input value={cat.name} onChange={(e) => updateCategory(cat.id, { name: e.target.value })} />
            <select value={cat.bucket} onChange={(e) => updateCategory(cat.id, { bucket: e.target.value as any })}>
              <option value="general">General</option>
              <option value="piloting">Piloting</option>
              <option value="personal">Personal</option>
              <option value="wallet">Wallet</option>
            </select>
            <input value={cat.color} onChange={(e) => updateCategory(cat.id, { color: e.target.value })} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="icon-button" title="Move up" onClick={() => index > 0 && reorderCategory(cat.id, snapshot.categories[index - 1].id)}>
                <ChevronLeft size={14} />
              </button>
              <button className="icon-button" title="Archive" onClick={() => handleArchive(cat.id)}>
                <Archive size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {confirmArchiveId && (
        <Modal title="Confirm archive" onClose={() => setConfirmArchiveId(null)}>
          <p>Are you sure you want to archive this category? This will hide it from most selectors but keep historical data intact.</p>
          <div className="modal-actions">
            <button className="soft-button compact" onClick={() => setConfirmArchiveId(null)}>
              Cancel
            </button>
            <button className="primary-button warn" onClick={confirmArchive}>
              Archive
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RolloverDialog({ calculation, onClose }: { calculation: BudgetCalculation; onClose: () => void }) {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const closeMonth = useBudgetStore((state) => state.closeMonth);
  const month = snapshot.settings.selectedMonth;
  const delta = calculation.rolloverDelta;
  const blocked = delta == null;

  function close(apply: boolean) {
    closeMonth(snapshot.settings.selectedYear, month, apply);
    onClose();
  }

  return (
    <Modal title={`Close ${monthName(month)}`} onClose={onClose}>
      <div className="modal-summary">
        <div className="modal-icon">{blocked || (delta ?? 0) < 0 ? <AlertTriangle size={24} /> : <Wallet size={24} />}</div>
        <p>
          Spend is <strong>{formatMoney(calculation.selectedMonthSpend.total, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)}</strong>. Rollover delta is{" "}
          <strong>{formatMoney(delta, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode, { showSign: true })}</strong>.
        </p>
      </div>
      {blocked && <p className="warning-text">This month is pending or explicitly NaN, so rollover is blocked unless you add an entry or mark a real zero.</p>}
      {delta != null && delta < 0 && <p className="warning-text">Negative delta will reduce the wallet and will be logged visibly.</p>}
      <div className="modal-actions">
        <button className="soft-button compact" onClick={() => close(false)}>
          Close without rollover
        </button>
        <button className="primary-button warn" disabled={blocked} onClick={() => close(true)}>
          Apply rollover
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prevFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal">
        <button ref={closeRef} className="icon-button modal-close" onClick={onClose} title="Close">
          <X size={17} />
        </button>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

function ChangelogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const updateCategory = useBudgetStore((state) => state.updateCategory);
  const [filter, setFilter] = useState("");
  if (!open) return null;

  const filtered = snapshot.auditLog.filter((item) => {
    if (!filter) return true;
    return item.summary.toLowerCase().includes(filter.toLowerCase()) || (item.metadata && JSON.stringify(item.metadata).toLowerCase().includes(filter.toLowerCase()));
  });

  // group by date (YYYY-MM-DD)
  const groups: Record<string, typeof filtered> = {};
  for (const item of filtered) {
    const d = new Date(item.createdAt).toISOString().slice(0, 10);
    groups[d] ||= [];
    groups[d].push(item as any);
  }
  const groupKeys = Object.keys(groups).sort((a, b) => (a < b ? -1 : 1)).reverse();

  function exportAuditJson() {
    try {
      const data = JSON.stringify(snapshot.auditLog, null, 2);
      if (navigator && (navigator as any).clipboard && typeof (navigator as any).clipboard.writeText === "function") {
        void (navigator as any).clipboard.writeText(data);
        alert("Changelog copied to clipboard.");
        return;
      }
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `changelog-${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Export failed.");
    }
  }

  function exportAuditCsv() {
    try {
      const rows = ["createdAt,type,summary,metadata"];
      for (const item of snapshot.auditLog) {
        const meta = item.metadata ? JSON.stringify(item.metadata).replace(/\"/g, '""') : "";
        rows.push(`"${item.createdAt}","${String(item.type)}","${String(item.summary).replace(/"/g, '""')}","${meta.replace(/"/g, '""')}"`);
      }
      const blob = new Blob([rows.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `changelog-${new Date().toISOString()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Export failed.");
    }
  }

  function tryUndoArchive(item: { id: string; summary: string; metadata?: any }) {
    // look for metadata.id which is category id
    const catId = item.metadata && (item.metadata as any).id;
    if (!catId) return;
    const category = snapshot.categories.find((c) => c.id === catId);
    if (!category || !category.archived) return;
    if (!window.confirm(`Restore category ${category.name}?`)) return;
      updateCategory(catId, { archived: false });
  }

  return (
    <Modal title="Changelog" onClose={onClose}>
      <div className="changelog-list">
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input placeholder="Filter changelog..." value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="soft-button compact" onClick={() => setFilter("")}>Clear</button>
          <button className="command-button compact" onClick={exportAuditJson}>Export JSON</button>
          <button className="command-button compact" onClick={exportAuditCsv}>Export CSV</button>
        </div>
        {groupKeys.length === 0 ? (
          <EmptyState title="No matching changes" detail="Try clearing the filter." />
        ) : (
          <div>
            {groupKeys.map((day) => (
              <section key={day} style={{ marginBottom: 12 }}>
                <h4 style={{ margin: '6px 0', color: 'var(--muted)', fontSize: '0.82rem' }}>{day}</h4>
                <ol>
                  {groups[day].map((item: any) => (
                    <li key={item.id} style={{ marginBottom: 6 }}>
                      <div className="changelog-item">
                        <div className="changelog-ts">{formatDateTime(item.createdAt)}</div>
                        <div>
                          <strong>{item.summary}</strong>
                          {item.metadata && <pre className="muted">{JSON.stringify(item.metadata)}</pre>}
                        </div>
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                          {item.summary && item.summary.toLowerCase().includes('archived category') && (
                            <button className="soft-button compact" onClick={() => tryUndoArchive(item)}>
                              Restore
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button className="soft-button compact" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

function NoteButton({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="note-popover">
      <button className={value ? "icon-button note-trigger active" : "icon-button note-trigger"} title={value ? "View note" : "Add note"} onClick={() => setOpen(!open)} type="button">
        <StickyNote size={15} />
      </button>
      {open && (
        <div className="note-card">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a note..." />
          <div className="note-actions">
            <button className="soft-button compact" onClick={() => setOpen(false)} type="button">
              Cancel
            </button>
            <button
              className="primary-button"
              onClick={() => {
                onSave(draft);
                setOpen(false);
              }}
              type="button"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryMini({ label, value }: { label: string; value: number }) {
  const settings = useBudgetStore((state) => state.snapshot.settings);
  return (
    <div className="mini-summary">
      <span>{label}</span>
      <strong>{formatMoney(value, settings.baseCurrency, settings.currencyDisplayMode)}</strong>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="chart-panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function InsightCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "neutral" | "info" | "success" | "danger" }) {
  return (
    <article className={`insight-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: "neutral" | "info" | "success" | "danger" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="empty-state">
      <Database size={24} />
      <strong>{title}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}

function statusLabel(status: string): string {
  if (status === "nan") return "NaN: closed missing";
  if (status === "pending") return "Pending";
  if (status === "zero") return "0 entered";
  return "Value entered";
}

function formatDualMoney(amount: number | null | undefined, settings: Settings, options: { showSign?: boolean } = {}): string {
  const selected = formatMoney(amount, settings.baseCurrency, settings.currencyDisplayMode, options);
  if (settings.baseCurrency === "EUR" || amount == null || Number.isNaN(amount)) return selected;
  const eurValue = convertAmount(amount, settings.baseCurrency, "EUR", settings.exchangeRates);
  return `${selected} · ${formatMoney(eurValue, "EUR", settings.currencyDisplayMode, options)}`;
}

function isViewingCurrentMonth(settings: Settings, now = new Date()): boolean {
  return settings.selectedYear === now.getFullYear() && settings.selectedMonth === now.getMonth() + 1;
}

function isViewingHistoricalPeriod(settings: Settings, now = new Date()): boolean {
  if (settings.selectedYear < now.getFullYear()) return true;
  if (settings.selectedYear > now.getFullYear()) return false;
  if (settings.selectedMonth < now.getMonth() + 1) return true;
  if (settings.selectedMonth > now.getMonth() + 1) return false;
  return settings.selectedWeek < getIsoWeek(now);
}

function activityToDraft(activity: Activity | null, snapshot: BudgetSnapshot): ActivityDraft {
  return {
    name: activity?.name ?? "",
    categoryId: activity?.categoryId ?? snapshot.categories.find((category) => category.id === "cat-other")?.id ?? snapshot.categories[0]?.id ?? "cat-other",
    currency: activity?.currency ?? snapshot.settings.baseCurrency,
    recurrenceType: activity?.recurrenceType ?? "monthly",
    recurrenceInterval: activity?.recurrenceInterval ?? 1,
    pricePerSession: valueToInput(activity?.pricePerSession),
    pricePerPurchase: valueToInput(activity?.pricePerPurchase),
    pricePerMonth: valueToInput(activity?.pricePerMonth),
    yearlyEstimate: valueToInput(activity?.yearlyEstimate),
    seasonalTag: activity?.seasonalTag ?? snapshot.settings.selectedSeason,
    active: activity?.active ?? true,
    visible: activity?.visible ?? true,
    notes: activity?.notes ?? "",
  };
}

function activityPayloadFromDraft(draft: ActivityDraft): Omit<Activity, "id" | "order"> {
  const pricePerSession = parseAmount(draft.pricePerSession);
  const pricePerPurchase = parseAmount(draft.pricePerPurchase);
  const pricePerMonth = parseAmount(draft.pricePerMonth);
  const yearlyEstimate = parseAmount(draft.yearlyEstimate);
  return {
    name: draft.name.trim(),
    categoryId: draft.categoryId,
    currency: draft.currency,
    recurrenceType: draft.recurrenceType,
    recurrenceInterval: Math.max(1, Number(draft.recurrenceInterval) || 1),
    pricePerSession,
    pricePerPurchase,
    pricePerMonth,
    estimatedCost: pricePerMonth ?? pricePerPurchase ?? pricePerSession ?? yearlyEstimate,
    yearlyEstimate,
    active: draft.active,
    visible: draft.visible,
    seasonalTag: draft.seasonalTag || "normal",
    notes: draft.notes,
  };
}

function wishlistToDraft(item: WishlistItem | null, snapshot: BudgetSnapshot): WishlistDraft {
  return {
    name: item?.name ?? "",
    actualPrice: valueToInput(item?.actualPrice),
    currency: item?.currency ?? snapshot.settings.baseCurrency,
    priority: item?.priority ?? "medium",
    bought: item?.bought ?? false,
    inWishlist: item?.inWishlist ?? true,
    active: item?.active ?? true,
    notes: item?.notes ?? "",
  };
}

function valueToInput(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function activityPrimaryCostLabel(activity: Activity): string {
  if (activity.pricePerMonth != null) return "Per month";
  if (activity.yearlyEstimate != null && activity.recurrenceType === "yearly") return "Per year";
  if (activity.pricePerSession != null) return activity.recurrenceType === "weekly" ? "Per week" : "Per session";
  if (activity.pricePerPurchase != null) return "Per purchase";
  return "Cost";
}

function activityPrimaryCost(activity: Activity, snapshot: BudgetSnapshot): string {
  const amount = activity.pricePerMonth ?? (activity.recurrenceType === "yearly" ? activity.yearlyEstimate : null) ?? activity.pricePerSession ?? activity.pricePerPurchase ?? activity.estimatedCost;
  return formatMoney(amount, activity.currency, snapshot.settings.currencyDisplayMode);
}

function matchesActivityFilters(activity: Activity, filters: Filters): boolean {
  const text = `${activity.name} ${activity.notes}`.toLowerCase();
  return (
    text.includes(filters.query.toLowerCase()) &&
    (filters.categoryId === "all" || activity.categoryId === filters.categoryId) &&
    (filters.currency === "all" || activity.currency === filters.currency) &&
    (filters.season === "all" || activity.seasonalTag === filters.season)
  );
}

function matchesEntryFilters(entry: SpendingEntry, filters: Filters): boolean {
  const text = `${entry.note}`.toLowerCase();
  return text.includes(filters.query.toLowerCase()) && (filters.categoryId === "all" || entry.categoryId === filters.categoryId) && (filters.currency === "all" || entry.currency === filters.currency);
}

function matchesWishlistFilters(item: WishlistItem, filters: Filters): boolean {
  const text = `${item.name} ${item.notes}`.toLowerCase();
  return text.includes(filters.query.toLowerCase()) && (filters.currency === "all" || item.currency === filters.currency);
}

function wishlistViewMatches(item: WishlistItem, view: WishlistView): boolean {
  if (view === "active") return item.active && item.inWishlist && !item.bought;
  if (view === "purchased") return item.bought;
  if (view === "archived") return !item.active;
  return true;
}

function priorityRank(priority: WishlistItem["priority"]): number {
  return { low: 1, medium: 2, high: 3, dream: 4 }[priority];
}

function sortActivities(
  a: Activity,
  b: Activity,
  sortBy: "order" | "name" | "cost",
  estimateMap: Map<string, BudgetCalculation["activityEstimates"][number]>,
): number {
  if (sortBy === "name") return a.name.localeCompare(b.name);
  if (sortBy === "cost") return (estimateMap.get(b.id)?.monthlyBase ?? 0) - (estimateMap.get(a.id)?.monthlyBase ?? 0);
  return a.order - b.order;
}
