import React, { useEffect, useState } from "react";
import { AlertTriangle, Check, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { useBudgetStore } from "../../store/budgetStore";
import { formatDateTime } from "../../domain/dates";
import { useTranslation } from "../../i18n/useTranslation";
import { resolveStoredText } from "../../domain/storedText";

/**
 * Makes the persistence state explicit.
 *
 * The app keeps a local cache so it still works offline, but a local write is
 * not the same promise as a saved one. Without this indicator an unreachable
 * server looks exactly like a healthy one — which is how two browsers can each
 * appear to work while silently holding different data.
 */
export const SyncStatus: React.FC = () => {
  const { t } = useTranslation();
  const syncState = useBudgetStore((s) => s.syncState);
  const lastSyncedAt = useBudgetStore((s) => s.lastSyncedAt);
  const syncError = useBudgetStore((s) => s.syncError);
  const pending = useBudgetStore((s) => s.pendingLocalChanges);
  const syncNow = useBudgetStore((s) => s.syncNow);
  const retrySync = useBudgetStore((s) => s.retrySync);
  const [busy, setBusy] = useState(false);

  // A change made on another device should appear when the user comes back to
  // this tab, rather than only after a manual reload.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [syncNow]);

  const config = {
    saved: { icon: Check, label: t("sync.saved"), tone: "success" as const },
    saving: { icon: Loader2, label: t("sync.saving"), tone: "neutral" as const },
    offline: { icon: CloudOff, label: t("sync.offlineThisDeviceOnly"), tone: "warning" as const },
    conflict: { icon: AlertTriangle, label: t("sync.syncConflict"), tone: "warning" as const },
    error: { icon: AlertTriangle, label: t("sync.syncFailed"), tone: "danger" as const },
  }[syncState];

  const Icon = config.icon;
  const needsAction = syncState === "offline" || syncState === "error" || syncState === "conflict";

  const title = [
    config.label,
    syncError ? resolveStoredText(syncError, t) : null,
    lastSyncedAt ? t("settings.syncLast", { when: formatDateTime(lastSyncedAt) }) : t("settings.syncNever"),
    pending ? t("sync.pendingChanges") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const handleRetry = async () => {
    setBusy(true);
    try {
      await (pending ? retrySync() : syncNow({ force: true }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`sync-status sync-status-${config.tone}`} title={title}>
      <Icon size={13} className={syncState === "saving" || busy ? "spin" : undefined} aria-hidden="true" />
      <span className="sync-status-label">{config.label}</span>
      {needsAction && (
        <button
          type="button"
          className="sync-status-action"
          onClick={handleRetry}
          disabled={busy}
          aria-label={t("sync.retrySynchronization")}
        >
          <RefreshCw size={12} /> Retry
        </button>
      )}
      <span className="sr-only" role="status">
        {title}
      </span>
    </div>
  );
};
