/**
 * Every ISO 4217 code the application knows.
 *
 * This used to be a hand-written union of ten, which is what made the app
 * unable to record an amount in any other currency. It is now derived from the
 * dataset in `domain/currencies.ts`, so the type and the table can never
 * disagree — and adding a currency is a row rather than an edit in two places.
 */
export type { CurrencyCode } from "./currencies";
import type { CurrencyCode } from "./currencies";
import type { FundingKind } from "./funding";
import type { AircraftId, FleetId } from "./aircraft";
import type { Appearance } from "./theme";

export type CurrencyDisplayMode = "symbol" | "code" | "both";
export type RoundingRule = "none" | "nearest-1" | "nearest-5" | "nearest-10" | "ceil-10";
/**
 * How a period with no recorded entries is reported.
 *
 * There is exactly one policy and it is not configurable: a period that has
 * already closed with nothing recorded is *missing* data ("nan"), and one that
 * is still open is *pending*. Neither is zero. This was a stored setting with
 * a single legal value, which made an invariant look like a preference —
 * `isMonthClosed`/`isWeekClosed` decide it, and nothing reads a setting.
 */
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
/**
 * What a wallet ledger entry is.
 *
 *  - `opening`    : where the ledger starts. The one entry that asserts a
 *                   balance rather than a movement.
 *  - `budget`     : a **budget allocation** — money received for the month's
 *                   budget. Increases both the cash held and the budget still
 *                   available.
 *  - `personal`   : the user's own money in or out, outside the budget.
 *  - `transfer`   : leftover budget money reclassified as personal. Changes
 *                   how much is *spoken for*, not how much exists, so its
 *                   effect on the wallet balance is deliberately zero.
 *  - `rollover`   : a month-close adjustment from the older rollover feature.
 *  - `adjustment` : a correction, including the one "Reset wallet" writes.
 *
 * See `domain/wallet.ts` for what each does to the three balances.
 */
export type WalletEntryType = "opening" | "personal" | "budget" | "rollover" | "adjustment" | "transfer";
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
  /**
   * When the last refresh *attempt* was made, successful or not.
   *
   * Kept apart from `ratesUpdatedAt`, which only moves when new rates actually
   * arrived. Without the distinction a provider outage would either look like
   * fresh data (if the timestamp were stamped anyway) or make the app retry on
   * every render. See `domain/exchangeRates.ts`.
   */
  ratesCheckedAt?: string;
  /** Why the last attempt failed, when it did. Cleared by a success. */
  ratesLastError?: string;
}

/** Swipe preferences, keyed by list. Absent means "use the defaults". */
export interface GestureSettings {
  wishlist?: { trailing?: SwipeActionId; leading?: SwipeActionId };
  activities?: { trailing?: SwipeActionId; leading?: SwipeActionId };
  spending?: { trailing?: SwipeActionId; leading?: SwipeActionId };
}

export type SwipeActionId = "none" | "delete" | "archive" | "buy" | "edit" | "duplicate" | "deactivate";

/**
 * Whether the browser has been asked for permission to show notifications, and
 * what the answer was.
 *
 * Stored so the app can tell three states apart that the browser cannot: never
 * asked, asked and allowed, asked and refused. `Notification.permission` alone
 * reports "default" for both "never asked" and "asked and dismissed", which is
 * exactly the distinction that decides whether asking again is reasonable or
 * is nagging. See `domain/notifications.ts`.
 */
export interface NotificationSettings {
  /** What the user chose the last time we asked. */
  choice: "unasked" | "enabled" | "declined" | "unsupported";
  /** When they chose it, so "declined last year" and "declined today" differ. */
  decidedAt?: string;
  /** The browser's own permission value at that moment, for diagnosis. */
  browserPermission?: "default" | "granted" | "denied";
}

/**
 * First-run tutorial state.
 *
 * `version` so a materially changed tutorial can be offered again later
 * without re-showing today's to everybody who has already finished it.
 * Completed and skipped are stored separately: they are different answers, and
 * only one of them means "I have seen this".
 */
export interface OnboardingSettings {
  version: number;
  completedAt?: string;
  skippedAt?: string;
  /**
   * "Decide later" — not the same answer as Skip.
   *
   * Skip is "no" and ends the offer. This is "not now": the tour does not
   * reopen by itself, and a single quiet reminder appears instead, resumable at
   * the step it was left on. Two different answers, two different fields.
   */
  postponedAt?: string;
  /** The reminder was dismissed. It never returns on its own after that. */
  reminderDismissedAt?: string;
  /** The step reached, so a reopened tutorial resumes rather than restarts. */
  lastStep?: number;
}

export interface Settings {
  selectedYear: number;
  selectedMonth: number;
  selectedWeek: number;
  /** ISO week-year; separate from the calendar year used by monthly records. */
  selectedWeekYear: number;
  selectedPeriodMode: PeriodMode;
  selectedSeason: string;
  baseCurrency: CurrencyCode;
  /**
   * The currencies offered in the app's dropdowns.
   *
   * Absent means "all of them", so an existing budget is unaffected. A budget
   * that only ever deals in euros and dollars can narrow the list to two
   * rather than picking from ten every time. See `trackedCurrencies` in
   * `domain/currency.ts`: the base currency is always included whatever this
   * says, and a record keeps its own currency even after it stops being
   * tracked.
   */
  trackedCurrencies?: CurrencyCode[];
  currencyDisplayMode: CurrencyDisplayMode;
  /**
   * A second currency shown beside every amount that is not already in it.
   *
   * Absent — which is every budget written before this existed — means the
   * feature is off and nothing changes. Set, an amount recorded in another
   * currency prints its own value first and the equivalent underneath, so the
   * transaction still says what was actually paid. See `secondaryAmount` in
   * `domain/currency.ts`: it returns null rather than guessing when no rate
   * connects the two, because "≈" in front of a fabricated number is worse
   * than no second line at all.
   */
  secondaryCurrency?: CurrencyCode;
  /**
   * The interface language, as a BCP 47 tag ("en", "fr", "pt-BR").
   *
   * Absent means "follow the browser", which is what every budget written
   * before the language selector existed did. It drives the translated strings
   * *and* the locale every date, number and plural is formatted with — see
   * `domain/i18n.ts`.
   */
  language?: string;
  roundingRule: RoundingRule;
  /** Notification permission state. Absent means never asked. */
  notifications?: NotificationSettings;
  /** First-run tutorial state. Absent means never started. */
  onboarding?: OnboardingSettings;
  autoWishlistFlushEnabled: boolean;
  /**
   * @deprecated Piloting is no longer a concept the application knows about.
   *
   * It was a category bucket with powers no other category had: its activities
   * were counted in a separate total, this setting decided whether that total
   * joined the budget, and its spending was kept out of every category share.
   * All of that assumed a budget with a "Piloting" category in it, and asked one
   * hard-coded question the funding classification already answers for every
   * activity. Nothing reads this. It is still declared so a snapshot written
   * before the change round-trips unchanged rather than losing a key on save.
   */
  pilotIncludedInBudget?: boolean;
  /**
   * Whether the period widget shows today's date and a live wall clock.
   *
   * A live clock is the difference between "March" and "today, in March" when
   * the period selector can show any month — but it is also a re-render every
   * minute, and some people find a ticking figure in a financial tool
   * distracting. Off, the widget states the date without the time and stops
   * the timer entirely.
   */
  liveClockEnabled: boolean;
  /**
   * Which dashboard sections appear, and in what order.
   *
   * Absent means the default arrangement, so an account that has never opened
   * the customiser is unaffected — and a section added in a later version
   * appears for everyone instead of being silently missing for anyone who has
   * ever saved a list. See `dashboardWidgets` in `domain/dashboard.ts`.
   */
  dashboard?: { id: string; visible: boolean }[];
  /**
   * Swipe actions per list.
   *
   * Optional: an account that has never opened the gesture settings has no
   * stored value and the defaults apply. Writing a full copy up front would
   * freeze today's defaults into every account forever.
   */
  gestures?: GestureSettings;
  saveTimestampEnabled: boolean;
  monthlyBudget: number;
  monthlyBudgetCurrency: CurrencyCode;
  exchangeRates: ExchangeRates;
  lastUpdated: string;
  darkMode: boolean;
  /**
   * Light, dark, or whatever the operating system is doing.
   *
   * Absent means "read `darkMode`", which is what every budget written before
   * this existed has. Both are kept in step when the user changes one, so an
   * older client — or a code path this session missed — reading the boolean
   * still gets the right answer.
   */
  appearance?: Appearance;
  /**
   * Which colour theme. Absent means the application's own identity.
   * See `domain/theme.ts`; the presets are data precisely so their contrast
   * can be tested rather than assumed.
   */
  themePreset?: string;
  /**
   * The aircraft the **loading sequence** flies: one of the three drawn for it.
   *
   * Absent means the Concorde. See `domain/aircraft.ts`.
   */
  aircraft?: AircraftId;
  /**
   * The silhouette the **tab transition** flies: one of the twenty-two.
   *
   * Two settings rather than one. They were one — the same aeroplane seen
   * twice — and that was only defensible while both lists were the same three
   * aircraft. The transition now draws from the whole Flightradar24 fleet,
   * which has no illustrated Alpha Jet and no drawn A350, so a single
   * preference would either shrink the transition back to three shapes or
   * offer the loading screen nineteen aircraft it cannot render.
   *
   * Absent means the Concorde, exactly as above: an account that has never
   * chosen sees the same aeroplane in both places.
   */
  transitionAircraft?: FleetId;
  /**
   * @deprecated Externally funded spending is now always excluded from the
   * personal budget — see `domain/funding.ts`. Nothing reads this. The field is
   * still declared so snapshots written before the rule became unconditional
   * round-trip unchanged rather than losing a key on every save.
   */
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
 *  - `auto`       : legacy behaviour, inferred from recurrenceType and prices.
 *  - `perSession` : price per session × sessions per month.
 *  - `schedule`   : price per session × real occurrences in the actual month,
 *                   counted from weekdays or a day-of-month rule.
 *  - `fixed`      : an explicit monthly amount.
 *  - `sessionPack`: price per session, at a stated frequency, **paid for in
 *                   blocks of N sessions**. Two sessions a week is not two
 *                   payments a week, and this is the only model that says so:
 *                   the monthly figure is an accrual, and the payments are a
 *                   separate dated series. See `domain/payments.ts`.
 *  - `fixedYearly`: a real annual payment on a real date. The monthly figure
 *                   is an average and is labelled as one; no monthly payment
 *                   event is ever produced.
 */
export type CostModel = "auto" | "perSession" | "schedule" | "fixed" | "sessionPack" | "fixedYearly";

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
  /**
   * A direct link to an image used as the activity's mark.
   *
   * Beats both the library icon and the site icon below, because it is the
   * most specific thing the user can state. Rendered with a fallback: a URL
   * that fails to load shows the default mark rather than a broken image.
   */
  iconUrl?: string;
  /**
   * A website whose icon identifies the activity — the developer, the
   * publisher, the club.
   *
   * Kept apart from any purchase or booking link for the same reason the
   * wishlist keeps `brandUrl` apart from `url`: where a thing is bought and
   * who makes it are two different facts, and one field cannot carry both.
   */
  iconSourceUrl?: string;
  /** Accent colour that themes the whole activity widget. */
  color?: string;
  /**
   * Who funds this activity, and therefore whether it consumes the personal
   * budget at all.
   *
   * Absent means `personal`, which is exactly how every activity created
   * before this field existed behaved: it counted toward the budget in full.
   * The value is the *default* for transactions linked to the activity — an
   * individual transaction can still override it, because a lesson somebody
   * else usually pays for is occasionally paid for by you.
   *
   * See `domain/funding.ts` for what each kind does to the figures.
   */
  fundingSource?: FundingKind;
  /**
   * Who pays, in the user's own words: "Dad", "the club", "work".
   *
   * Free text on purpose. A predefined people database would be a second thing
   * to maintain before the first activity could be recorded, and the answer is
   * usually one word. Only meaningful for `fundingSource: "other"`, always
   * optional, and never required by any code path.
   */
  fundedBy?: string;
  /** Which model drives the monthly estimate. Defaults to `auto`. */
  costModel?: CostModel;
  /** Sessions per month for the `perSession` model. */
  sessionsPerMonth?: number | null;
  /**
   * How often the sessions happen, for the `sessionPack` model: the number,
   * with `sessionPeriod` supplying the unit. "2" and "week" is twice a week.
   *
   * Deliberately separate from `sessionsPerMonth`, which is a monthly figure
   * feeding a different model. Storing "2 per week" as "8.67 per month" would
   * make the editor show a number the user never typed, and would round-trip
   * badly for anyone who later changed the frequency.
   */
  sessionsPerPeriod?: number | null;
  /** Unit for `sessionsPerPeriod`. Defaults to `week`, which is how people speak. */
  sessionPeriod?: "week" | "month";
  /**
   * Sessions bought at once, for the `sessionPack` model.
   *
   * The payment falls once per this many sessions — ten sessions at €20 is one
   * €200 payment, not ten €20 ones and certainly not two a week. The amount is
   * derived rather than stored, so it can never disagree with the price.
   */
  sessionsPerPayment?: number | null;
  /** ISO weekdays the activity occurs on, for the `schedule` model. */
  weekdays?: IsoWeekday[];
  /** Day of month (1-31) for monthly schedules, e.g. a subscription renewal. */
  dayOfMonth?: number | null;
  /** First date the schedule applies from (YYYY-MM-DD). */
  startDate?: string;
  /**
   * A renewal date the user knows and the rule cannot derive (YYYY-MM-DD).
   *
   * An annual subscription renews on the day it was bought, which is a fact
   * about the past that no recurrence rule contains — and a monthly charge
   * with no day-of-month set has no derivable date at all. This states the
   * next one, and it **overrides the calculated next occurrence** in the
   * upcoming timeline.
   *
   * Deliberately display-only: it changes *when* the next charge is shown, not
   * *how much* anything costs. Feeding it into the estimate would let a single
   * typed date rewrite a year of budget figures. Once it is in the past it is
   * simply ignored, because a renewal that has already happened is history and
   * the rule takes over again.
   */
  nextRenewalDate?: string;
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
  /**
   * @deprecated Follows from nothing and is read by nothing.
   *
   * It mirrored the category's `piloting` bucket, which no longer carries any
   * behaviour. The column stays so historical rows round-trip; new entries
   * write `false`.
   */
  isPiloting?: boolean;
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
  /**
   * A direct link to an image used as the item's mark.
   *
   * The most specific answer available, so it beats the library icon and the
   * site favicon alike. Rendered with a fallback, so a dead link shows the
   * default mark rather than a broken image.
   */
  iconUrl?: string;
  /** Accent colour for the item card. */
  color?: string;
  /** Spending entry created when this item was bought, when linked. */
  linkedSpendingId?: string;
}

export interface WalletEntry {
  id: string;
  year: number;
  month: number;
  /**
   * The day the money moved (YYYY-MM-DD).
   *
   * Absent for every entry written before this field existed, which is why
   * `walletEntryDate` falls back to the first of `year`/`month`. Never
   * `createdAt`: when a movement was typed in is not when it happened, and a
   * treasury that confuses the two reports the wrong month.
   */
  date?: string;
  /**
   * Signed: positive is money in, negative is money out.
   *
   * The direction is the sign rather than a second stored field, so the two
   * can never disagree. The editor offers an in/out control and writes the
   * sign from it.
   */
  amount: number;
  currency: CurrencyCode;
  source: string;
  type: WalletEntryType;
  note: string;
  createdAt: string;
}

/**
 * What a scenario does to one activity.
 *
 * `enabled: false` takes the activity out of the scenario entirely — it
 * contributes nothing. `funding` overrides how an enabled activity is counted,
 * so "what if my father stopped paying for the lessons" is a scenario rather
 * than an edit to the activity itself.
 *
 * Both fields are optional at the edges: an activity a scenario has never been
 * told about is enabled and keeps its own funding, which is what a scenario
 * created before this existed meant.
 */
export interface ScenarioActivityState {
  enabled: boolean;
  /** Overrides the activity's own funding for this scenario only. */
  funding?: FundingKind;
}

export interface ScenarioPreset {
  id: string;
  name: string;
  monthlyBudget?: number;
  /**
   * @deprecated The scenario system no longer has a Piloting-specific control:
   * it assumed every user has a "Piloting" activity, which most do not.
   * Per-activity enable/disable and funding (`activityStates`) replace it. The
   * field is still declared so scenarios saved before that change round-trip
   * unchanged instead of losing a key on every save.
   */
  pilotIncludedInBudget?: boolean;
  categoryCaps?: Record<string, number>;
  /**
   * Per-activity state, keyed by activity id.
   *
   * Absent, or absent for a given activity, means "enabled, own funding" — so
   * every scenario saved before this field existed continues to describe
   * exactly what it always described.
   */
  activityStates?: Record<string, ScenarioActivityState>;
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
  /**
   * Spend charged to the personal budget.
   *
   * Externally funded transactions are **never** part of this, whatever the
   * settings say — see `domain/funding.ts`. `transactionTotal` is the figure
   * that includes them.
   */
  total: number | null;
  /** The same figure as `total`, named for the three-way funding display. */
  personalTotal?: number | null;
  /**
   * Everything this budget did not pay for: paid-by-other **and**
   * outside-budget together. Kept for the callers that only need the
   * exclusion; the two are reported separately below because they are
   * different facts.
   */
  externalTotal?: number | null;
  /** Spend somebody else paid for. Recorded in full, charged to nothing. */
  otherFundedTotal?: number | null;
  /** The user's own spend, deliberately kept outside this budget. */
  outsideBudgetTotal?: number | null;
  /** Every transaction in the period: personal + other + outside. */
  transactionTotal?: number | null;
  /** How many of `entryCount` were not personally funded. */
  externalCount?: number;
  otherFundedCount?: number;
  outsideBudgetCount?: number;
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
  /** How this activity is funded, and so whether it consumes the budget. */
  funding: FundingKind;
}

export interface WishlistSummary {
  activeTotal: number;
  boughtTotal: number;
  historyTotal: number;
  activeCount: number;
  boughtCount: number;
}

export interface WalletSummary {
  /**
   * Actual money held: every ledger movement, minus budget spending since the
   * ledger began. Derived, never stored — see `domain/wallet.ts`.
   */
  walletTotal: number;
  /** Allocated budget money still available. Carries across months. */
  budgetRemaining: number;
  /** Money outside the current budget: `walletTotal − budgetRemaining`. */
  personalBalance: number;
  rolloverTotal: number;
  openingBalance: number;
  /** Everything ever allocated to the budget, since the ledger began. */
  allocatedTotal: number;
  /** Budget spending charged against those allocations. */
  budgetSpent: number;
}

export interface YearCalculation {
  year: number;
  month: number;
  week: number;
  monthlyBudgetBase: number;
  /** Every active activity's monthly cost, whoever pays for it. */
  combinedBudget: number;
  includedBudget: number;
  selectedMonthSpend: PeriodSummary;
  selectedWeekSpend: PeriodSummary;
  /** Personal-budget spend for the whole year. */
  totalSpend: number;
  /** Everything not personally funded, kept out of `totalSpend`. */
  externalSpend: number;
  /** Spend somebody else paid for, over the whole year. */
  otherFundedSpend: number;
  /** The user's own out-of-budget spend, over the whole year. */
  outsideBudgetSpend: number;
  delta: number | null;
  rolloverDelta: number | null;
  roundedMonthlyValue: number;
  wallet: WalletSummary;
  wishlist: WishlistSummary;
  /** Personal-budget spend up to and including the selected month. */
  ytdTotal: number;
  /** Everything not personally funded, over the same window. */
  externalYtdTotal: number;
  /** Paid-by-other spend, over the same window. */
  otherFundedYtdTotal: number;
  /** Outside-budget spend, over the same window. */
  outsideBudgetYtdTotal: number;
  activityEstimates: ActivityEstimate[];
  monthlyTrend: PeriodSummary[];
  weeklyTrend: PeriodSummary[];
}
