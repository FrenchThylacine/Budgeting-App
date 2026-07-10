import { dateInputValue, getIsoWeek, startOfIsoWeek } from "../domain/dates";
import type {
  Activity,
  BudgetCategory,
  BudgetSnapshot,
  CurrencyCode,
  RecurrenceType,
  ScenarioPreset,
  SeasonalPreset,
  SpendingEntry,
  WishlistItem,
} from "../domain/types";

const SOURCE_YEAR = 2026;

export const defaultCategories: BudgetCategory[] = [
  { id: "cat-health", name: "Health", bucket: "general", color: "#16A34A" },
  { id: "cat-learning", name: "Learning", bucket: "general", color: "#2563EB" },
  { id: "cat-piloting", name: "Piloting", bucket: "piloting", color: "#F59E0B" },
  { id: "cat-utilities", name: "Utilities", bucket: "general", color: "#0D9488" },
  { id: "cat-software", name: "Software", bucket: "general", color: "#7C3AED" },
  { id: "cat-tech", name: "Tech & Gear", bucket: "personal", color: "#E11D48" },
  { id: "cat-spending", name: "Imported Spending", bucket: "general", color: "#475569" },
  { id: "cat-wallet", name: "Wallet", bucket: "wallet", color: "#0891B2" },
  { id: "cat-wishlist", name: "Wishlist", bucket: "personal", color: "#DB2777" },
];

const activities: Activity[] = [
  activity("act-gym", "Gym", "cat-health", "USD", "session", 10, 38.5, null, 385, 385, 4620, "normal", "10 sessions per month from the original workbook."),
  activity("act-arabic", "Arabic", "cat-learning", "USD", "weekly", 1, 35, null, 140, 140, 1680, "school-term", "Weekly Arabic sessions."),
  activity("act-aviation", "Aviation (~aprox)", "cat-piloting", "EUR", "monthly", 1, null, null, 1250, 1250, 15000, "travel", "Piloting budget kept separate but included in full totals."),
  activity("act-pc-maint", "PC Maintenance", "cat-tech", "USD", "purchase", 1, 35, 35, null, 35, 35, "normal", "Occasional one-time maintenance purchase."),
  activity("act-navigraph", "Navigraph", "cat-piloting", "EUR", "yearly", 1, null, null, null, 81.64, 81.64, "travel", "Annual piloting subscription."),
  activity("act-alpha-4g", "Alpha 4G", "cat-utilities", "USD", "monthly", 1, null, null, 26, 26, 312, "normal", "Monthly connectivity."),
  activity("act-ogero", "Ogero", "cat-utilities", "USD", "monthly", 1, null, null, 10, 10, 120, "normal", "Monthly internet bill."),
  activity("act-nebula", "Nebula", "cat-software", "EUR", "yearly", 1, null, null, null, 43.2, 43.2, "normal", "Annual software subscription."),
];

const wishlist: Array<[string, number | null, boolean, boolean, WishlistItem["priority"]]> = [
  ["Zephyrus G14", 2700, false, false, "dream"],
  ["2Tb SSD", 280, false, false, "high"],
  ["Steam Frame", 900, false, true, "dream"],
  ["WinCTRL UrsaMinor", 60, false, false, "medium"],
  ["MeridianGMT Latitude+", 369, false, true, "high"],
  ["BATC", 30, true, false, "medium"],
  ["Contrail FA50", 33, false, false, "medium"],
  ["AzurPoly Rafale", null, false, false, "low"],
  ["Rafale Model", 57.8, false, false, "medium"],
  ["Inibuild L1011", 55, true, false, "medium"],
  ["PSESIM CDG", null, false, false, "low"],
  ["Synaptic A220", null, false, false, "low"],
  ["FSS Tu154M", null, false, false, "low"],
];

const spendingWeeks: Array<[number, number | null, number | null]> = [
  [9, 41.66666666666667, 30],
  [10, 35, 0],
  [11, 445, 0],
  [12, 41.666666666666664, 5],
  [13, 46.666666666666664, 0],
  [14, 17.77777777777778, 0],
  [15, 416, 0],
  [16, 35, 55],
  [17, 10, 0],
  [18, 35, 0],
  [19, 35, 0],
  [20, 435, 0],
  [21, 35, 0],
  [22, 35, 0],
  [23, 35, 0],
  [24, 35, 0],
  [25, 400, null],
];

export function createSeedBudgetSnapshot(now = new Date()): BudgetSnapshot {
  const timestamp = now.toISOString();
  const selectedWeek = now.getFullYear() === SOURCE_YEAR ? getIsoWeek(now) : 1;
  const spendingEntries = createSpendingEntries(timestamp);
  const wishlistItems = createWishlistItems(timestamp);

  return {
    version: 1,
    settings: {
      selectedYear: SOURCE_YEAR,
      selectedMonth: now.getFullYear() === SOURCE_YEAR ? now.getMonth() + 1 : 1,
      selectedWeek,
      selectedSeason: "normal",
      baseCurrency: "EUR",
      currencyDisplayMode: "both",
      roundingRule: "nearest-1",
      autoWalletRollupEnabled: true,
      autoWishlistFlushEnabled: true,
      pilotIncludedInBudget: true,
      promptBeforeMonthClose: true,
      liveClockEnabled: true,
      nanPolicy: "closed-periods-only",
      saveTimestampEnabled: true,
      monthlyBudget: 600 / 1.19,
      monthlyBudgetCurrency: "EUR",
      exchangeRates: {
        eurUsd: 1.19,
        usdLbp: 90000,
        customToBase: {},
      },
      lastUpdated: timestamp,
      darkMode: false,
    },
    categories: defaultCategories,
    years: {
      [SOURCE_YEAR]: {
        year: SOURCE_YEAR,
        activities,
        spendingEntries,
        wishlistItems,
        walletEntries: [
          {
            id: "wallet-opening-2026",
            year: SOURCE_YEAR,
            month: now.getFullYear() === SOURCE_YEAR ? now.getMonth() + 1 : 1,
            amount: 339.3864612511669,
            currency: "EUR",
            source: "Personal Balance",
            type: "opening",
            note: "Imported from Budget!J1 in the original workbook.",
            createdAt: timestamp,
          },
        ],
        closedMonths: [],
        monthlyNotes: {},
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    },
    seasonalPresets: createSeasonalPresets(),
    scenarioPresets: createScenarioPresets(),
    auditLog: [
      {
        id: "audit-initial-import",
        type: "import",
        summary: "Seeded from Budget Full.xlsx workbook structure.",
        createdAt: timestamp,
        metadata: { source: "C:\\Users\\iyadf\\Downloads\\Budget Full.xlsx" },
      },
    ],
  };
}

function activity(
  id: string,
  name: string,
  categoryId: string,
  currency: CurrencyCode,
  recurrenceType: RecurrenceType,
  recurrenceInterval: number,
  pricePerSession: number | null,
  pricePerPurchase: number | null,
  pricePerMonth: number | null,
  estimatedCost: number | null,
  yearlyEstimate: number | null,
  seasonalTag: string,
  notes: string,
): Activity {
  return {
    id,
    name,
    categoryId,
    currency,
    recurrenceType,
    recurrenceInterval,
    pricePerSession,
    pricePerPurchase,
    pricePerMonth,
    estimatedCost,
    yearlyEstimate,
    active: true,
    visible: true,
    seasonalTag,
    order: activitiesOrder(id),
    notes,
  };
}

function activitiesOrder(id: string): number {
  return [
    "act-gym",
    "act-arabic",
    "act-aviation",
    "act-pc-maint",
    "act-navigraph",
    "act-alpha-4g",
    "act-ogero",
    "act-nebula",
  ].indexOf(id);
}

function createWishlistItems(timestamp: string): WishlistItem[] {
  return wishlist.map(([name, price, bought, inWishlist, priority], index) => ({
    id: `wish-${index + 1}`,
    name,
    categoryId: "cat-wishlist",
    actualPrice: price,
    effectiveValue: bought || !inWishlist || price == null ? 0 : price,
    currency: "EUR",
    bought,
    inWishlist,
    priority,
    dateAdded: timestamp,
    datePurchased: bought ? timestamp : undefined,
    notes: "Imported from the wishlist block in the original workbook.",
    active: true,
  }));
}

function createSpendingEntries(timestamp: string): SpendingEntry[] {
  const entries: SpendingEntry[] = [];
  for (const [week, usdAmount, eurAmount] of spendingWeeks) {
    const date = dateInputValue(startOfIsoWeek(SOURCE_YEAR, week));
    const month = new Date(`${date}T00:00:00`).getMonth() + 1;
    if (usdAmount !== null) {
      entries.push({
        id: `spend-${week}-usd`,
        year: SOURCE_YEAR,
        month,
        week,
        date,
        categoryId: "cat-spending",
        amount: usdAmount,
        currency: "USD",
        recurrenceType: "none",
        isPiloting: false,
        note: `Imported Week ${week} L.L. + USD amount.`,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    if (eurAmount !== null) {
      entries.push({
        id: `spend-${week}-eur`,
        year: SOURCE_YEAR,
        month,
        week,
        date,
        categoryId: "cat-spending",
        amount: eurAmount,
        currency: "EUR",
        recurrenceType: "none",
        isPiloting: false,
        note: `Imported Week ${week} EUR amount.`,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }
  return entries;
}

function createSeasonalPresets(): SeasonalPreset[] {
  return [
    {
      id: "season-normal",
      name: "Normal Mode",
      season: "normal",
      activityOverrides: {},
      notes: "Default workbook-inspired setup.",
    },
    {
      id: "season-summer",
      name: "Summer",
      season: "summer",
      activityOverrides: {
        "act-arabic": { visible: false, active: false },
        "act-aviation": { visible: true, active: true },
      },
      notes: "Light study load, more flexible piloting planning.",
    },
    {
      id: "season-school",
      name: "School Term",
      season: "school-term",
      activityOverrides: {
        "act-arabic": { visible: true, active: true },
        "act-aviation": { pricePerMonth: 850 },
      },
      notes: "Keeps lessons visible and trims piloting intensity.",
    },
    {
      id: "season-travel",
      name: "Travel Mode",
      season: "travel",
      activityOverrides: {
        "act-aviation": { visible: true, active: true, pricePerMonth: 1500 },
        "act-navigraph": { visible: true, active: true },
      },
      notes: "Piloting-heavy scenario.",
    },
  ];
}

function createScenarioPresets(): ScenarioPreset[] {
  return [
    {
      id: "scenario-balanced",
      name: "Balanced",
      monthlyBudget: 600 / 1.19,
      pilotIncludedInBudget: true,
      notes: "Current workbook baseline.",
    },
    {
      id: "scenario-tight",
      name: "Tight Month",
      monthlyBudget: 450 / 1.19,
      pilotIncludedInBudget: false,
      notes: "Lower allowance and pilots excluded from the active budget card.",
    },
    {
      id: "scenario-travel",
      name: "Travel Push",
      monthlyBudget: 800 / 1.19,
      pilotIncludedInBudget: true,
      notes: "Higher allowance for travel/piloting months.",
    },
  ];
}
