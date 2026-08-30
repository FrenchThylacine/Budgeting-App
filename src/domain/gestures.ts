import type { Settings, SwipeActionId } from "./types";

/**
 * What a swipe does, per direction, per list.
 *
 * Configurable because the destructive one is the one people disagree about:
 * some want Delete under the thumb, others want it nowhere near it. A default
 * that suits one of those two is wrong for the other, and a gesture that
 * deletes something you did not mean to touch is not recoverable by being
 * clever about the default.
 */

/**
 * Re-exported rather than declared here.
 *
 * There were two definitions of this union — one in `domain/types.ts` and one
 * here — and adding an action to either left the other silently short. One
 * declaration, in the module the persisted `Settings` shape lives in.
 */
export type { SwipeActionId } from "./types";

export interface GesturePreferences {
  /** Right-to-left, the side a thumb reaches most easily. */
  trailing: SwipeActionId;
  /** Left-to-right. */
  leading: SwipeActionId;
}

export type GestureSurface = "wishlist" | "activities" | "spending";

export const DEFAULT_GESTURES: Record<GestureSurface, GesturePreferences> = {
  // Delete is trailing everywhere, which is the platform convention. A short
  // swipe only reveals the button; committing on release takes a long,
  // deliberate drag against rising resistance, and destructive actions still
  // ask before they act.
  wishlist: { trailing: "delete", leading: "buy" },
  // Deactivating is the action people actually reach for on a phone — a
  // season ends, a subscription is paused — and it is recoverable. Hiding
  // remains available as a configured alternative.
  activities: { trailing: "deactivate", leading: "none" },
  spending: { trailing: "delete", leading: "none" },
};

/** Which actions each list can actually perform. Offering more would be a lie. */
export const AVAILABLE_ACTIONS: Record<GestureSurface, SwipeActionId[]> = {
  wishlist: ["none", "buy", "edit", "delete"],
  // `deactivate` and `archive` are deliberately both offered: switching an
  // activity off is a financial act — it stops counting toward the budget —
  // and hiding it is a presentation one. See ACTION_LABEL_KEYS below.
  activities: ["none", "deactivate", "archive", "edit", "duplicate", "delete"],
  spending: ["none", "edit", "delete"],
};

/**
 * Translation keys rather than English.
 *
 * These labels are printed in Settings and on the revealed swipe buttons, so a
 * French interface used to offer "Hide from lists" beside "Masquer". The
 * component resolves them; this module stays a leaf with no dependency on the
 * translation layer.
 */
export const ACTION_LABEL_KEYS: Record<SwipeActionId, string> = {
  none: "gesture.none",
  delete: "gesture.delete",
  archive: "gesture.archive",
  deactivate: "gesture.deactivate",
  buy: "gesture.buy",
  edit: "gesture.edit",
  duplicate: "gesture.duplicate",
};

/**
 * The distinction the two activity actions exist to keep apart.
 *
 * Printed in the gesture settings and used as the swipe button's tooltip,
 * because "Hide" and "Deactivate" are one keystroke apart in a list and
 * worlds apart in what they do to the budget.
 */
export const ACTION_DESCRIPTION_KEYS: Partial<Record<SwipeActionId, string>> = {
  archive: "gesture.archiveHint",
  deactivate: "gesture.deactivateHint",
};

/** Destructive actions render in the danger tone and confirm before they act. */
export function isDestructive(action: SwipeActionId): boolean {
  return action === "delete";
}

export function gesturesFor(settings: Settings, surface: GestureSurface): GesturePreferences {
  const stored = settings.gestures?.[surface];
  // Merged rather than replaced, so a stored preference from an older version
  // that only knew one direction does not silently disable the other.
  return { ...DEFAULT_GESTURES[surface], ...(stored ?? {}) };
}
