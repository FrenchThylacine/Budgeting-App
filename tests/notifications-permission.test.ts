/**
 * The push-notification permission request
 * ========================================
 *
 * The previous attempt shipped a permission-shaped component and never called
 * `Notification.requestPermission()` from anywhere, so the browser was never
 * asked. These tests assert the opposite: that the request is genuinely made,
 * that every answer is stored, and that the three states the browser cannot
 * express are told apart.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  declineNotifications,
  notificationStatus,
  notificationsSupported,
  requestNotificationPermission,
  showNotification,
} from "../src/domain/notifications";

type Stub = {
  permission: NotificationPermission;
  requestPermission: ReturnType<typeof vi.fn>;
};

/** Install a stand-in for the browser's `Notification`. */
function installNotification(permission: NotificationPermission, answer?: NotificationPermission): Stub {
  const requestPermission = vi.fn(async () => answer ?? permission);
  const stub = function NotificationStub(this: unknown) {
    /* constructing one is what `showNotification` does */
  } as unknown as Stub & { new (title: string, options?: unknown): unknown };
  (stub as unknown as Stub).permission = permission;
  (stub as unknown as Stub).requestPermission = requestPermission;
  Object.defineProperty(globalThis, "Notification", { value: stub, configurable: true, writable: true });
  Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true, writable: true });
  return stub as unknown as Stub;
}

/**
 * Remove it properly.
 *
 * `defineProperty(…, { value: undefined })` leaves the *key* in place, and the
 * support check is `"Notification" in window` — which would still be true. A
 * browser without the API does not have the key at all.
 */
function removeNotification(): void {
  Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true, writable: true });
  delete (globalThis as Record<string, unknown>).Notification;
}

afterEach(() => {
  removeNotification();
  vi.restoreAllMocks();
});

describe("support detection", () => {
  it("reports a browser with no Notification API as unsupported", () => {
    removeNotification();
    expect(notificationsSupported()).toBe(false);
    expect(notificationStatus(undefined).state).toBe("unsupported");
    // And the control is not offered rather than pretending to work.
    expect(notificationStatus(undefined).canRequest).toBe(false);
  });

  it("reports a browser that has one as supported", () => {
    installNotification("default");
    expect(notificationsSupported()).toBe(true);
  });
});

describe("the request itself", () => {
  it("actually calls Notification.requestPermission", async () => {
    const stub = installNotification("default", "granted");
    await requestNotificationPermission();
    // The whole point. A component that never reaches this line is the bug
    // this test exists to prevent from recurring.
    expect(stub.requestPermission).toHaveBeenCalledTimes(1);
  });

  it("stores the choice when permission is granted", async () => {
    installNotification("default", "granted");
    const result = await requestNotificationPermission(new Date("2026-08-20T10:00:00Z"));
    expect(result.outcome).toBe("granted");
    expect(result.settings).toEqual({
      choice: "enabled",
      decidedAt: "2026-08-20T10:00:00.000Z",
      browserPermission: "granted",
    });
  });

  it("stores the choice when permission is refused", async () => {
    installNotification("default", "denied");
    const result = await requestNotificationPermission();
    expect(result.outcome).toBe("denied");
    expect(result.settings.choice).toBe("declined");
    expect(result.settings.browserPermission).toBe("denied");
  });

  it("treats a dismissed prompt as a decision, so it does not ask again unprompted", async () => {
    installNotification("default", "default");
    const result = await requestNotificationPermission();
    expect(result.outcome).toBe("dismissed");
    expect(result.settings.choice).toBe("declined");
    // The browser has not refused, so the user can still press the button.
    expect(notificationStatus(result.settings).canRequest).toBe(true);
  });

  it("does not ask again once the browser has refused, and says so", async () => {
    const stub = installNotification("denied");
    const result = await requestNotificationPermission();
    expect(stub.requestPermission).not.toHaveBeenCalled();
    expect(result.outcome).toBe("already-denied");
    // A button that silently does nothing is worse than one that is disabled
    // beside an explanation.
    expect(notificationStatus(result.settings).canRequest).toBe(false);
    expect(notificationStatus(result.settings).state).toBe("denied");
  });

  it("reports unsupported rather than throwing when there is no API", async () => {
    removeNotification();
    const result = await requestNotificationPermission();
    expect(result.outcome).toBe("unsupported");
    expect(result.settings.choice).toBe("unsupported");
  });
});

describe("the state the browser cannot express", () => {
  it("tells 'never asked' apart from 'asked and dismissed'", () => {
    installNotification("default");
    // `Notification.permission` is "default" for both of these.
    expect(notificationStatus(undefined).state).toBe("unasked");
    expect(notificationStatus({ choice: "declined" }).state).toBe("declined");
  });

  it("lets the app be turned off without revoking the browser permission", () => {
    installNotification("granted");
    const settings = declineNotifications(new Date("2026-08-20T10:00:00Z"));
    expect(settings.choice).toBe("declined");
    expect(settings.decidedAt).toBe("2026-08-20T10:00:00.000Z");
    // Only the user can revoke the browser grant; the app records its own.
    expect(settings.browserPermission).toBe("granted");
  });
});

describe("showing one", () => {
  it("refuses rather than throwing when permission is missing", () => {
    installNotification("default");
    expect(showNotification("Title", "Body")).toBe(false);
    removeNotification();
    expect(showNotification("Title", "Body")).toBe(false);
  });

  it("shows one when permission has been granted", () => {
    installNotification("granted");
    expect(showNotification("Budget OS", "A payment is due")).toBe(true);
  });
});
