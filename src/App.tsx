import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FileSpreadsheet,
  History,
  Moon,
  Plane,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Search,
  Settings as SettingsIcon,
  ShoppingBag,
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
import { calculateYear } from "./domain/calculations";
import { CURRENCY_OPTIONS, formatMoney, normalizeAmount, parseAmount } from "./domain/currency";
import {
  dateInputValue,
  formatDateTime,
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
import type { Activity, BudgetSnapshot, CurrencyCode, RecurrenceType, SpendingEntry, WalletEntry, WishlistItem } from "./domain/types";
import { useBudgetStore } from "./store/budgetStore";

type TabKey = "activities" | "spending" | "wishlist" | "wallet" | "analytics" | "history" | "settings";

interface Filters {
  query: string;
  categoryId: string;
  currency: string;
  season: string;
  historyQuery: string;
}

const tabs: Array<{ key: TabKey; label: string; icon: typeof ActivityIcon }> = [
  { key: "activities", label: "Activities", icon: ActivityIcon },
  { key: "spending", label: "Spending", icon: CalendarDays },
  { key: "wishlist", label: "Wishlist", icon: ShoppingBag },
  { key: "wallet", label: "Wallet", icon: Wallet },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "history", label: "History", icon: History },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

const recurrenceTypes: RecurrenceType[] = ["none", "weekly", "monthly", "yearly", "session", "purchase", "custom"];

export default function App() {
  const store = useBudgetStore();
  const { snapshot, hydrated } = store;
  const [activeTab, setActiveTab] = useState<TabKey>("activities");
  const [notice, setNotice] = useState<string>("");
  const [rolloverOpen, setRolloverOpen] = useState(false);
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
    document.documentElement.classList.toggle("dark", snapshot.settings.darkMode);
  }, [snapshot.settings.darkMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        store.undo();
      }
      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        store.redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);

  const calculation = useMemo(() => calculateYear(snapshot), [snapshot]);
  const record = snapshot.years[String(snapshot.settings.selectedYear)];

  if (!hydrated || !record) {
    return (
      <main className="loading-screen">
        <Database size={34} />
        <span>Loading your local budget vault...</span>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar filters={filters} setFilters={setFilters} setNotice={setNotice} />
      <main className="main-area">
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
        <nav className="tab-strip" aria-label="Budget workspace tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.key} className={activeTab === tab.key ? "tab active" : "tab"} onClick={() => setActiveTab(tab.key)}>
                <Icon size={17} />
                {tab.label}
              </button>
            );
          })}
        </nav>
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
    </div>
  );
}

function Sidebar({
  filters,
  setFilters,
  setNotice,
}: {
  filters: Filters;
  setFilters: (filters: Filters) => void;
  setNotice: (notice: string) => void;
}) {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const selectYear = useBudgetStore((state) => state.selectYear);
  const updateSettings = useBudgetStore((state) => state.updateSettings);
  const applySeasonalPreset = useBudgetStore((state) => state.applySeasonalPreset);
  const applyScenarioPreset = useBudgetStore((state) => state.applyScenarioPreset);
  const importSnapshot = useBudgetStore((state) => state.importSnapshot);
  const resetToSeed = useBudgetStore((state) => state.resetToSeed);
  const workbookInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const currentYear = snapshot.settings.selectedYear;
  const yearOptions = Array.from(new Set([2026, 2027, 2028, 2029, 2030, currentYear - 1, currentYear, currentYear + 1, ...Object.keys(snapshot.years).map(Number)])).sort(
    (a, b) => a - b,
  );
  const weeks = weeksInIsoYear(currentYear);

  async function handleWorkbookImport(file: File | undefined) {
    if (!file) return;
    try {
      const imported = await importBudgetWorkbook(file);
      importSnapshot(imported, `Imported ${file.name}.`);
      setNotice(`Imported ${file.name} into the local app model.`);
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
    <aside className="sidebar">
      <div className="brand-block">
        <div className="brand-mark">
          <Plane size={23} />
        </div>
        <div>
          <strong>Budget OS</strong>
          <span>Local-first finance cockpit</span>
        </div>
      </div>

      <section className="sidebar-section">
        <label>
          Year
          <select value={currentYear} onChange={(event) => selectYear(Number(event.target.value))}>
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <label>
          Month
          <select value={snapshot.settings.selectedMonth} onChange={(event) => updateSettings({ selectedMonth: Number(event.target.value) })}>
            {MONTH_NAMES.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Week
          <select value={snapshot.settings.selectedWeek} onChange={(event) => updateSettings({ selectedWeek: Number(event.target.value) })}>
            {Array.from({ length: weeks }, (_, index) => index + 1).map((week) => (
              <option key={week} value={week}>
                Week {week}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="sidebar-section">
        <div className="section-title">
          <Search size={15} />
          Filters
        </div>
        <label>
          Search
          <input value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="Activity, note, item..." />
        </label>
        <label>
          Category
          <select value={filters.categoryId} onChange={(event) => setFilters({ ...filters, categoryId: event.target.value })}>
            <option value="all">All categories</option>
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
            <option value="all">All currencies</option>
            {CURRENCY_OPTIONS.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
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
          <ActivityIcon size={15} />
          Seasonal Presets
        </div>
        <div className="button-grid">
          {snapshot.seasonalPresets.map((preset) => (
            <button key={preset.id} className="soft-button" onClick={() => applySeasonalPreset(preset.id)} title={preset.notes}>
              {preset.name}
            </button>
          ))}
        </div>
      </section>

      <section className="sidebar-section">
        <div className="section-title">
          <SettingsIcon size={15} />
          Scenarios
        </div>
        <div className="button-grid">
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
          Import / Export
        </div>
        <input ref={workbookInput} className="hidden-input" type="file" accept=".xlsx,.xls" onChange={(event) => void handleWorkbookImport(event.target.files?.[0])} />
        <input ref={jsonInput} className="hidden-input" type="file" accept=".json" onChange={(event) => void handleJsonImport(event.target.files?.[0])} />
        <button className="command-button" onClick={() => workbookInput.current?.click()}>
          <Upload size={16} />
          Import Excel
        </button>
        <button className="command-button" onClick={() => jsonInput.current?.click()}>
          <FileJson size={16} />
          Restore JSON
        </button>
        <button className="command-button" onClick={() => exportCurrentYearToExcel(snapshot)}>
          <FileSpreadsheet size={16} />
          Export Year
        </button>
        <button className="command-button" onClick={() => exportAllYearsToExcel(snapshot)}>
          <Download size={16} />
          Export All
        </button>
        <button className="command-button" onClick={() => exportJson(snapshot)}>
          <FileJson size={16} />
          Backup JSON
        </button>
      </section>

      <section className="sidebar-section compact-toggles">
        <label className="check-row">
          <input type="checkbox" checked={snapshot.settings.pilotIncludedInBudget} onChange={(event) => updateSettings({ pilotIncludedInBudget: event.target.checked })} />
          Include pilots in full budget
        </label>
        <label className="check-row">
          <input type="checkbox" checked={snapshot.settings.promptBeforeMonthClose} onChange={(event) => updateSettings({ promptBeforeMonthClose: event.target.checked })} />
          Prompt before rollover
        </label>
        <label className="check-row">
          <input type="checkbox" checked={snapshot.settings.darkMode} onChange={(event) => updateSettings({ darkMode: event.target.checked })} />
          {snapshot.settings.darkMode ? <Moon size={15} /> : <Sun size={15} />}
          Dark mode
        </label>
        <button className="danger-soft" onClick={() => void resetToSeed()}>
          <RefreshCw size={15} />
          Reset seed
        </button>
      </section>
    </aside>
  );
}

function Header({ calculation, setRolloverOpen }: { calculation: ReturnType<typeof calculateYear>; setRolloverOpen: (value: boolean) => void }) {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const updateSettings = useBudgetStore((state) => state.updateSettings);
  const undo = useBudgetStore((state) => state.undo);
  const redo = useBudgetStore((state) => state.redo);
  return (
    <header className="top-header">
      <div>
        <p className="eyebrow">{monthName(calculation.month)} workspace</p>
        <h1>{calculation.year} Budget Command Center</h1>
      </div>
      <div className="header-actions">
        <LiveClock />
        <div className="timestamp">
          <span>Last updated</span>
          <strong>{formatDateTime(snapshot.settings.lastUpdated)}</strong>
        </div>
        <select
          className="currency-pill"
          value={snapshot.settings.baseCurrency}
          onChange={(event) => updateSettings({ baseCurrency: event.target.value as CurrencyCode })}
          title="Base currency"
        >
          {CURRENCY_OPTIONS.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
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
        <strong>{enabled ? now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Clock off"}</strong>
      </div>
    </div>
  );
}

function SummaryCards({ calculation }: { calculation: ReturnType<typeof calculateYear> }) {
  const settings = useBudgetStore((state) => state.snapshot.settings);
  const cards = [
    { label: "General Budget", value: calculation.generalBudget, accent: "green", detail: "Recurring non-piloting plan" },
    { label: "Piloting Budget", value: calculation.pilotingBudget, accent: "amber", detail: "Separated flight stack" },
    { label: "Included Budget", value: calculation.includedBudget, accent: "blue", detail: settings.pilotIncludedInBudget ? "General + piloting" : "General only" },
    { label: "Month Spend", value: calculation.selectedMonthSpend.total, accent: "rose", detail: statusLabel(calculation.selectedMonthSpend.status) },
    { label: "Delta", value: calculation.delta, accent: calculation.delta != null && calculation.delta < 0 ? "rose" : "green", detail: "Budget minus spend" },
    { label: "Wallet", value: calculation.wallet.personalWalletTotal, accent: "cyan", detail: "Personal wallet only" },
    { label: "Wishlist Left", value: calculation.wishlist.activeTotal, accent: "pink", detail: `${calculation.wishlist.activeCount} active items` },
    { label: "Rounded Monthly", value: calculation.roundedMonthlyValue, accent: "violet", detail: settings.roundingRule },
  ];
  return (
    <section className="summary-grid">
      {cards.map((card) => (
        <article key={card.label} className={`summary-card ${card.accent}`}>
          <span>{card.label}</span>
          <strong>{formatMoney(card.value, settings.baseCurrency, settings.currencyDisplayMode, { showSign: card.label === "Delta" })}</strong>
          <small>{card.detail}</small>
        </article>
      ))}
    </section>
  );
}

function ActivityPanel({ filters, calculation }: { filters: Filters; calculation: ReturnType<typeof calculateYear> }) {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const record = snapshot.years[String(snapshot.settings.selectedYear)];
  const addActivity = useBudgetStore((state) => state.addActivity);
  const updateActivity = useBudgetStore((state) => state.updateActivity);
  const removeActivity = useBudgetStore((state) => state.removeActivity);
  const duplicateActivity = useBudgetStore((state) => state.duplicateActivity);
  const moveActivity = useBudgetStore((state) => state.moveActivity);
  const reorderActivity = useBudgetStore((state) => state.reorderActivity);
  const [draggingId, setDraggingId] = useState<string>("");
  const [draft, setDraft] = useState({
    name: "",
    categoryId: snapshot.categories[0]?.id ?? "cat-health",
    currency: snapshot.settings.baseCurrency,
    recurrenceType: "monthly" as RecurrenceType,
    recurrenceInterval: 1,
    pricePerSession: "",
    pricePerMonth: "",
    pricePerPurchase: "",
    yearlyEstimate: "",
    seasonalTag: snapshot.settings.selectedSeason,
    notes: "",
  });
  const estimateMap = new Map(calculation.activityEstimates.map((item) => [item.activity.id, item]));
  const activities = record.activities
    .filter((activity) => matchesFilters(activity, filters))
    .sort((a, b) => a.order - b.order);

  function submitDraft(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    const perMonth = parseAmount(draft.pricePerMonth);
    const perSession = parseAmount(draft.pricePerSession);
    const perPurchase = parseAmount(draft.pricePerPurchase);
    const yearly = parseAmount(draft.yearlyEstimate);
    addActivity({
      name: draft.name.trim(),
      categoryId: draft.categoryId,
      currency: draft.currency as CurrencyCode,
      recurrenceType: draft.recurrenceType,
      recurrenceInterval: Math.max(1, Number(draft.recurrenceInterval) || 1),
      pricePerSession: perSession,
      pricePerPurchase: perPurchase,
      pricePerMonth: perMonth,
      estimatedCost: perMonth ?? perPurchase ?? perSession ?? yearly,
      yearlyEstimate: yearly,
      active: true,
      visible: true,
      seasonalTag: draft.seasonalTag || "normal",
      notes: draft.notes,
    });
    setDraft({ ...draft, name: "", pricePerSession: "", pricePerMonth: "", pricePerPurchase: "", yearlyEstimate: "", notes: "" });
  }

  return (
    <div className="panel-stack">
      <form className="quick-add" onSubmit={submitDraft}>
        <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="New activity" />
        <select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>
          {snapshot.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
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
        <input type="number" min="1" value={draft.recurrenceInterval} onChange={(event) => setDraft({ ...draft, recurrenceInterval: Number(event.target.value) })} title="Recurrence interval" />
        <input inputMode="decimal" value={draft.pricePerMonth} onChange={(event) => setDraft({ ...draft, pricePerMonth: event.target.value })} placeholder="Per month" />
        <input inputMode="decimal" value={draft.pricePerSession} onChange={(event) => setDraft({ ...draft, pricePerSession: event.target.value })} placeholder="Per session" />
        <button className="primary-button" type="submit">
          <Plus size={17} />
          Add
        </button>
      </form>

      <div className="table-shell">
        <table className="data-table activity-table">
          <thead>
            <tr>
              <th>Activity</th>
              <th>Currency</th>
              <th>Prices</th>
              <th>Recurrence</th>
              <th>Category</th>
              <th>Season</th>
              <th>State</th>
              <th>Monthly</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((activity) => {
              const estimate = estimateMap.get(activity.id);
              return (
                <tr
                  key={activity.id}
                  draggable
                  onDragStart={() => setDraggingId(activity.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggingId && draggingId !== activity.id) reorderActivity(draggingId, activity.id);
                    setDraggingId("");
                  }}
                >
                  <td>
                    <input value={activity.name} onChange={(event) => updateActivity(activity.id, { name: event.target.value })} />
                    <textarea value={activity.notes} onChange={(event) => updateActivity(activity.id, { notes: event.target.value })} placeholder="Notes" />
                  </td>
                  <td>
                    <select value={activity.currency} onChange={(event) => updateActivity(activity.id, { currency: event.target.value as CurrencyCode })}>
                      {CURRENCY_OPTIONS.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="price-grid">
                    <LabeledNumber label="Session" value={activity.pricePerSession} onChange={(value) => updateActivity(activity.id, { pricePerSession: value })} />
                    <LabeledNumber label="Month" value={activity.pricePerMonth} onChange={(value) => updateActivity(activity.id, { pricePerMonth: value })} />
                    <LabeledNumber label="Purchase" value={activity.pricePerPurchase} onChange={(value) => updateActivity(activity.id, { pricePerPurchase: value })} />
                    <LabeledNumber label="Year" value={activity.yearlyEstimate} onChange={(value) => updateActivity(activity.id, { yearlyEstimate: value })} />
                  </td>
                  <td>
                    <select value={activity.recurrenceType} onChange={(event) => updateActivity(activity.id, { recurrenceType: event.target.value as RecurrenceType })}>
                      {recurrenceTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <input type="number" min="1" value={activity.recurrenceInterval} onChange={(event) => updateActivity(activity.id, { recurrenceInterval: Number(event.target.value) || 1 })} />
                  </td>
                  <td>
                    <select value={activity.categoryId} onChange={(event) => updateActivity(activity.id, { categoryId: event.target.value })}>
                      {snapshot.categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input value={activity.seasonalTag} onChange={(event) => updateActivity(activity.id, { seasonalTag: event.target.value })} />
                  </td>
                  <td>
                    <label className="check-row">
                      <input type="checkbox" checked={activity.active} onChange={(event) => updateActivity(activity.id, { active: event.target.checked })} />
                      Active
                    </label>
                    <label className="check-row">
                      <input type="checkbox" checked={activity.visible} onChange={(event) => updateActivity(activity.id, { visible: event.target.checked })} />
                      {activity.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                      Visible
                    </label>
                  </td>
                  <td>
                    <strong>{formatMoney(estimate?.monthlyBase ?? 0, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)}</strong>
                    <small>{estimate?.bucket}</small>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-button" title="Move up" onClick={() => moveActivity(activity.id, -1)}>
                        <ArrowUp size={15} />
                      </button>
                      <button className="icon-button" title="Move down" onClick={() => moveActivity(activity.id, 1)}>
                        <ArrowDown size={15} />
                      </button>
                      <button className="icon-button" title="Duplicate" onClick={() => duplicateActivity(activity.id)}>
                        <Copy size={15} />
                      </button>
                      <button className="icon-button danger" title="Delete" onClick={() => removeActivity(activity.id)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {activities.length === 0 && <EmptyState title="No activities match the filters." />}
      </div>
    </div>
  );
}

function SpendingPanel({ filters, calculation }: { filters: Filters; calculation: ReturnType<typeof calculateYear> }) {
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
    note: "",
  });
  const entries = record.spendingEntries
    .filter((entry) => entry.month === snapshot.settings.selectedMonth)
    .filter((entry) => matchesEntryFilters(entry, filters))
    .sort((a, b) => a.date.localeCompare(b.date));

  function submitDraft(event: React.FormEvent) {
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
      <div className="period-strip">
        <Badge tone={calculation.selectedWeekSpend.status === "nan" ? "danger" : "neutral"}>Selected week: {statusLabel(calculation.selectedWeekSpend.status)}</Badge>
        <Badge tone={calculation.selectedMonthSpend.status === "nan" ? "danger" : "neutral"}>Selected month: {statusLabel(calculation.selectedMonthSpend.status)}</Badge>
        <button className="soft-button inline" onClick={markSelectedWeekZero}>
          <Plus size={15} />
          Mark Week 0
        </button>
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
        <label className="check-row compact">
          <input type="checkbox" checked={draft.isPiloting} onChange={(event) => setDraft({ ...draft, isPiloting: event.target.checked })} />
          Pilot
        </label>
        <input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Note" />
        <button className="primary-button" type="submit">
          <Plus size={17} />
          Add
        </button>
      </form>

      <div className="table-shell">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Week</th>
              <th>Category</th>
              <th>Activity</th>
              <th>Amount</th>
              <th>Pilot</th>
              <th>Note</th>
              <th>Actions</th>
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
                  <input type="checkbox" checked={entry.isPiloting} onChange={(event) => updateSpendingEntry(entry.id, { isPiloting: event.target.checked })} />
                </td>
                <td>
                  <input value={entry.note} onChange={(event) => updateSpendingEntry(entry.id, { note: event.target.value })} />
                </td>
                <td>
                  <button className="icon-button danger" title="Delete" onClick={() => removeSpendingEntry(entry.id)}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && <EmptyState title="No spending entries in this month." detail="A closed empty month will display NaN; use Mark Week 0 when the real value is zero." />}
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
  const [draft, setDraft] = useState({ name: "", actualPrice: "", currency: snapshot.settings.baseCurrency, priority: "medium" as WishlistItem["priority"], notes: "" });
  const items = record.wishlistItems
    .filter((item) => matchesWishlistFilters(item, filters))
    .sort((a, b) => Number(a.bought) - Number(b.bought) || Number(b.inWishlist) - Number(a.inWishlist));

  function submitDraft(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    const actualPrice = parseAmount(draft.actualPrice);
    addWishlistItem({
      name: draft.name.trim(),
      categoryId: "cat-wishlist",
      actualPrice,
      effectiveValue: actualPrice,
      currency: draft.currency as CurrencyCode,
      bought: false,
      inWishlist: true,
      priority: draft.priority,
      notes: draft.notes,
      active: true,
    });
    setDraft({ ...draft, name: "", actualPrice: "", notes: "" });
  }

  return (
    <div className="panel-stack">
      <form className="quick-add" onSubmit={submitDraft}>
        <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Wishlist item" />
        <input inputMode="decimal" value={draft.actualPrice} onChange={(event) => setDraft({ ...draft, actualPrice: event.target.value })} placeholder="Price" />
        <select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value as CurrencyCode })}>
          {CURRENCY_OPTIONS.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
        <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as WishlistItem["priority"] })}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="dream">Dream</option>
        </select>
        <input value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Notes" />
        <button className="primary-button" type="submit">
          <Plus size={17} />
          Add
        </button>
      </form>

      <div className="table-shell">
        <table className="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Price</th>
              <th>Effective</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Dates</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <input value={item.name} onChange={(event) => updateWishlistItem(item.id, { name: event.target.value })} />
                </td>
                <td className="money-edit">
                  <input inputMode="decimal" value={item.actualPrice ?? ""} onChange={(event) => updateWishlistItem(item.id, { actualPrice: parseAmount(event.target.value) })} />
                  <select value={item.currency} onChange={(event) => updateWishlistItem(item.id, { currency: event.target.value as CurrencyCode })}>
                    {CURRENCY_OPTIONS.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {formatMoney(
                    normalizeAmount(item.effectiveValue, item.currency, snapshot.settings),
                    snapshot.settings.baseCurrency,
                    snapshot.settings.currencyDisplayMode,
                  )}
                </td>
                <td>
                  <select value={item.priority} onChange={(event) => updateWishlistItem(item.id, { priority: event.target.value as WishlistItem["priority"] })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="dream">Dream</option>
                  </select>
                </td>
                <td>
                  <label className="check-row">
                    <input type="checkbox" checked={item.bought} onChange={(event) => updateWishlistItem(item.id, { bought: event.target.checked })} />
                    Bought
                  </label>
                  <label className="check-row">
                    <input type="checkbox" checked={item.inWishlist} onChange={(event) => updateWishlistItem(item.id, { inWishlist: event.target.checked })} />
                    Wishlist
                  </label>
                  <label className="check-row">
                    <input type="checkbox" checked={item.active} onChange={(event) => updateWishlistItem(item.id, { active: event.target.checked })} />
                    Active
                  </label>
                </td>
                <td>
                  <small>Added {formatDateTime(item.dateAdded)}</small>
                  {item.datePurchased && <small>Bought {formatDateTime(item.datePurchased)}</small>}
                </td>
                <td>
                  <input value={item.notes} onChange={(event) => updateWishlistItem(item.id, { notes: event.target.value })} />
                </td>
                <td>
                  <button className="icon-button danger" title="Delete" onClick={() => removeWishlistItem(item.id)}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <EmptyState title="Your active wishlist is clean." detail="Bought items stay in history and flush from active lists when a new year is created." />}
      </div>
    </div>
  );
}

function WalletPanel({ calculation, openRollover }: { calculation: ReturnType<typeof calculateYear>; openRollover: () => void }) {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const record = snapshot.years[String(snapshot.settings.selectedYear)];
  const addWalletEntry = useBudgetStore((state) => state.addWalletEntry);
  const updateWalletEntry = useBudgetStore((state) => state.updateWalletEntry);
  const removeWalletEntry = useBudgetStore((state) => state.removeWalletEntry);
  const [draft, setDraft] = useState({ amount: "", currency: snapshot.settings.baseCurrency, source: "", type: "personal" as WalletEntry["type"], note: "" });

  function submitDraft(event: React.FormEvent) {
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
          Month Close
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
        <input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Note" />
        <button className="primary-button" type="submit">
          <Plus size={17} />
          Add
        </button>
      </form>
      <div className="table-shell">
        <table className="data-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Amount</th>
              <th>Source</th>
              <th>Type</th>
              <th>Note</th>
              <th>Created</th>
              <th>Actions</th>
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
                  <input value={entry.note} onChange={(event) => updateWalletEntry(entry.id, { note: event.target.value })} />
                </td>
                <td>{formatDateTime(entry.createdAt)}</td>
                <td>
                  <button className="icon-button danger" title="Delete" onClick={() => removeWalletEntry(entry.id)}>
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

function AnalyticsPanel({ calculation }: { calculation: ReturnType<typeof calculateYear> }) {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const record = snapshot.years[String(snapshot.settings.selectedYear)];
  const monthlyData = calculation.monthlyTrend.map((summary) => ({
    name: summary.label.slice(0, 3),
    total: summary.status === "value" || summary.status === "zero" ? summary.total : null,
    general: summary.generalTotal,
    piloting: summary.pilotingTotal,
    status: summary.status,
  }));
  const categoryData = calculation.categoryTotals.map((item) => ({ ...item, name: item.categoryName }));
  const budgetData = [
    { name: "General", value: calculation.generalBudget, color: "#16A34A" },
    { name: "Piloting", value: calculation.pilotingBudget, color: "#F59E0B" },
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
    <div className="analytics-grid">
      <ChartPanel title="Monthly Spend Trend">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(value) => formatMoney(Number(value), snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)} />
            <Area type="monotone" dataKey="total" stroke="#2563EB" fill="#DBEAFE" connectNulls={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartPanel>
      <ChartPanel title="Category Breakdown">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={categoryData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(value) => formatMoney(Number(value), snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)} />
            <Bar dataKey="total">
              {categoryData.map((entry) => (
                <Cell key={entry.categoryId} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>
      <ChartPanel title="Wallet Trend">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={walletData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(value) => formatMoney(Number(value), snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)} />
            <Line type="monotone" dataKey="total" stroke="#0891B2" strokeWidth={3} dot />
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>
      <ChartPanel title="Piloting Share">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={budgetData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={88} paddingAngle={4}>
              {budgetData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatMoney(Number(value), snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  );
}

function HistoryPanel({ filters, setFilters }: { filters: Filters; setFilters: (filters: Filters) => void }) {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const record = snapshot.years[String(snapshot.settings.selectedYear)];
  const history = snapshot.auditLog.filter((entry) => `${entry.summary} ${entry.type}`.toLowerCase().includes(filters.historyQuery.toLowerCase()));
  return (
    <div className="panel-stack">
      <div className="quick-add history-search">
        <Search size={17} />
        <input value={filters.historyQuery} onChange={(event) => setFilters({ ...filters, historyQuery: event.target.value })} placeholder="Search audit log" />
        <button className="command-button" onClick={() => exportWishlistCsv(snapshot)}>
          <Download size={16} />
          Wishlist CSV
        </button>
        <button className="command-button" onClick={() => exportWalletCsv(snapshot)}>
          <Download size={16} />
          Wallet CSV
        </button>
      </div>
      <div className="history-grid">
        <section className="history-card">
          <h3>Rollover History</h3>
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
          <h3>Audit Log</h3>
          {history.map((item) => (
            <div key={item.id} className="timeline-row">
              <Badge tone="neutral">{item.type}</Badge>
              <strong>{item.summary}</strong>
              <small>{formatDateTime(item.createdAt)}</small>
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
        <h3>Budget Settings</h3>
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
          <select value={snapshot.settings.roundingRule} onChange={(event) => updateSettings({ roundingRule: event.target.value as BudgetSnapshot["settings"]["roundingRule"] })}>
            <option value="none">None</option>
            <option value="nearest-1">Nearest 1</option>
            <option value="nearest-5">Nearest 5</option>
            <option value="nearest-10">Nearest 10</option>
            <option value="ceil-10">Ceil 10</option>
          </select>
        </label>
        <label>
          Currency display
          <select value={snapshot.settings.currencyDisplayMode} onChange={(event) => updateSettings({ currencyDisplayMode: event.target.value as BudgetSnapshot["settings"]["currencyDisplayMode"] })}>
            <option value="both">Symbol + code</option>
            <option value="symbol">Symbol</option>
            <option value="code">Code</option>
          </select>
        </label>
      </section>
      <section className="settings-card">
        <h3>Exchange Rates</h3>
        <label>
          EUR/USD
          <input
            type="number"
            value={snapshot.settings.exchangeRates.eurUsd}
            onChange={(event) =>
              updateSettings({
                exchangeRates: { ...snapshot.settings.exchangeRates, eurUsd: Number(event.target.value) },
              })
            }
          />
        </label>
        <label>
          USD/L.L.
          <input
            type="number"
            value={snapshot.settings.exchangeRates.usdLbp}
            onChange={(event) =>
              updateSettings({
                exchangeRates: { ...snapshot.settings.exchangeRates, usdLbp: Number(event.target.value) },
              })
            }
          />
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
          <input type="checkbox" checked={snapshot.settings.liveClockEnabled} onChange={(event) => updateSettings({ liveClockEnabled: event.target.checked })} />
          Live clock
        </label>
        <label className="check-row">
          <input type="checkbox" checked={snapshot.settings.saveTimestampEnabled} onChange={(event) => updateSettings({ saveTimestampEnabled: event.target.checked })} />
          Save timestamp
        </label>
      </section>
    </div>
  );
}

function RolloverDialog({ calculation, onClose }: { calculation: ReturnType<typeof calculateYear>; onClose: () => void }) {
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
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal">
        <button className="icon-button modal-close" onClick={onClose} title="Close">
          <X size={17} />
        </button>
        <div className="modal-icon">
          {blocked || (delta ?? 0) < 0 ? <AlertTriangle size={24} /> : <Wallet size={24} />}
        </div>
        <h2>Close {monthName(month)}</h2>
        <p>
          Month spend is <strong>{formatMoney(calculation.selectedMonthSpend.total, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode)}</strong>.
          Rollover delta is <strong>{formatMoney(delta, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode, { showSign: true })}</strong>.
        </p>
        {blocked && <p className="warning-text">This month is pending or explicitly NaN, so rollover is blocked unless you add an entry or mark a real zero.</p>}
        {delta != null && delta < 0 && <p className="warning-text">Negative delta will reduce the wallet and will be logged visibly.</p>}
        <div className="modal-actions">
          <button className="soft-button" onClick={() => close(false)}>
            Close Without Rollover
          </button>
          <button className="primary-button warn" disabled={blocked} onClick={() => close(true)}>
            Apply Rollover
          </button>
        </div>
      </section>
    </div>
  );
}

function LabeledNumber({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  return (
    <label className="mini-field">
      <span>{label}</span>
      <input inputMode="decimal" value={value ?? ""} onChange={(event) => onChange(parseAmount(event.target.value))} />
    </label>
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

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="chart-panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "neutral" | "info" | "success" | "danger" }) {
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

function matchesFilters(activity: Activity, filters: Filters): boolean {
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
  return (
    text.includes(filters.query.toLowerCase()) &&
    (filters.categoryId === "all" || entry.categoryId === filters.categoryId) &&
    (filters.currency === "all" || entry.currency === filters.currency)
  );
}

function matchesWishlistFilters(item: WishlistItem, filters: Filters): boolean {
  const text = `${item.name} ${item.notes}`.toLowerCase();
  return text.includes(filters.query.toLowerCase()) && (filters.currency === "all" || item.currency === filters.currency);
}
