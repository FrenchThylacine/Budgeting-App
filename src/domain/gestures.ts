import type { Settings } from "./types";

/**
 * What a swipe does, per direction, per list.
 *
 * Configurable because the destructive one is the one people disagree about:
 * some want Delete under the thumb, others want it nowhere near it. A default
 * that suits one of those two is wrong for the other, and a gesture that
 * deletes something you did not mean to touch is not recoverable by being
 * clever about the default.
 */

export type SwipeActionId = "none" | "delete" | "archive" | "buy" | "edit" | "duplicate";

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
  activities: { trailing: "archive", leading: "none" },
  spending: { trailing: "delete", leading: "none" },
};

/** Which actions each list can actually perform. Offering more would be a lie. */
export const AVAILABLE_ACTIONS: Record<GestureSurface, SwipeActionId[]> = {
  wishlist: ["none", "buy", "edit", "delete"],
  activities: ["none", "archive", "edit", "duplicate", "delete"],
  spending: ["none", "edit", "delete"],
};

export const ACTION_LABELS: Record<SwipeActionId, string> = {
  none: "Nothing",
  delete: "Delete",
  archive: "Hide / show",
  buy: "Buy",
  edit: "Edit",
  duplicate: "Duplicate",
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
