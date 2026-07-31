import type { BudgetSnapshot, Settings, Activity, WishlistItem, BudgetCategory } from "../domain/types";
import { normalizeAmount, formatMoney } from "../domain/currency";
import { monthName } from "../domain/dates";

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

export function isViewingCurrentMonth(settings: Settings): boolean {
  const now = new Date();
  return settings.selectedYear === now.getFullYear() && settings.selectedMonth === now.getMonth() + 1;
}

export function isViewingHistoricalPeriod(settings: Settings): boolean {
  const now = new Date();
  if (settings.selectedYear < now.getFullYear()) return true;
  if (settings.selectedYear === now.getFullYear() && settings.selectedMonth < now.getMonth() + 1) return true;
  return false;
}

export function activityToDraft(activity: Activity | null, snapshot: BudgetSnapshot): ActivityDraft {
  return {
    name: activity?.name ?? "",
    categoryId: activity?.categoryId ?? snapshot.categories[0]?.id ?? "cat-spending",
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
  };
}

export function activityPayloadFromDraft(draft: ActivityDraft): Omit<Activity, "id" | "order"> {
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
  };
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
  if (view === "active") return item.active && item.inWishlist && !item.bought;
  if (view === "bought") return item.bought;
  return true;
}

export function priorityRank(p: string): number {
  const map: Record<string, number> = { low: 1, medium: 2, high: 3, dream: 4 };
  return map[p] ?? 0;
}

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
