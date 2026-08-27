/**
 * Notification permission
 * =======================
 *
 * The previous attempt shipped a component and never called
 * `Notification.requestPermission()` anywhere, so the browser was never asked
 * and no notification could ever be shown. This module exists so there is
 * exactly one function that performs the request, one that reports the state,
 * and no way to add a permission-shaped control that does nothing.
 *
 * Four rules the browser cannot enforce for us:
 *
 *  - **Ask only from a user gesture, and only once the user knows why.** The
 *    request is reachable from two places, both of which explain first: the
 *    Notifications step of the tutorial, and the toggle in Settings. Nothing
 *    asks on load.
 *  - **Remember the answer.** `Notification.permission` reports `"default"`
 *    both for "never asked" and for "asked and dismissed", which is precisely
 *    the difference between a reasonable prompt and nagging. The user's own
 *    choice is stored in settings alongside it.
 *  - **A refusal is final until the user revisits it.** Once `denied`, the
 *    browser will not show the prompt again at all; asking again is a no-op
 *    that looks like a broken button, so the interface says what to do instead.
 *  - **Unsupported is a real state.** Several browsers, and every iOS Safari
 *    outside an installed web app, have no `Notification` at all. That is not
 *    an error to report — it is a control that should not pretend to work.
 */
import type { NotificationSettings } from "./types";

export type NotificationState = "unsupported" | "unasked" | "granted" | "denied" | "declined";

export interface NotificationStatus {
  state: NotificationState;
  /** True when a request would actually produce the browser's prompt. */
  canRequest: boolean;
  /** The browser's own value, or null where the API does not exist. */
  browserPermission: NotificationPermission | null;
}

/** True when this browser can show notifications at all. */
export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && typeof Notification.requestPermission === "function";
}

/**
 * Where things stand, combining what the browser says with what the user
 * chose.
 *
 * `declined` is *our* state, not the browser's: the user was asked, said no
 * inside the app (or dismissed the browser prompt), and the permission is
 * still `default`. Distinguishing it from `unasked` is what stops the app
 * asking again on every visit.
 */
export function notificationStatus(settings: NotificationSettings | undefined): NotificationStatus {
  if (!notificationsSupported()) {
    return { state: "unsupported", canRequest: false, browserPermission: null };
  }
  const permission = Notification.permission;
  if (permission === "granted") return { state: "granted", canRequest: false, browserPermission: permission };
  if (permission === "denied") return { state: "denied", canRequest: false, browserPermission: permission };
  if (settings?.choice === "declined") {
    // Still requestable: the browser has not refused, the user has. Asking
    // again is legitimate when *they* press the button.
    return { state: "declined", canRequest: true, browserPermission: permission };
  }
  return { state: "unasked", canRequest: true, browserPermission: permission };
}

export interface PermissionRequestResult {
  /** What the browser answered, or why it could not be asked. */
  outcome: "granted" | "denied" | "dismissed" | "unsupported" | "already-denied";
  /** The settings value to store, so the choice survives a reload. */
  settings: NotificationSettings;
}

/**
 * Actually ask the browser.
 *
 * This is the only place in the application that calls
 * `Notification.requestPermission`. It must be reached from a user gesture —
 * every browser requires one, and the two call sites are both a button press.
 *
 * The returned `settings` is what the caller persists. It is returned rather
 * than written here so this module stays free of the store and is directly
 * testable with a stubbed `Notification`.
 */
export async function requestNotificationPermission(now = new Date()): Promise<PermissionRequestResult> {
  const decidedAt = now.toISOString();

  if (!notificationsSupported()) {
    return { outcome: "unsupported", settings: { choice: "unsupported", decidedAt } };
  }

  if (Notification.permission === "denied") {
    // The browser will not prompt again. Saying so beats a button that
    // silently does nothing.
    return {
      outcome: "already-denied",
      settings: { choice: "declined", decidedAt, browserPermission: "denied" },
    };
  }

  let permission: NotificationPermission;
  try {
    // Both shapes: modern browsers return a promise, older Safari takes a
    // callback and returns undefined.
    permission = await new Promise<NotificationPermission>((resolve) => {
      const result = Notification.requestPermission((value) => resolve(value));
      if (result && typeof (result as Promise<NotificationPermission>).then === "function") {
        void (result as Promise<NotificationPermission>).then(resolve);
      }
    });
  } catch {
    return {
      outcome: "dismissed",
      settings: { choice: "declined", decidedAt, browserPermission: "default" },
    };
  }

  if (permission === "granted") {
    return { outcome: "granted", settings: { choice: "enabled", decidedAt, browserPermission: "granted" } };
  }
  if (permission === "denied") {
    return { outcome: "denied", settings: { choice: "declined", decidedAt, browserPermission: "denied" } };
  }
  // Dismissed without choosing. Recorded as declined so the app does not ask
  // again unprompted, and the user can still press the button themselves.
  return { outcome: "dismissed", settings: { choice: "declined", decidedAt, browserPermission: "default" } };
}

/** The settings value written when the user turns notifications off in-app. */
export function declineNotifications(now = new Date()): NotificationSettings {
  return {
    choice: "declined",
    decidedAt: now.toISOString(),
    browserPermission: notificationsSupported() ? Notification.permission : undefined,
  };
}

/**
 * Show one notification, if we are allowed to.
 *
 * Returns false rather than throwing when permission is missing, so a caller
 * can report honestly instead of a reminder failing silently.
 */
export function showNotification(title: string, body: string): boolean {
  if (!notificationsSupported() || Notification.permission !== "granted") return false;
  try {
    new Notification(title, { body, icon: "/icon-192.png", badge: "/favicon-96.png", tag: "budget-os" });
    return true;
  } catch {
    return false;
  }
}
