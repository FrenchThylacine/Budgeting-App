export type CurrencyCode =
  | "EUR"
  | "USD"
  | "LBP"
  | "GBP"
  | "CAD"
  | "AUD"
  | "JPY"
  | "TRY"
  | "SAR"
  | "AED";

export type CurrencyDisplayMode = "symbol" | "code" | "both";
export type RoundingRule = "none" | "nearest-1" | "nearest-5" | "nearest-10" | "ceil-10";
export type NanPolicy = "closed-periods-only";
export type PeriodMode = "month" | "week" | "year";
export type RecurrenceType =
  | "none"
  | "weekly"
  | "monthly"
  | "yearly"
  | "session"
  | "purchase"
  | "custom";
export type BudgetBucket = "general" | "piloting" | "personal" | "wallet";
export type WalletEntryType = "opening" | "personal" | "budget" | "rollover" | "adjustment";
export type PeriodStatus = "value" | "zero" | "pending" | "nan";
export type AuditType =
  | "import"
  | "export"
  | "save"
  | "activity"
  | "spending"
  | "wishlist"
  | "wallet"
  | "rollover"
  | "year"
  | "preset"
  | "settings"
  | "delete"
  | "undo"
  | "redo";

export interface ExchangeRates {
  eurUsd: number;
  usdLbp: number;
  /** Manual override: units of the base currency per 1 unit of the key. */
  customToBase: Partial<Record<CurrencyCode, number>>;
  /**
   * Units of each currency per 1 EUR, as published by the rate provider.
   * Base-independent, so changing the display currency does not invalidate
   * them — unlike `customToBase`, which is relative to the current base.
   */
  perEur?: Partial<Record<CurrencyCode, number>>;
  /** When `perEur` was last refreshed, for display and staleness checks. */
  ratesUpdatedAt?: string;
  /** Where `perEur` came from, e.g. the provider host. */
  ratesSource?: string;
}

/** Swipe preferences, keyed by list. Absent means "use the defaults". */
export interface GestureSettings {
  wishlist?: { trailing?: SwipeActionId; leading?: SwipeActionId };
  activities?: { trailing?: SwipeActionId; leading?: SwipeActionId };
  spending?: { trailing?: SwipeActionId; leading?: SwipeActionId };
}

export type SwipeActionId = "none" | "delete" | "archive" | "buy" | "edit" | "duplicate";

export interface Settings {
  selectedYear: number;
  selectedMonth: number;
  selectedWeek: number;
  /** ISO week-year; separate from the calendar year used by monthly records. */
  selectedWeekYear: number;
  selectedPeriodMode: PeriodMode;
  selectedSeason: string;
  baseCurrency: CurrencyCode;
  currencyDisplayMode: CurrencyDisplayMode;
  roundingRule: RoundingRule;
  autoWalletRollupEnabled: boolean;
  autoWishlistFlushEnabled: boolean;
  pilotIncludedInBudget: boolean;
  promptBeforeMonthClose: boolean;
  liveClockEnabled: boolean;
  /**
   * Swipe actions per list.
   *
   * Optional: an account that has never opened the gesture settings has no
   * stored value and the defaults apply. Writing a full copy up front would
   * freeze today's defaults into every account forever.
   */
  gestures?: GestureSettings;
  nanPolicy: NanPolicy;
  saveTimestampEnabled: boolean;
  monthlyBudget: number;
  monthlyBudgetCurrency: CurrencyCode;
  exchangeRates: ExchangeRates;
  lastUpdated: string;
  darkMode: boolean;
  ignoreNonBudgetSpending?: boolean;
}

/**
 * Stable keys for the categories every budget is seeded with. The values are
 * the ids the seed used to hardcode, so data written before seed keys existed
 * still resolves.
 */
export type SeedCategoryKey =
  | "cat-health"
  | "cat-learning"
  | "cat-piloting"
  | "cat-utilities"
  | "cat-software"
  | "cat-tech"
  | "cat-other"
  | "cat-spending"
  | "cat-wallet"
  | "cat-wishlist";

export interface BudgetCategory {
  id: string;
  /**
   * Stable identity of a category that came from the seed, independent of its
   * row id.
   *
   * The seed used to hardcode its ids (`cat-health`, `cat-piloting`, …) and
   * nine places across the app matched on them directly. That is safe for a
   * single budget and unsafe for several: `categories.id` is the primary key,
   * so two budgets seeded from the same list collide on one row, and the
   * repository's `ON CONFLICT (id) DO UPDATE` then rewrites its contents
   * without ever changing `snapshot_id` — one budget's categories silently
   * become another's.
   *
   * Row ids are therefore generated per budget, and anything that needs to
   * find "the wishlist category" resolves it through this key instead. The key
   * values are the old ids, so existing rows keep resolving unchanged.
   */
  seedKey?: SeedCategoryKey;
  name: string;
  bucket: BudgetBucket;
  color: string;
  monthlyCap?: number;
  notes?: string;
  /** Soft-archive flag for UI; categories are preserved in history */
  archived?: boolean;
  /** Lucide icon name */
  icon?: string;
  /** Optional description for the category */
  description?: string;
  /** Parent category id for subcategory grouping (1-level deep) */
  parentId?: string;
}

/**
 * How an activity's monthly cost is derived.
 *  - `auto`      : legacy behaviour, inferred from recurrenceType and prices.
 *  - `perSession`: price per session × sessions per month.
 *  - `schedule`  : price per session × real occurrences in the actual month,
 *                  counted from weekdays or a day-of-month rule.
 *  - `fixed`     : an explicit monthly amount.
 */
export type CostModel = "auto" | "perSession" | "schedule" | "fixed";

/** 1 = Monday … 7 = Sunday, matching ISO weekday numbering. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Activity {
  id: string;
  name: string;
  categoryId: string;
  currency: CurrencyCode;
  recurrenceType: RecurrenceType;
  recurrenceInterval: number;
  pricePerSession: number | null;
  pricePerPurchase: number | null;
  pricePerMonth: number | null;
  estimatedCost: number | null;
  yearlyEstimate: number | null;
  active: boolean;
  visible: boolean;
  seasonalTag: string;
  order: number;
  notes: string;
  /** Lucide icon name shown on the activity card. */
  icon?: string;
  /** Accent colour that themes the whole activity widget. */
  color?: string;
  /** Which model drives the monthly estimate. Defaults to `auto`. */
  costModel?: CostModel;
  /** Sessions per month for the `perSession` model. */
  sessionsPerMonth?: number | null;
  /** ISO weekdays the activity occurs on, for the `schedule` model. */
  weekdays?: IsoWeekday[];
  /** Day of month (1-31) for monthly schedules, e.g. a subscription renewal. */
  dayOfMonth?: number | null;
  /** First date the schedule applies from (YYYY-MM-DD). */
  startDate?: string;
  /**
   * One-off exceptions to the recurring rule.
   *
   * A week skipped, a lesson moved, an extra session, a different price once —
   * real life does not follow the rule exactly, and editing the rule to record
   * a single exception corrupts every other month it produces. These override
   * individual occurrences and leave the rule untouched.
   */
  scheduleOverrides?: ScheduleOverride[];
}

/** What an override does to the occurrence it names. */
export type ScheduleOverrideKind = "skip" | "move" | "extra" | "price";

export interface ScheduleOverride {
  id: string;
  kind: ScheduleOverrideKind;
  /**
   * The occurrence being overridden (YYYY-MM-DD).
   *
   * For `skip`, `move` and `price` this is the date the recurring rule
   * produces. For `extra` it is the added date, which the rule never produces.
   */
  date: string;
  /** Where a `move` puts the occurrence (YYYY-MM-DD). */
  movedTo?: string;
  /**
   * Price for this one occurrence, in the activity's own currency.
   *
   * Used by `price` and optionally by `extra`. `null` means the price is not
   * stated — which is not the same as free, so it is never read as zero.
   */
  amount?: number | null;
  /** Why, for the audit trail and the tooltip. */
  note?: string;
}

export interface SpendingEntry {
  id: string;
  year: number;
  month: number;
  week: number;
  date: string;
  categoryId: string;
  activityId?: string;
  amount: number;
  currency: CurrencyCode;
  recurrenceType: RecurrenceType;
  isPiloting: boolean;
  /**
   * Source indicates whether this spending came from the user's personal budget
   * or from an external payer (shared, reimbursed, etc.). Defaults to 'personal'.
   */
  source?: "personal" | "external" | "shared" | string;
  note: string;
  /** Wishlist item this purchase fulfilled, when the two were linked. */
  wishlistItemId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Ordered most to least urgent. "dream" sits below "low": it is an aspiration
 * rather than something competing for this month's budget.
 */
export type WishlistPriority = "high" | "medium" | "low" | "dream";

export interface WishlistItem {
  id: string;
  name: string;
  categoryId: string;
  actualPrice: number | null;
  effectiveValue: number | null;
  currency: CurrencyCode;
  bought: boolean;
  inWishlist: boolean;
  priority: WishlistPriority;
  dateAdded: string;
  datePurchased?: string;
  notes: string;
  active: boolean;
  /** Where the item is bought. Never replaced by the brand link below. */
  url?: string;
  /**
   * Where the item's visual identity comes from, when that is not the shop.
   *
   * A model kit bought from a marketplace is made by a manufacturer; an add-on
   * sold on one store is built by a studio. Using the shop's favicon for both
   * makes every item from that shop look identical, and using the brand's
   * link to buy from would send the user to the wrong place. They are two
   * different facts, so they are two fields.
   *
   * Falls back to `url` when absent, so nothing changes for items that have
   * only a purchase link.
   */
  brandUrl?: string;
  /**
   * A chosen icon from the library.
   *
   * Takes priority over the favicon. Many sites have no usable icon, and some
   * return a generic placeholder that looks like a broken image — picking one
   * from the library is the only reliable way out, so an explicit choice must
   * win over anything derived from a URL.
   */
  icon?: string;
  /** Accent colour for the item card. */
  color?: string;
  /** Spending entry created when this item was bought, when linked. */
  linkedSpendingId?: string;
}

export interface WalletEntry {
  id: string;
  year: number;
  month: number;
  amount: number;
  currency: CurrencyCode;
  source: string;
  type: WalletEntryType;
  note: string;
  createdAt: string;
}

export interface ScenarioPreset {
  id: string;
  name: string;
  monthlyBudget?: number;
  pilotIncludedInBudget?: boolean;
  categoryCaps?: Record<string, number>;
  notes: string;
}

export interface SeasonalPreset {
  id: string;
  name: string;
  season: string;
  activityOverrides: Record<
    string,
    Partial<Pick<Activity, "active" | "visible" | "pricePerMonth" | "recurrenceType" | "recurrenceInterval" | "currency">>
  >;
  notes: string;
}

export interface MonthCloseRecord {
  id: string;
  year: number;
  month: number;
  status: "closed-with-rollover" | "closed-without-rollover" | "blocked-missing-data";
  spendTotal: number | null;
  delta: number | null;
  rolloverWalletEntryId?: string;
  confirmedAt: string;
  note: string;
}

export interface AuditLog {
  id: string;
  type: AuditType;
  summary: string;
  createdAt: string;
  /** True when this change rewrote a closed period via the explicit override. */
  historicalEdit?: boolean;
  /** Label of the closed period that was edited, when `historicalEdit` is set. */
  historicalPeriod?: string;
  metadata?: Record<string, unknown>;
}

export interface BudgetApproval {
  id: string;
  year: number;
  month: number;
  suggestedAmount: number;
  approvedAmount: number | null;
  currency: CurrencyCode;
  status: "approved" | "rejected";
  recurringTotal: number;
  createdAt: string;
  decidedAt: string;
  note: string;
}

export interface MonthlyNote {
  month: number;
  note: string;
  updatedAt: string;
}

export interface YearRecord {
  year: number;
  activities: Activity[];
  spendingEntries: SpendingEntry[];
  wishlistItems: WishlistItem[];
  walletEntries: WalletEntry[];
  closedMonths: MonthCloseRecord[];
  monthlyNotes: Record<number, MonthlyNote>;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetSnapshot {
  version: 1;
  /**
   * Monotonically increasing sync counter used for optimistic concurrency.
   * Each client commit increments it; the server rejects writes whose
   * revision is not newer than the stored one so a stale device cannot
   * silently overwrite data written from another device.
   */
  revision?: number;
  settings: Settings;
  categories: BudgetCategory[];
  years: Record<string, YearRecord>;
  seasonalPresets: SeasonalPreset[];
  scenarioPresets: ScenarioPreset[];
  budgetApprovals: BudgetApproval[];
  auditLog: AuditLog[];
}

export interface PeriodSummary {
  label: string;
  year: number;
  month?: number;
  week?: number;
  status: PeriodStatus;
  total: number | null;
  generalTotal: number | null;
  pilotingTotal: number | null;
  /** Sum of personal-budget spend (excludes external/shared) */
  personalTotal?: number | null;
  /** Sum of external/shared spend */
  externalTotal?: number | null;
  entryCount: number;
  isClosed: boolean;
}

export interface CategoryTotal {
  categoryId: string;
  categoryName: string;
  bucket: BudgetBucket;
  color: string;
  total: number;
}

export interface ActivityEstimate {
  activity: Activity;
  monthlyBase: number;
  yearlyBase: number;
  bucket: BudgetBucket;
}

export interface WishlistSummary {
  activeTotal: number;
  boughtTotal: number;
  historyTotal: number;
  activeCount: number;
  boughtCount: number;
}

export interface WalletSummary {
  walletTotal: number;
  personalWalletTotal: number;
  rolloverTotal: number;
  openingBalance: number;
}

export interface YearCalculation {
  year: number;
  month: number;
  week: number;
  monthlyBudgetBase: number;
  generalBudget: number;
  pilotingBudget: number;
  combinedBudget: number;
  includedBudget: number;
  selectedMonthSpend: PeriodSummary;
  selectedWeekSpend: PeriodSummary;
  totalSpend: number;
  delta: number | null;
  rolloverDelta: number | null;
  roundedMonthlyValue: number;
  wallet: WalletSummary;
  wishlist: WishlistSummary;
  ytdTotal: number;
  activityEstimates: ActivityEstimate[];
  categoryTotals: CategoryTotal[];
  monthlyTrend: PeriodSummary[];
  weeklyTrend: PeriodSummary[];
}
