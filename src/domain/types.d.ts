export type CurrencyCode = "EUR" | "USD" | "LBP" | "GBP" | "CAD" | "AUD" | "JPY" | "TRY" | "SAR" | "AED";
export type CurrencyDisplayMode = "symbol" | "code" | "both";
export type RoundingRule = "none" | "nearest-1" | "nearest-5" | "nearest-10" | "ceil-10";
export type NanPolicy = "closed-periods-only";
export type RecurrenceType = "none" | "weekly" | "monthly" | "yearly" | "session" | "purchase" | "custom";
export type BudgetBucket = "general" | "piloting" | "personal" | "wallet";
export type WalletEntryType = "opening" | "personal" | "budget" | "rollover" | "adjustment";
export type PeriodStatus = "value" | "zero" | "pending" | "nan";
export type AuditType = "import" | "export" | "save" | "activity" | "spending" | "wishlist" | "wallet" | "rollover" | "year" | "preset" | "settings" | "delete" | "undo" | "redo";
export interface ExchangeRates {
    eurUsd: number;
    usdLbp: number;
    customToBase: Partial<Record<CurrencyCode, number>>;
}
export interface Settings {
    selectedYear: number;
    selectedMonth: number;
    selectedWeek: number;
    selectedSeason: string;
    baseCurrency: CurrencyCode;
    currencyDisplayMode: CurrencyDisplayMode;
    roundingRule: RoundingRule;
    autoWalletRollupEnabled: boolean;
    autoWishlistFlushEnabled: boolean;
    pilotIncludedInBudget: boolean;
    promptBeforeMonthClose: boolean;
    liveClockEnabled: boolean;
    nanPolicy: NanPolicy;
    saveTimestampEnabled: boolean;
    monthlyBudget: number;
    monthlyBudgetCurrency: CurrencyCode;
    exchangeRates: ExchangeRates;
    lastUpdated: string;
    darkMode: boolean;
}
export interface BudgetCategory {
    id: string;
    name: string;
    bucket: BudgetBucket;
    color: string;
    monthlyCap?: number;
    notes?: string;
    /** Soft-archive flag for UI; categories are preserved in history */
    archived?: boolean;
}
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
    createdAt: string;
    updatedAt: string;
}
export interface WishlistItem {
    id: string;
    name: string;
    categoryId: string;
    actualPrice: number | null;
    effectiveValue: number | null;
    currency: CurrencyCode;
    bought: boolean;
    inWishlist: boolean;
    priority: "low" | "medium" | "high" | "dream";
    dateAdded: string;
    datePurchased?: string;
    notes: string;
    active: boolean;
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
    activityOverrides: Record<string, Partial<Pick<Activity, "active" | "visible" | "pricePerMonth" | "recurrenceType" | "recurrenceInterval" | "currency">>>;
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
//# sourceMappingURL=types.d.ts.map