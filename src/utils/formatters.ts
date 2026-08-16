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
  /** Accent colour, empty when the card stays neutral. */
  color: string;
  costModel: CostModel;
  sessionsPerMonth: string;
  weekdays: IsoWeekday[];
  dayOfMonth: string;
  startDate: string;
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
    color: activity?.color ?? "",
    costModel: activity?.costModel ?? "auto",
    sessionsPerMonth: valueToInput(activity?.sessionsPerMonth),
    weekdays: normalizeWeekdays(activity?.weekdays),
    dayOfMonth: valueToInput(activity?.dayOfMonth),
    startDate: activity?.startDate ?? "",
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
    color: draft.color.trim() || undefined,
    // `auto` is the absence of a cost model: storing it would only add noise to
    // records that already behave that way.
    costModel: draft.costModel === "auto" ? undefined : draft.costModel,
    sessionsPerMonth: parseAmount(draft.sessionsPerMonth),
    weekdays: weekdays.length > 0 ? weekdays : undefined,
    dayOfMonth: clampDayOfMonth(parseAmount(draft.dayOfMonth)),
    startDate: draft.startDate.trim() || undefined,
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
    color: item?.color ?? "",
  };
}

/**
 * The persistable half of a wishlist draft. The URL is validated here rather
 * than at render time, so an unusable or unsafe link is never stored.
 */
export function wishlistPayloadFromDraft(
  draft: WishlistDraft,
): Pick<WishlistItem, "name" | "actualPrice" | "effectiveValue" | "currency" | "priority" | "notes" | "inWishlist" | "url" | "brandUrl" | "icon" | "color"> {
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

export function activityPrimaryCostLabel(activity: Activity): string {
  if (activity.pricePerMonth != null) return "/month";
  if (activity.pricePerSession != null) return "/session";
  if (activity.pricePerPurchase != null) return "/purchase";
  if (activity.yearlyEstimate != null) return "/year";
  if (activity.estimatedCost != null) return "estimated";
  return "";
}

export function activityPrimaryCost(activity: Activity, snapshot: BudgetSnapshot): string {
  const val =
    activity.pricePerMonth ??
    activity.pricePerSession ??
    activity.pricePerPurchase ??
    activity.yearlyEstimate ??
    activity.estimatedCost ??
    0;
  return formatMoney(val, activity.currency, snapshot.settings.currencyDisplayMode);
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

export function matchesWishlistFilters(item: WishlistItem, filters: { search?: string; categoryId?: string }): boolean {
  if (filters.search && !item.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
  if (filters.categoryId && item.categoryId !== filters.categoryId) return false;
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

export function getCategoryIcon(category: BudgetCategory): string {
  return category.icon ?? "Circle";
}

export function getCategoryColor(category: BudgetCategory): string {
  return category.color ?? "#64748B";
}
