import type { CurrencyCode, RecurrenceType, SpendingEntry, WishlistItem, WishlistPriority } from "./types";

/**
 * Wishlist domain helpers
 * =======================
 * Pure functions shared by the wishlist panel, the spending panel and the
 * store. Nothing here touches React or the network, so every rule below is
 * directly testable.
 */

// ─── Priority ────────────────────────────────────────────────────────────────

/**
 * The canonical urgency order, most urgent first.
 *
 * "dream" is deliberately last: it is an aspiration, not something competing
 * for this month's budget. Anything that sorts or ranks priorities must derive
 * its order from this array so the four places that show priority can never
 * disagree with each other.
 */
export const PRIORITY_ORDER: readonly WishlistPriority[] = ["high", "medium", "low", "dream"];

export interface PriorityMeta {
  label: string;
  /** Theme token, so the colour stays legible in light and dark mode. */
  color: string;
  /** Matching translucent background token. */
  soft: string;
  /** Short explanation shown as a tooltip. */
  hint: string;
}

/**
 * Colour follows meaning: red for what is urgent, amber for what is next,
 * blue for what can wait, purple for what is only a wish.
 */
export const PRIORITY_META: Record<WishlistPriority, PriorityMeta> = {
  high: { label: "High", color: "var(--danger-text)", soft: "var(--danger-soft)", hint: "Buying this soon" },
  medium: { label: "Medium", color: "var(--warning-text)", soft: "var(--warning-soft)", hint: "Worth planning for" },
  low: { label: "Low", color: "var(--accent)", soft: "var(--accent-soft)", hint: "No rush" },
  dream: { label: "Dream", color: "var(--purple-text)", soft: "var(--purple-soft)", hint: "Aspiration, not this month's budget" },
};

/**
 * Position in `PRIORITY_ORDER`: **0 is the most urgent**.
 *
 * Sorting ascending by this rank puts high first and dream last. Unknown
 * values sort after every known priority rather than jumping to the top.
 */
export function priorityRank(priority: string | null | undefined): number {
  const index = PRIORITY_ORDER.indexOf(priority as WishlistPriority);
  return index === -1 ? PRIORITY_ORDER.length : index;
}

/** Comparator matching the list order used by the wishlist: urgent first. */
export function comparePriority(a: string | null | undefined, b: string | null | undefined): number {
  return priorityRank(a) - priorityRank(b);
}

/**
 * List order: urgent first, already-bought items sink to the bottom, and
 * names break ties so the same data always renders in the same order.
 */
export function sortWishlistItems<T extends Pick<WishlistItem, "priority" | "bought" | "name">>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.bought !== b.bought) return a.bought ? 1 : -1;
    const byPriority = comparePriority(a.priority, b.priority);
    if (byPriority !== 0) return byPriority;
    return a.name.localeCompare(b.name);
  });
}

/** The predicate behind the "Active" view and the spending form's item list. */
export function isActiveWishlistItem(item: Pick<WishlistItem, "active" | "inWishlist" | "bought">): boolean {
  return item.active && item.inWishlist && !item.bought;
}

// ─── URLs and favicons ───────────────────────────────────────────────────────

/** Only these two can be opened or fetched safely from a user-supplied link. */
const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Parse a user-supplied product link.
 *
 * Anything that is not http(s) is rejected outright — `javascript:`,
 * `data:` and friends must never reach an `href` or an `img src`. A bare
 * "example.com/thing" is treated as https, which is what people type.
 */
export function parseItemUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (!SAFE_PROTOCOLS.has(url.protocol)) return null;
  if (!url.hostname) return null;
  return url;
}

/** Canonical form to store, or `undefined` when the input is unusable. */
export function normalizeItemUrl(raw: string | null | undefined): string | undefined {
  return parseItemUrl(raw)?.toString();
}

/** Hostname without the `www.` prefix, e.g. "amazon.de". */
export function itemDomain(raw: string | null | undefined): string | null {
  const url = parseItemUrl(raw);
  if (!url) return null;
  return url.hostname.replace(/^www\./i, "");
}

/**
 * Google's favicon service. The caller must render the image with
 * `referrerPolicy="no-referrer"` (the wishlist should not leak which page the
 * user is on) and an `onError` fallback, because this endpoint answers for
 * every domain — including ones that have no icon.
 */
export function faviconUrl(domain: string, size = 64): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/**
 * The domain an item's icon should come from.
 *
 * The brand link when there is one, the purchase link otherwise. Keeping these
 * separate means the visual identity can be the manufacturer while the link
 * still opens the shop — using one field for both forced a choice between an
 * item that looks right and an item that buys right.
 */
export function itemIconDomain(item: { url?: string; brandUrl?: string }): string | null {
  return itemDomain(item.brandUrl) ?? itemDomain(item.url);
}

// ─── Colour identity ─────────────────────────────────────────────────────────

/**
 * Accent palette used when an item has no colour of its own. Values are picked
 * to stay readable as a low-opacity wash over both the light and the dark
 * surface tokens.
 */
export const WISHLIST_PALETTE: readonly string[] = [
  "#0071E3",
  "#8B5CF6",
  "#0EA5B7",
  "#DB2777",
  "#E8850C",
  "#1DA45A",
  "#6366F1",
  "#F43F5E",
  "#0891B2",
  "#7C3AED",
];

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: string | null | undefined): boolean {
  return typeof value === "string" && HEX_COLOR.test(value.trim());
}

/** FNV-1a. Deterministic across sessions and devices, unlike `Math.random`. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Same seed always yields the same palette entry. */
export function colorForSeed(seed: string): string {
  return WISHLIST_PALETTE[hashString(seed) % WISHLIST_PALETTE.length];
}

/**
 * The item's own colour when set, otherwise a stable colour derived from its
 * domain (falling back to the name, so items without a link still get an
 * identity that never changes between renders).
 */
export function wishlistItemAccent(item: Pick<WishlistItem, "color" | "url" | "name" | "id">): string {
  if (isHexColor(item.color)) return item.color!.trim();
  const seed = itemDomain(item.url) ?? item.name.trim().toLowerCase() ?? item.id;
  return colorForSeed(seed || item.id);
}

/**
 * Translucent version of a colour.
 *
 * Hex values become rgba so the tint composites over whatever the theme puts
 * behind it; anything else (a CSS variable, a named colour) goes through
 * `color-mix`, which behaves the same without parsing.
 */
export function withAlpha(color: string, alpha: number): string {
  const trimmed = color.trim();
  if (!HEX_COLOR.test(trimmed)) {
    return `color-mix(in srgb, ${trimmed} ${Math.round(alpha * 100)}%, transparent)`;
  }
  let digits = trimmed.slice(1);
  if (digits.length === 3) digits = digits.split("").map((char) => char + char).join("");
  const red = parseInt(digits.slice(0, 2), 16);
  const green = parseInt(digits.slice(2, 4), 16);
  const blue = parseInt(digits.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * Card background: a faint wash of the accent laid over the theme's own
 * surface token.
 *
 * The accent is never painted solid, so the card keeps the surface colour of
 * the current theme and `--text-primary` keeps its designed contrast in both
 * light and dark mode — a saturated fill would fail one of the two.
 */
export function wishlistCardGradient(accent: string): string {
  return `linear-gradient(135deg, ${withAlpha(accent, 0.16)} 0%, ${withAlpha(accent, 0.05)} 46%, ${withAlpha(accent, 0)} 100%), var(--bg-elevated)`;
}

/** Border that echoes the accent without competing with the card content. */
export function wishlistCardBorder(accent: string): string {
  return withAlpha(accent, 0.32);
}

// ─── Linking wishlist items to spending ──────────────────────────────────────

/**
 * Outcome of a link/unlink attempt, so the UI can explain what happened
 * instead of silently doing nothing.
 *
 *  - `created`        a new spending entry was written and both sides linked
 *  - `linked`         an existing entry was linked to the item
 *  - `already-linked` refused: the item already has a live spending entry
 *  - `unlinked`       both sides cleared; `spendingId` is the entry left behind
 *  - `updated`        the item changed without any link work
 *  - `locked`         the selected period is historical and read-only
 *  - `not-found`      the item or entry no longer exists
 *  - `invalid-amount` no usable amount (note: 0 *is* usable, null is not)
 */
export type WishlistLinkResult =
  | { status: "created"; spendingId: string }
  | { status: "linked"; spendingId: string }
  | { status: "already-linked"; spendingId: string }
  | { status: "unlinked"; spendingId?: string }
  | { status: "updated" }
  | { status: "locked" }
  | { status: "not-found" }
  | { status: "invalid-amount" };

/** Fields a caller may override when turning a wishlist item into spending. */
export interface WishlistPurchaseOverrides {
  /** 0 is a real amount; `null`/`undefined` falls back to the item's price. */
  amount?: number | null;
  date?: string;
  categoryId?: string;
  currency?: CurrencyCode;
  note?: string;
  source?: string;
  isPiloting?: boolean;
  /** Defaults to "none": a wishlist purchase is a one-off unless said otherwise. */
  recurrenceType?: RecurrenceType;
}

/**
 * The spending values a purchase of `item` should default to. Kept pure so the
 * wishlist form, the spending form and the store all prefill identically.
 */
export function purchaseDefaults(
  item: Pick<WishlistItem, "name" | "actualPrice" | "currency" | "categoryId">,
  today: string,
): { amount: number | null; currency: CurrencyCode; categoryId: string; date: string; note: string } {
  return {
    amount: item.actualPrice,
    currency: item.currency,
    categoryId: item.categoryId,
    date: today,
    note: item.name,
  };
}

/** `true` when the amount can be written as money — 0 counts, null does not. */
export function isUsableAmount(amount: number | null | undefined): amount is number {
  return amount != null && Number.isFinite(amount);
}

/** The entry an item points at, or null when the link is dangling/absent. */
export function findLinkedEntry(
  item: Pick<WishlistItem, "linkedSpendingId"> | null | undefined,
  entries: readonly SpendingEntry[],
): SpendingEntry | null {
  if (!item?.linkedSpendingId) return null;
  return entries.find((entry) => entry.id === item.linkedSpendingId) ?? null;
}
