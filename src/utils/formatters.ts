import type { BudgetSnapshot, Settings, Activity, WishlistItem, BudgetCategory, CostModel, IsoWeekday } from "../domain/types";
import { normalizeAmount, formatMoney } from "../domain/currency";
import { monthName } from "../domain/dates";
import { isHistoricalPeriod } from "../domain/periods";
import { normalizeWeekdays } from "../domain/schedule";
import { isActiveWishlistItem, normalizeItemUrl } from "../domain/wishlist";
import { seedCategoryIdOrFallback } from "../domain/seedCategories";

export interface ActivityDraft {
  name: string;
  categoryId: string;
  currency: any;
  recurrenceType: any;
  recurrenceInterval: number;
  pricePerSession: string;
  pricePerPurchase: string;
  pricePerMonth: string;
  estimatedCost: string;
  yearlyEstimate: string;
  active: boolean;
  visible: boolean;
  seasonalTag: string;
  notes: string;
  /** Lucide icon name, empty when the activity uses the default mark. */
  icon: string;
  /** A direct image link, empty when none is set. */
  iconUrl: string;
  /** A site whose favicon identifies the activity, empty when none is set. */
  iconSourceUrl: string;
  /** Accent colour, empty when the card stays neutral. */
  color: string;
  costModel: CostModel;
  sessionsPerMonth: string;
  /** Frequency for the session-pack model, e.g. "2". */
  sessionsPerPeriod: string;
  /** Unit for the frequency above. */
  sessionPeriod: "week" | "month";
  /** Sessions bought at once, for the session-pack model. */
  sessionsPerPayment: string;
  weekdays: IsoWeekday[];
  dayOfMonth: string;
  startDate: string;
  nextRenewalDate: string;
}

export interface WishlistDraft {
  name: string;
  categoryId: string;
  actualPrice: string;
  currency: any;
  priority: WishlistItem["priority"];
  notes: string;
  inWishlist: boolean;
  active: boolean;
  /** Purchase link as typed; validated on save, never trusted as-is. */
  url: string;
  /** Optional brand link that supplies the icon, when it is not the shop. */
  brandUrl: string;
  /** A library icon, which overrides anything derived from a URL. */
  icon: string;
  /** A direct image link, which beats both the library icon and the favicon. */
  iconUrl: string;
  /** Accent colour, empty when the card falls back to its hashed colour. */
  color: string;
}

export function statusLabel(status: string): string {
  switch (status) {
    case "value": return "Recorded";
    case "zero": return "No spend";
    case "pending": return "Pending";
    case "nan": return "Closed";
    default: return status;
  }
}

interface FormatOptions {
  showSign?: boolean;
  decimals?: number;
}

export function formatDualMoney(
  value: number | null | undefined,
  settings: Settings,
  options: FormatOptions = {}
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const formatted = formatMoney(value, settings.baseCurrency, settings.currencyDisplayMode);
  if (options.showSign && value > 0) return `+${formatted}`;
  return formatted;
}

export function isViewingCurrentMonth(settings: Settings, now = new Date()): boolean {
  return settings.selectedYear === now.getFullYear() && settings.selectedMonth === now.getMonth() + 1;
}

export function isViewingHistoricalPeriod(settings: Settings, now = new Date()): boolean {
  return isHistoricalPeriod(settings, now);
}

export function activityToDraft(activity: Activity | null, snapshot: BudgetSnapshot): ActivityDraft {
  return {
    name: activity?.name ?? "",
    // Resolved against this budget's own categories. The old literal fallback
    // named a category that may not exist here, and the value goes straight
    // into a foreign key.
    categoryId:
      activity?.categoryId ??
      snapshot.categories[0]?.id ??
      seedCategoryIdOrFallback(snapshot.categories, "cat-spending") ??
      "",
    currency: activity?.currency ?? snapshot.settings.baseCurrency,
    recurrenceType: activity?.recurrenceType ?? "monthly",
    recurrenceInterval: activity?.recurrenceInterval ?? 1,
    pricePerSession: valueToInput(activity?.pricePerSession),
    pricePerPurchase: valueToInput(activity?.pricePerPurchase),
    pricePerMonth: valueToInput(activity?.pricePerMonth),
    estimatedCost: valueToInput(activity?.estimatedCost),
    yearlyEstimate: valueToInput(activity?.yearlyEstimate),
    active: activity?.active ?? true,
    visible: activity?.visible ?? true,
    seasonalTag: activity?.seasonalTag ?? "",
    notes: activity?.notes ?? "",
    icon: activity?.icon ?? "",
    iconUrl: activity?.iconUrl ?? "",
    iconSourceUrl: activity?.iconSourceUrl ?? "",
    color: activity?.color ?? "",
    costModel: activity?.costModel ?? "auto",
    sessionsPerMonth: valueToInput(activity?.sessionsPerMonth),
    sessionsPerPeriod: valueToInput(activity?.sessionsPerPeriod),
    sessionPeriod: activity?.sessionPeriod === "month" ? "month" : "week",
    sessionsPerPayment: valueToInput(activity?.sessionsPerPayment),
    weekdays: normalizeWeekdays(activity?.weekdays),
    dayOfMonth: valueToInput(activity?.dayOfMonth),
    startDate: activity?.startDate ?? "",
    nextRenewalDate: activity?.nextRenewalDate ?? "",
  };
}

export function activityPayloadFromDraft(draft: ActivityDraft): Omit<Activity, "id" | "order"> {
  const weekdays = normalizeWeekdays(draft.weekdays);
  return {
    name: draft.name.trim(),
    categoryId: draft.categoryId,
    currency: draft.currency,
    recurrenceType: draft.recurrenceType,
    recurrenceInterval: draft.recurrenceInterval,
    pricePerSession: parseAmount(draft.pricePerSession),
    pricePerPurchase: parseAmount(draft.pricePerPurchase),
    pricePerMonth: parseAmount(draft.pricePerMonth),
    estimatedCost: parseAmount(draft.estimatedCost),
    yearlyEstimate: parseAmount(draft.yearlyEstimate),
    active: draft.active,
    visible: draft.visible,
    seasonalTag: draft.seasonalTag,
    notes: draft.notes,
    icon: draft.icon.trim() || undefined,
    // Validated here rather than at render time, so an unusable or unsafe link
    // is never stored — the same rule the wishlist links follow.
    iconUrl: normalizeItemUrl(draft.iconUrl),
    iconSourceUrl: normalizeItemUrl(draft.iconSourceUrl),
    color: draft.color.trim() || undefined,
    // `auto` is the absence of a cost model: storing it would only add noise to
    // records that already behave that way.
    costModel: draft.costModel === "auto" ? undefined : draft.costModel,
    sessionsPerMonth: parseAmount(draft.sessionsPerMonth),
    sessionsPerPeriod: parseAmount(draft.sessionsPerPeriod),
    // Only meaningful alongside a frequency, and `week` is the default, so it
    // is stored only when it differs — an absent value must keep meaning
    // "week" for every activity written before this field existed.
    sessionPeriod: draft.sessionPeriod === "month" ? "month" : undefined,
    sessionsPerPayment: parseAmount(draft.sessionsPerPayment),
    weekdays: weekdays.length > 0 ? weekdays : undefined,
    dayOfMonth: clampDayOfMonth(parseAmount(draft.dayOfMonth)),
    startDate: draft.startDate.trim() || undefined,
    nextRenewalDate: draft.nextRenewalDate.trim() || undefined,
  };
}

/**
 * A throwaway Activity built from an in-progress form, so the panel can price a
 * draft through the same calculations that price a saved activity. Never
 * persisted: the id exists only to satisfy the type.
 */
export function draftToActivity(draft: ActivityDraft, base?: Activity | null): Activity {
  return {
    ...activityPayloadFromDraft(draft),
    id: base?.id ?? "activity-draft-preview",
    order: base?.order ?? 0,
  };
}

function clampDayOfMonth(value: number | null): number | null {
  if (value == null) return null;
  const day = Math.round(value);
  if (day < 1 || day > 31) return null;
  return day;
}

export function wishlistToDraft(item: WishlistItem | null): WishlistDraft {
  return {
    name: item?.name ?? "",
    categoryId: item?.categoryId ?? "",
    actualPrice: valueToInput(item?.actualPrice),
    currency: item?.currency ?? "EUR",
    priority: item?.priority ?? "medium",
    notes: item?.notes ?? "",
    inWishlist: item?.inWishlist ?? true,
    active: item?.active ?? true,
    url: item?.url ?? "",
    brandUrl: item?.brandUrl ?? "",
    icon: item?.icon ?? "",
    iconUrl: item?.iconUrl ?? "",
    color: item?.color ?? "",
  };
}

/**
 * The persistable half of a wishlist draft. The URL is validated here rather
 * than at render time, so an unusable or unsafe link is never stored.
 */
export function wishlistPayloadFromDraft(
  draft: WishlistDraft,
): Pick<WishlistItem, "name" | "actualPrice" | "effectiveValue" | "currency" | "priority" | "notes" | "inWishlist" | "url" | "brandUrl" | "icon" | "iconUrl" | "color"> {
  const price = parseAmount(draft.actualPrice);
  return {
    name: draft.name.trim(),
    actualPrice: price,
    effectiveValue: price,
    currency: draft.currency,
    priority: draft.priority,
    notes: draft.notes,
    inWishlist: draft.inWishlist,
    url: normalizeItemUrl(draft.url),
    brandUrl: normalizeItemUrl(draft.brandUrl),
    icon: draft.icon.trim() || undefined,
    iconUrl: normalizeItemUrl(draft.iconUrl),
    color: draft.color.trim() || undefined,
  };
}

export function valueToInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(value);
}

export function parseAmount(input: string | number | null | undefined): number | null {
  if (input == null || input === "") return null;
  const parsed = typeof input === "string" ? parseFloat(input.replace(/,/g, "")) : input;
  return Number.isFinite(parsed) ? parsed : null;
}

export function matchesActivityFilters(activity: Activity, filters: { search?: string; categoryId?: string }): boolean {
  if (filters.search && !activity.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
  if (filters.categoryId && activity.categoryId !== filters.categoryId) return false;
  return true;
}

export function matchesEntryFilters(entry: { note?: string; categoryId?: string; activityId?: string }, filters: { search?: string; categoryId?: string; activityId?: string }): boolean {
  if (filters.search && !(entry.note ?? "").toLowerCase().includes(filters.search.toLowerCase())) return false;
  if (filters.categoryId && entry.categoryId !== filters.categoryId) return false;
  if (filters.activityId && entry.activityId !== filters.activityId) return false;
  return true;
}

export function wishlistViewMatches(item: WishlistItem, view: "all" | "active" | "bought"): boolean {
  if (view === "active") return isActiveWishlistItem(item);
  if (view === "bought") return item.bought;
  return true;
}

/**
 * Re-exported from the wishlist domain so every consumer ranks priorities the
 * same way. **0 is the most urgent** (high), and "dream" ranks last: it is an
 * aspiration, not a claim on this month's budget.
 */
export { priorityRank, comparePriority, sortWishlistItems } from "../domain/wishlist";

export function sortActivities(
  a: Activity,
  b: Activity,
  sortBy: "order" | "name" | "cost",
  estimateMap: Map<string, { monthlyBase: number }>
): number {
  if (sortBy === "order") return a.order - b.order;
  if (sortBy === "name") return a.name.localeCompare(b.name);
  const ea = estimateMap.get(a.id)?.monthlyBase ?? 0;
  const eb = estimateMap.get(b.id)?.monthlyBase ?? 0;
  return eb - ea;
}

/*
 * Removed rather than kept "in case": `activityPrimaryCost`,
 * `activityPrimaryCostLabel`, `matchesWishlistFilters`, `getCategoryIcon` and
 * `getCategoryColor` were exported and called from nowhere.
 *
 * The two cost helpers in particular were a hazard: they picked whichever
 * price field happened to be filled in, which is not how an activity is priced
 * — `costModel` decides that, and `monthlyEstimateNative` implements it. A
 * second, simpler, wrong answer sitting next to the right one is how a figure
 * ends up disagreeing with itself on two screens.
 */
