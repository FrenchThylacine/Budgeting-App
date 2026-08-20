import { dateInputValue, getIsoWeek, startOfIsoWeek, weekYear } from "../domain/dates";
import { SEED_CATEGORIES, createSeedCategories } from "../domain/seedCategories";
import type {
  Activity,
  BudgetSnapshot,
  CurrencyCode,
  RecurrenceType,
  ScenarioPreset,
  SeasonalPreset,
  SeedCategoryKey,
  SpendingEntry,
  WishlistItem,
} from "../domain/types";

const SOURCE_YEAR = 2026;

/**
 * Seed identifiers must be unique per budget, not per codebase.
 *
 * Every `id` below is a primary key in its own table, and the tables are shared
 * by all budgets: `categories`, `activities`, `spending_entries`,
 * `wishlist_items`, `wallet_entries`, `audit_log`, `seasonal_presets` and
 * `scenario_presets` are all keyed on `id` alone. The seed used to hardcode
 * them (`cat-health`, `act-gym`, `wish-1`, …), so two budgets seeded from this
 * file collided on every single row. The repository's
 * `ON CONFLICT (id) DO UPDATE` then rewrote the existing row's contents while
 * leaving its owner column untouched — the second budget created would take
 * over the first one's rows and the first would be left with none.
 *
 * The factory is injectable so tests can be deterministic.
 */
export type SeedIdFactory = (prefix: string) => string;

function defaultSeedId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

/** Shape of the seed activity list, resolved to real ids at creation time. */
const activityTemplates: {
  key: string;
  name: string;
  categoryKey: SeedCategoryKey;
  currency: CurrencyCode;
  recurrenceType: RecurrenceType;
  recurrenceInterval: number;
  pricePerSession: number | null;
  pricePerPurchase: number | null;
  pricePerMonth: number | null;
  estimatedCost: number | null;
  yearlyEstimate: number | null;
  seasonalTag: string;
  notes: string;
}[] = [
  { key: "gym", name: "Gym", categoryKey: "cat-health", currency: "USD", recurrenceType: "session", recurrenceInterval: 10, pricePerSession: 38.5, pricePerPurchase: null, pricePerMonth: 385, estimatedCost: 385, yearlyEstimate: 4620, seasonalTag: "normal", notes: "10 sessions per month from the original workbook." },
  { key: "arabic", name: "Arabic", categoryKey: "cat-learning", currency: "USD", recurrenceType: "weekly", recurrenceInterval: 1, pricePerSession: 35, pricePerPurchase: null, pricePerMonth: 140, estimatedCost: 140, yearlyEstimate: 1680, seasonalTag: "school-term", notes: "Weekly Arabic sessions." },
  { key: "aviation", name: "Aviation (~aprox)", categoryKey: "cat-piloting", currency: "EUR", recurrenceType: "monthly", recurrenceInterval: 1, pricePerSession: null, pricePerPurchase: null, pricePerMonth: 1250, estimatedCost: 1250, yearlyEstimate: 15000, seasonalTag: "travel", notes: "Piloting budget kept separate but included in full totals." },
  { key: "pc-maint", name: "PC Maintenance", categoryKey: "cat-tech", currency: "USD", recurrenceType: "purchase", recurrenceInterval: 1, pricePerSession: 35, pricePerPurchase: 35, pricePerMonth: null, estimatedCost: 35, yearlyEstimate: 35, seasonalTag: "normal", notes: "Occasional one-time maintenance purchase." },
  { key: "navigraph", name: "Navigraph", categoryKey: "cat-piloting", currency: "EUR", recurrenceType: "yearly", recurrenceInterval: 1, pricePerSession: null, pricePerPurchase: null, pricePerMonth: null, estimatedCost: 81.64, yearlyEstimate: 81.64, seasonalTag: "travel", notes: "Annual piloting subscription." },
  { key: "alpha-4g", name: "Alpha 4G", categoryKey: "cat-utilities", currency: "USD", recurrenceType: "monthly", recurrenceInterval: 1, pricePerSession: null, pricePerPurchase: null, pricePerMonth: 26, estimatedCost: 26, yearlyEstimate: 312, seasonalTag: "normal", notes: "Monthly connectivity." },
  { key: "ogero", name: "Ogero", categoryKey: "cat-utilities", currency: "USD", recurrenceType: "monthly", recurrenceInterval: 1, pricePerSession: null, pricePerPurchase: null, pricePerMonth: 10, estimatedCost: 10, yearlyEstimate: 120, seasonalTag: "normal", notes: "Monthly internet bill." },
  { key: "nebula", name: "Nebula", categoryKey: "cat-software", currency: "EUR", recurrenceType: "yearly", recurrenceInterval: 1, pricePerSession: null, pricePerPurchase: null, pricePerMonth: null, estimatedCost: 43.2, yearlyEstimate: 43.2, seasonalTag: "normal", notes: "Annual software subscription." },
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

/**
 * The category list every budget starts with.
 *
 * Kept as a named export because callers used it to know *which* categories a
 * budget should have. It no longer carries ids — those belong to a specific
 * budget — so use `seedCategoryId()` from `domain/seedCategories` to resolve a
 * key against a real snapshot.
 */
export const defaultCategories = SEED_CATEGORIES;

/**
 * A budget with nothing in it.
 *
 * What a new account gets. The demo budget below is a fixture — someone else's
 * gym membership, someone else's wishlist — and starting a real account on it
 * means deleting ten things before recording the first real one, with no way to
 * tell which figures were yours.
 *
 * Categories are kept, because a budget with none cannot record anything: they
 * are the structure, not the data. Everything that represents a decision or a
 * transaction starts empty.
 */
export function createEmptyBudgetSnapshot(
  now = new Date(),
  makeId: SeedIdFactory = defaultSeedId,
): BudgetSnapshot {
  const base = createSeedBudgetSnapshot(now, makeId);
  const year = base.settings.selectedYear;
  const timestamp = now.toISOString();

  return {
    ...base,
    settings: {
      ...base.settings,
      // No inherited budget figure either: a number nobody chose is worse than
      // an empty field, because it looks like a decision.
      monthlyBudget: 0,
      lastUpdated: timestamp,
    },
    years: {
      [year]: {
        year,
        activities: [],
        spendingEntries: [],
        wishlistItems: [],
        walletEntries: [],
        closedMonths: [],
        monthlyNotes: {},
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    },
    seasonalPresets: [],
    scenarioPresets: [],
    budgetApprovals: [],
    auditLog: [
      {
        id: makeId("audit"),
        type: "import",
        summary: "Account created.",
        createdAt: timestamp,
      },
    ],
  };
}

export function createSeedBudgetSnapshot(
  now = new Date(),
  makeId: SeedIdFactory = defaultSeedId,
): BudgetSnapshot {
  const timestamp = now.toISOString();
  const selectedWeek = now.getFullYear() === SOURCE_YEAR ? getIsoWeek(now) : 1;

  const categories = createSeedCategories(() => makeId("cat"));
  const categoryIdFor = (key: SeedCategoryKey): string => {
    const match = categories.find((category) => category.seedKey === key);
    // Unreachable: `categories` is built from the same key list this reads.
    // Throwing beats returning a fabricated id, which would fail later as an
    // opaque foreign-key violation on ON DELETE RESTRICT.
    if (!match) throw new Error(`Seed category "${key}" is missing from the seed list.`);
    return match.id;
  };

  const activityIds = new Map(activityTemplates.map((template) => [template.key, makeId("act")]));
  const activities = createActivities(activityIds, categoryIdFor);
  const spendingEntries = createSpendingEntries(timestamp, makeId, categoryIdFor("cat-spending"));
  const wishlistItems = createWishlistItems(timestamp, makeId, categoryIdFor("cat-wishlist"));

  return {
    version: 1,
    settings: {
      selectedYear: SOURCE_YEAR,
      selectedMonth: now.getFullYear() === SOURCE_YEAR ? now.getMonth() + 1 : 1,
      selectedWeek,
      selectedWeekYear: weekYear(now),
      selectedPeriodMode: "month",
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
    categories,
    years: {
      [SOURCE_YEAR]: {
        year: SOURCE_YEAR,
        activities,
        spendingEntries,
        wishlistItems,
        walletEntries: [
          {
            id: makeId("wallet"),
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
    seasonalPresets: createSeasonalPresets(makeId, activityIds),
    scenarioPresets: createScenarioPresets(makeId),
    budgetApprovals: [],
    auditLog: [
      {
        id: makeId("audit"),
        type: "import",
        summary: "Seeded from the Budget Full workbook structure.",
        createdAt: timestamp,
        metadata: { source: "Budget Full.xlsx" },
      },
    ],
  };
}

function createActivities(
  activityIds: Map<string, string>,
  categoryIdFor: (key: SeedCategoryKey) => string,
): Activity[] {
  return activityTemplates.map((template, index) => ({
    id: activityIds.get(template.key)!,
    name: template.name,
    categoryId: categoryIdFor(template.categoryKey),
    currency: template.currency,
    recurrenceType: template.recurrenceType,
    recurrenceInterval: template.recurrenceInterval,
    pricePerSession: template.pricePerSession,
    pricePerPurchase: template.pricePerPurchase,
    pricePerMonth: template.pricePerMonth,
    estimatedCost: template.estimatedCost,
    yearlyEstimate: template.yearlyEstimate,
    active: true,
    visible: true,
    seasonalTag: template.seasonalTag,
    // Previously derived by looking the id up in a hardcoded list, which
    // returned -1 for anything not in it. The list order is the order.
    order: index,
    notes: template.notes,
  }));
}

function createWishlistItems(
  timestamp: string,
  makeId: SeedIdFactory,
  categoryId: string,
): WishlistItem[] {
  return wishlist.map(([name, price, bought, inWishlist, priority]) => ({
    id: makeId("wish"),
    name,
    categoryId,
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

function createSpendingEntries(
  timestamp: string,
  makeId: SeedIdFactory,
  categoryId: string,
): SpendingEntry[] {
  const entries: SpendingEntry[] = [];
  for (const [week, usdAmount, eurAmount] of spendingWeeks) {
    const date = dateInputValue(startOfIsoWeek(SOURCE_YEAR, week));
    const month = new Date(`${date}T00:00:00`).getMonth() + 1;
    if (usdAmount !== null) {
      entries.push({
        id: makeId("spend"),
        year: SOURCE_YEAR,
        month,
        week,
        date,
        categoryId,
        amount: usdAmount,
        currency: "USD",
        recurrenceType: "none",
        isPiloting: false,
        source: "personal",
        note: `Imported Week ${week} L.L. + USD amount.`,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    if (eurAmount !== null) {
      entries.push({
        id: makeId("spend"),
        year: SOURCE_YEAR,
        month,
        week,
        date,
        categoryId,
        amount: eurAmount,
        currency: "EUR",
        recurrenceType: "none",
        isPiloting: false,
        source: "personal",
        note: `Imported Week ${week} EUR amount.`,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }
  return entries;
}

function createSeasonalPresets(
  makeId: SeedIdFactory,
  activityIds: Map<string, string>,
): SeasonalPreset[] {
  // Overrides are keyed by activity id, so they have to be rebuilt against the
  // ids this budget actually generated rather than the old hardcoded ones.
  const act = (key: string): string => activityIds.get(key)!;

  return [
    {
      id: makeId("season"),
      name: "Normal Mode",
      season: "normal",
      activityOverrides: {},
      notes: "Default workbook-inspired setup.",
    },
    {
      id: makeId("season"),
      name: "Summer",
      season: "summer",
      activityOverrides: {
        [act("arabic")]: { visible: false, active: false },
        [act("aviation")]: { visible: true, active: true },
      },
      notes: "Light study load, more flexible piloting planning.",
    },
    {
      id: makeId("season"),
      name: "School Term",
      season: "school-term",
      activityOverrides: {
        [act("arabic")]: { visible: true, active: true },
        [act("aviation")]: { pricePerMonth: 850 },
      },
      notes: "Keeps lessons visible and trims piloting intensity.",
    },
    {
      id: makeId("season"),
      name: "Travel Mode",
      season: "travel",
      activityOverrides: {
        [act("aviation")]: { visible: true, active: true, pricePerMonth: 1500 },
        [act("navigraph")]: { visible: true, active: true },
      },
      notes: "Piloting-heavy scenario.",
    },
  ];
}

function createScenarioPresets(makeId: SeedIdFactory): ScenarioPreset[] {
  return [
    {
      id: makeId("scenario"),
      name: "Balanced",
      monthlyBudget: 600 / 1.19,
      pilotIncludedInBudget: true,
      notes: "Current workbook baseline.",
    },
    {
      id: makeId("scenario"),
      name: "Tight Month",
      monthlyBudget: 450 / 1.19,
      pilotIncludedInBudget: false,
      notes: "Lower allowance and pilots excluded from the active budget card.",
    },
    {
      id: makeId("scenario"),
      name: "Travel Push",
      monthlyBudget: 800 / 1.19,
      pilotIncludedInBudget: true,
      notes: "Higher allowance for travel/piloting months.",
    },
  ];
}
