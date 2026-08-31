import { create } from "zustand";
import { calculateRolloverDelta, createNextYearRecord } from "../domain/calculations";
import { ALLOCATION_TYPE, TRANSFER_TYPE, monthlyBudgetPlan, walletState } from "../domain/wallet";
import { monthFromDateInput, monthName, todayDateInput, weekFromDateInput } from "../domain/dates";
import { isUsableAmount } from "../domain/wishlist";
import type { WishlistLinkResult, WishlistPurchaseOverrides } from "../domain/wishlist";
import type {
  Activity,
  AuditType,
  BudgetApproval,
  BudgetCategory,
  BudgetSnapshot,
  CurrencyCode,
  MonthCloseRecord,
  ScenarioPreset,
  SeasonalPreset,
  Settings,
  SpendingEntry,
  WalletEntry,
  WishlistItem,
  YearRecord,
} from "../domain/types";
import { createEmptyBudgetSnapshot } from "../data/seedBudget";
import { scenarioFromCurrentState } from "../domain/scenarios";
import { defaultCategories } from "../data/seedBudget";
import { deleteSnapshot as deleteIdbSnapshot, loadSnapshot as loadIdbSnapshot, saveSnapshot as saveIdbSnapshot } from "../storage/idb";
import { ApiUnavailableError, AuthRequiredError, getApiClient, SnapshotConflictError } from "../api/client";
import { useAuthStore } from "./authStore";
import { isViewingHistoricalPeriod } from "../utils/formatters";
import { periodToken } from "../domain/periods";
import { storedText } from "../domain/storedText";

/** Settings fields that define which period is being viewed. */
const PERIOD_SETTING_KEYS = [
  "selectedYear",
  "selectedMonth",
  "selectedWeek",
  "selectedWeekYear",
  "selectedPeriodMode",
] as const satisfies readonly (keyof Settings)[];

/**
 * `saved`    — in sync with the server.
 * `saving`   — a write is in flight.
 * `offline`  — server unreachable; changes live only on this device.
 * `conflict` — the server holds data this device did not build on.
 * `error`    — the server rejected or failed the write for another reason.
 */
export type SyncState = "saved" | "saving" | "offline" | "conflict" | "error";

type ActivityInput = Omit<Activity, "id" | "order"> & Partial<Pick<Activity, "id" | "order">>;
type SpendingInput = Omit<SpendingEntry, "id" | "createdAt" | "updatedAt"> & Partial<Pick<SpendingEntry, "id">>;
type WalletInput = Omit<WalletEntry, "id" | "createdAt"> & Partial<Pick<WalletEntry, "id">>;
type WishlistInput = Omit<WishlistItem, "id" | "dateAdded"> & Partial<Pick<WishlistItem, "id" | "dateAdded">>;

/**
 * Audit types that record a change to period-bound financial data. Only these
 * can constitute an edit to history; navigation and preference changes cannot.
 */
const PERIOD_BOUND_AUDIT_TYPES = new Set<AuditType>([
  "activity",
  "spending",
  "wishlist",
  "wallet",
  "rollover",
  "delete",
]);

interface BudgetStore {
  snapshot: BudgetSnapshot;
  hydrated: boolean;
  undoStack: BudgetSnapshot[];
  redoStack: BudgetSnapshot[];
  /** User-facing message about cross-device sync (e.g. a rejected stale write). */
  syncNotice: string | null;
  clearSyncNotice: () => void;

  /**
   * Where the data currently stands relative to the server. Surfaced in the UI
   * so "API unreachable" is never mistaken for "saved everywhere".
   */
  syncState: SyncState;
  /** Revision this client last read from or wrote to the server. */
  baseRevision: number | null;
  lastSyncedAt: string | null;
  /** True when local edits have not reached the server. */
  pendingLocalChanges: boolean;
  syncError: string | null;
  /** Pull the server copy when it is newer (focus, load, manual retry). */
  syncNow: (options?: { force?: boolean }) => Promise<void>;
  /** Re-send local changes that never reached the server. */
  retrySync: () => Promise<void>;
  /**
   * Deliberate, session-only override letting the user edit a closed period.
   * Never persisted: it is a UI intent, not financial data, and it must not
   * travel to another device or survive a reload. It clears automatically as
   * soon as the selected period changes.
   */
  historicalEditUnlocked: boolean;
  unlockHistoricalEditing: () => void;
  lockHistoricalEditing: () => void;
  /** True when the selected period is historical AND the override is active. */
  isEditingHistory: () => boolean;
  isCurrentPeriodMutable: () => boolean;
  hydrate: () => Promise<void>;
  resetToSeed: () => Promise<void>;
  importSnapshot: (snapshot: BudgetSnapshot, summary?: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  selectYear: (year: number) => void;
  addActivity: (activity: ActivityInput) => void;
  updateActivity: (id: string, patch: Partial<Activity>) => void;
  removeActivity: (id: string) => void;
  duplicateActivity: (id: string) => void;
  moveActivity: (id: string, direction: -1 | 1) => void;
  reorderActivity: (sourceId: string, targetId: string) => void;
  addSpendingEntry: (entry: SpendingInput) => void;
  updateSpendingEntry: (id: string, patch: Partial<SpendingEntry>) => void;
  removeSpendingEntry: (id: string) => void;
  addWishlistItem: (item: WishlistInput) => void;
  updateWishlistItem: (id: string, patch: Partial<WishlistItem>) => void;
  removeWishlistItem: (id: string) => void;

  /**
   * Wishlist ↔ spending linking.
   *
   * A wishlist item and the transaction that fulfilled it point at each other
   * (`WishlistItem.linkedSpendingId` ⇄ `SpendingEntry.wishlistItemId`). These
   * four actions are the only supported way to create or break that pair, so
   * the two references can never disagree, no item ever ends up with two
   * transactions, and no transaction is deleted behind the user's back.
   */
  /** Write the spending entry that fulfils an item and link both sides. */
  recordWishlistPurchase: (itemId: string, overrides?: WishlistPurchaseOverrides) => WishlistLinkResult;
  /** Point an existing transaction at an item, or pass `null` to unlink it. */
  linkSpendingToWishlistItem: (spendingId: string, itemId: string | null) => WishlistLinkResult;
  /** Break the pair, deliberately leaving the spending entry in place. */
  unlinkWishlistPurchase: (itemId: string) => WishlistLinkResult;
  /** Mark bought/not bought; un-marking unlinks but never deletes spending. */
  setWishlistItemBought: (itemId: string, bought: boolean) => WishlistLinkResult;
  /** The live transaction an item points at, or null when there is none. */
  findLinkedSpendingEntry: (itemId: string) => SpendingEntry | null;
  addWalletEntry: (entry: WalletInput) => void;
  /**
   * Bring the wallet balance to exactly zero.
   *
   * Deliberately **not** a deletion. Wallet entries are a record of money that
   * moved — an opening balance, a month-end rollover, a cash adjustment — and
   * erasing them to make a figure read zero destroys history to fix a display.
   * One balancing adjustment in the display currency does the job, is visible
   * in the list, lands on the undo stack, and touches nothing else in the
   * budget. Returns the amount that was written, or null when the balance was
   * already zero and nothing needed doing.
   */
  resetWallet: () => number | null;
  /**
   * Record money genuinely received for this month's budget.
   *
   * Deliberately an explicit act. The planning system calculates what the
   * month *needs*; only the user can say the money actually arrived, and
   * assuming it did because a figure was computed is how a treasury starts
   * lying about how much cash exists.
   */
  allocateBudget: (input: {
    amount: number;
    currency: CurrencyCode;
    date: string;
    note?: string;
    source?: string;
  }) => void;
  /**
   * Move leftover budget money to the personal side.
   *
   * Changes what is spoken for, not how much money exists — the wallet
   * balance is deliberately unaffected. Offered at the two moments leftover
   * budget comes up, and never performed without being asked for.
   */
  transferBudgetToPersonal: (amount: number, note?: string) => void;
  updateWalletEntry: (id: string, patch: Partial<WalletEntry>) => void;
  removeWalletEntry: (id: string) => void;
  closeMonth: (year: number, month: number, applyRollover: boolean) => void;
  recordBudgetApproval: (approval: Omit<BudgetApproval, "id" | "createdAt" | "decidedAt">) => void;
  /**
   * A note against one month of one year.
   *
   * `YearRecord.monthlyNotes` has existed as a type since the beginning with
   * no action and no interface, so it was carried through every save and read
   * by nothing. An empty note removes the entry rather than storing a blank
   * one, so "no note" is one state rather than two.
   */
  setMonthlyNote: (year: number, month: number, note: string) => void;
  applySeasonalPreset: (presetId: string) => void;
  /**
   * Capture the current activity states as a named season.
   *
   * Seasonal presets were seeded and applicable but creatable from nowhere, so
   * on a real account — which is seeded with none — the feature could never be
   * used at all. Capturing is the natural way in: set the activities up for
   * winter, then name it, rather than filling in a form describing a state you
   * are already looking at.
   */
  captureSeasonalPreset: (name: string, season: string) => void;
  removeSeasonalPreset: (presetId: string) => void;
  applyScenarioPreset: (presetId: string) => void;
  addScenarioPreset: (preset: Omit<ScenarioPreset, "id">) => void;
  updateScenarioPreset: (id: string, patch: Partial<Omit<ScenarioPreset, "id">>) => void;
  duplicateScenarioPreset: (id: string) => void;
  removeScenarioPreset: (id: string) => void;
  /** Capture the current budget and caps as a new scenario. */
  captureScenarioPreset: (name: string) => void;
  undo: () => void;
  redo: () => void;
  // Category management
  addCategory: (category: Omit<BudgetCategory, "id">) => void;
  updateCategory: (id: string, patch: Partial<BudgetCategory>) => void;
  archiveCategory: (id: string) => void;
  reorderCategory: (sourceId: string, targetId: string) => void;
}

/** Ticket for the newest in-flight hydration; see `hydrate`. */
let hydrateGeneration = 0;

export const useBudgetStore = create<BudgetStore>((set, get) => ({
  snapshot: createEmptyBudgetSnapshot(),
  hydrated: false,
  undoStack: [],
  redoStack: [],
  syncNotice: null,
  clearSyncNotice: () => set({ syncNotice: null }),

  syncState: "saved",
  baseRevision: null,
  lastSyncedAt: null,
  pendingLocalChanges: false,
  syncError: null,
  syncNow: async (options) => {
    await syncFromServer(set, get, options);
  },
  retrySync: async () => {
    // Re-send what this device holds. The compare-and-swap still protects the
    // other device: a stale base is rejected rather than overwriting it.
    persistSnapshot(get().snapshot, set, get);
  },

  historicalEditUnlocked: false,
  unlockHistoricalEditing: () => set({ historicalEditUnlocked: true }),
  lockHistoricalEditing: () => set({ historicalEditUnlocked: false }),
  isEditingHistory: () =>
    isViewingHistoricalPeriod(get().snapshot.settings) && get().historicalEditUnlocked,

  isCurrentPeriodMutable: () =>
    !isViewingHistoricalPeriod(get().snapshot.settings) || get().historicalEditUnlocked,

  /**
   * Load order matters for multi-device correctness: the server is asked
   * first and wins when reachable, so a device never boots from a stale local
   * cache and then overwrites newer remote data. IndexedDB is used only when
   * the server cannot be reached, and that case is reported as `offline`
   * rather than being passed off as a normal load.
   */
  hydrate: async () => {
    /*
     * Only the newest hydration may write.
     *
     * Two can be in flight at once — a session check settles, the user signs
     * in, and the effect that hydrates runs again — and they can finish out of
     * order. When they do, a *rejected* earlier attempt lands after a
     * successful later one and sets `hydrated: false` on a store that is
     * already holding the account's real budget. The application then runs on
     * a default snapshot with the session intact, which is the shape of the
     * bug this guards: settings read back as empty, and nothing in the
     * interface says why.
     *
     * A generation counter is the whole fix: take a ticket, and drop the
     * result if a newer attempt started while this one was waiting.
     */
    const generation = ++hydrateGeneration;
    const current = () => generation === hydrateGeneration;
    const apiClient = getApiClient();
    try {
      const remote = await apiClient.loadSnapshot();
      if (!current()) return;
      if (remote) {
        const normalized = normalizeSnapshot(remote);
        set({
          snapshot: normalized,
          hydrated: true,
          baseRevision: normalized.revision ?? 0,
          syncState: "saved",
          lastSyncedAt: new Date().toISOString(),
          pendingLocalChanges: false,
          syncError: null,
        });
        await saveIdbSnapshot(normalized).catch(() => undefined);
        return;
      }

      // Server reachable but empty: this device seeds it, starting from
      // whatever it already had locally so nothing is lost.
      const local = await loadIdbSnapshot().catch(() => null);
      if (!current()) return;
      // A new account, not a demo. Its first budget is empty; the local cache
      // is used only if this device genuinely has unsynced work.
      const seeded = normalizeSnapshot(local ?? createEmptyBudgetSnapshot());
      set({ snapshot: seeded, hydrated: true, baseRevision: null, syncState: "saving" });
      persistSnapshot(seeded, set, get);
      return;
    } catch (error) {
      // A signed-out client has no budget. Falling through to the cache here
      // would render whatever this device last held — which, after a sign-out
      // or a session expiry, is the previous account's data.
      if (!current()) return;
      if (error instanceof AuthRequiredError) {
        useAuthStore.getState().handleSessionExpired();
        set({ hydrated: false, syncState: "error", syncError: null });
        return;
      }
      if (!(error instanceof ApiUnavailableError)) {
        console.error("Unexpected error while loading from the server:", error);
      }
      const local = await loadIdbSnapshot().catch(() => null);
      if (!current()) return;
      set({
        snapshot: normalizeSnapshot(local ?? createEmptyBudgetSnapshot()),
        hydrated: true,
        baseRevision: null,
        syncState: "offline",
        pendingLocalChanges: local != null,
        syncError:
          storedText("sync.offlineCopy"),
      });
    }
  },

  resetToSeed: async () => {
    const next = normalizeSnapshot(createEmptyBudgetSnapshot());
    await deleteIdbSnapshot().catch(() => undefined);
    set({ snapshot: next, undoStack: [], redoStack: [], hydrated: true });
    // Push the reset through the same guarded path, so it is reported
    // honestly if the server cannot be reached.
    persistSnapshot(next, set, get);
  },

  importSnapshot: (snapshot, summary = storedText("audit.import")) => {
    commit(set, get, () => normalizeSnapshot(snapshot), "import", summary);
  },

  updateSettings: (patch) => {
    // Moving to another period always relocks history: an override granted for
    // one period must never silently carry over to the next.
    if (PERIOD_SETTING_KEYS.some((key) => key in patch)) {
      set({ historicalEditUnlocked: false });
    }
    commit(
      set,
      get,
      (snapshot) => {
        snapshot.settings = { ...snapshot.settings, ...patch };
      },
      "settings",
      storedText("audit.settings"),
      patch,
    );
  },

  selectYear: (year) => {
    set({ historicalEditUnlocked: false });
    commit(
      set,
      get,
      (snapshot) => {
        if (!snapshot.years[String(year)]) {
          snapshot.years[String(year)] = createNextYearRecord(snapshot, year);
        }
        snapshot.settings.selectedYear = year;
        snapshot.settings.selectedMonth = Math.min(Math.max(snapshot.settings.selectedMonth, 1), 12);
      },
      "year",
      storedText("audit.yearSwitched", { year }),
      { year },
    );
  },

  addActivity: (activity) => {
    if (!get().isCurrentPeriodMutable()) return;
    commit(
      set,
      get,
      (snapshot) => {
        const year = currentYear(snapshot);
        year.activities.push({
          ...activity,
          id: activity.id ?? id("act"),
          order: activity.order ?? nextOrder(year.activities),
        });
      },
      "activity",
      storedText("audit.activityAdded", { name: activity.name }),
    );
  },

  updateActivity: (idValue, patch) => {
    if (!get().isCurrentPeriodMutable()) return;
    commit(
      set,
      get,
      (snapshot) => {
        const activity = currentYear(snapshot).activities.find((item) => item.id === idValue);
        if (activity) Object.assign(activity, patch);
      },
      "activity",
      storedText("audit.activityUpdated"),
      { id: idValue, patch },
    );
  },

  removeActivity: (idValue) => {
    if (!get().isCurrentPeriodMutable()) return;
    commit(
      set,
      get,
      (snapshot) => {
        const year = currentYear(snapshot);
        const removed = year.activities.find((item) => item.id === idValue);
        year.activities = year.activities.filter((item) => item.id !== idValue);
        year.spendingEntries = year.spendingEntries.map((entry) =>
          entry.activityId === idValue ? { ...entry, activityId: undefined } : entry,
        );
        return removed?.name;
      },
      "delete",
      storedText("audit.activityDeleted"),
      { id: idValue },
    );
  },

  duplicateActivity: (idValue) => {
    if (!get().isCurrentPeriodMutable()) return;
    commit(
      set,
      get,
      (snapshot) => {
        const year = currentYear(snapshot);
        const source = year.activities.find((item) => item.id === idValue);
        if (!source) return;
        year.activities.push({
          ...source,
          id: id("act"),
          name: `${source.name} copy`,
          order: nextOrder(year.activities),
        });
      },
      "activity",
      storedText("audit.activityDuplicated"),
      { id: idValue },
    );
  },

  moveActivity: (idValue, direction) => {
    if (!get().isCurrentPeriodMutable()) return;
    commit(
      set,
      get,
      (snapshot) => {
        const activities = currentYear(snapshot).activities.sort((a, b) => a.order - b.order);
        const index = activities.findIndex((item) => item.id === idValue);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= activities.length) return;
        [activities[index].order, activities[target].order] = [activities[target].order, activities[index].order];
      },
      "activity",
      storedText("audit.activitiesReordered"),
      { id: idValue, direction },
    );
  },

  reorderActivity: (sourceId, targetId) => {
    if (!get().isCurrentPeriodMutable()) return;
    commit(
      set,
      get,
      (snapshot) => {
        const activities = currentYear(snapshot).activities.sort((a, b) => a.order - b.order);
        const sourceIndex = activities.findIndex((item) => item.id === sourceId);
        const targetIndex = activities.findIndex((item) => item.id === targetId);
        if (sourceIndex < 0 || targetIndex < 0) return;
        const [source] = activities.splice(sourceIndex, 1);
        activities.splice(targetIndex, 0, source);
        activities.forEach((activity, index) => {
          activity.order = index;
        });
      },
      "activity",
      storedText("audit.activitiesDragged"),
      { sourceId, targetId },
    );
  },

  addSpendingEntry: (entry) => {
    if (!get().isCurrentPeriodMutable()) return;
    const timestamp = new Date().toISOString();
    commit(
      set,
      get,
      (snapshot) => {
        const year = entry.year;
        ensureYearRecord(snapshot, year).spendingEntries.push({
          ...entry,
          year,
          id: entry.id ?? id("spend"),
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      },
      "spending",
      storedText("audit.spendingAdded"),
      entry,
    );
  },

  updateSpendingEntry: (idValue, patch) => {
    if (!get().isCurrentPeriodMutable()) return;
    commit(
      set,
      get,
      (snapshot) => {
        const sourceRecord = Object.values(snapshot.years).find((record) => record.spendingEntries.some((item) => item.id === idValue));
        const entry = sourceRecord?.spendingEntries.find((item) => item.id === idValue);
        if (!entry || !sourceRecord) return;
        Object.assign(entry, patch);
        if (patch.date) {
          entry.month = monthFromDateInput(patch.date);
          entry.week = weekFromDateInput(patch.date);
          entry.year = Number(patch.date.slice(0, 4));
        }
        entry.updatedAt = new Date().toISOString();
        if (entry.year !== sourceRecord.year) {
          sourceRecord.spendingEntries = sourceRecord.spendingEntries.filter((item) => item.id !== idValue);
          ensureYearRecord(snapshot, entry.year).spendingEntries.push(entry);
        }
      },
      "spending",
      storedText("audit.spendingUpdated"),
      { id: idValue, patch },
    );
  },

  removeSpendingEntry: (idValue) => {
    if (!get().isCurrentPeriodMutable()) return;
    commit(
      set,
      get,
      (snapshot) => {
        // Clear the wishlist side first: an item must never keep a
        // `linkedSpendingId` pointing at a transaction that has been deleted.
        clearWishlistLinks(snapshot, undefined, idValue);
        for (const year of Object.values(snapshot.years)) {
          year.spendingEntries = year.spendingEntries.filter((item) => item.id !== idValue);
        }
      },
      "delete",
      storedText("audit.spendingDeleted"),
      { id: idValue },
    );
  },

  addWishlistItem: (item) => {
    if (!get().isCurrentPeriodMutable()) return;
    commit(
      set,
      get,
      (snapshot) => {
        currentYear(snapshot).wishlistItems.push({
          ...withRequiredWishlistFields(normalizeWishlistPatch(item)),
          id: item.id ?? id("wish"),
          dateAdded: item.dateAdded ?? new Date().toISOString(),
        });
      },
      "wishlist",
      storedText("audit.wishlistAdded", { name: item.name }),
    );
  },

  updateWishlistItem: (idValue, patch) => {
    if (!get().isCurrentPeriodMutable()) return;
    commit(
      set,
      get,
      (snapshot) => {
        const item = currentYear(snapshot).wishlistItems.find((wish) => wish.id === idValue);
        if (!item) return;
        Object.assign(item, patch);
        if (patch.bought === true && !item.datePurchased) item.datePurchased = new Date().toISOString();
        if (patch.bought === false) item.datePurchased = undefined;
        Object.assign(item, withRequiredWishlistFields(normalizeWishlistPatch(item)));
      },
      "wishlist",
      storedText("audit.wishlistUpdated"),
      { id: idValue, patch },
    );
  },

  removeWishlistItem: (idValue) => {
    if (!get().isCurrentPeriodMutable()) return;
    commit(
      set,
      get,
      (snapshot) => {
        // The transaction survives the item, but it must not keep pointing at
        // something that no longer exists.
        clearWishlistLinks(snapshot, idValue, undefined);
        const year = currentYear(snapshot);
        year.wishlistItems = year.wishlistItems.filter((item) => item.id !== idValue);
      },
      "delete",
      storedText("audit.wishlistDeleted"),
      { id: idValue },
    );
  },

  // ─── Wishlist ↔ spending linking ──────────────────────────────────────────

  recordWishlistPurchase: (itemId, overrides = {}) => {
    if (!get().isCurrentPeriodMutable()) return { status: "locked" };
    const snapshot = get().snapshot;
    const item = findWishlistItemById(snapshot, itemId);
    if (!item) return { status: "not-found" };

    // One item, one transaction. A link that still resolves wins: the caller
    // is offered the existing entry instead of a second one being written.
    const existing = findSpendingEntryById(snapshot, item.linkedSpendingId);
    if (existing) return { status: "already-linked", spendingId: existing.id };

    // 0 is a real price; only a missing one blocks the purchase.
    const amount = isUsableAmount(overrides.amount) ? overrides.amount : item.actualPrice;
    if (!isUsableAmount(amount)) return { status: "invalid-amount" };

    const date = normalizeDateInput(overrides.date) ?? todayDateInput();
    const spendingId = id("spend");
    const timestamp = new Date().toISOString();

    commit(
      set,
      get,
      (draft) => {
        const target = findWishlistItemById(draft, itemId);
        if (!target) return;
        const year = Number(date.slice(0, 4));
        ensureYearRecord(draft, year).spendingEntries.push({
          id: spendingId,
          year,
          month: monthFromDateInput(date),
          week: weekFromDateInput(date),
          date,
          categoryId: overrides.categoryId ?? target.categoryId,
          amount,
          currency: overrides.currency ?? target.currency,
          recurrenceType: overrides.recurrenceType ?? "none",
          isPiloting: overrides.isPiloting ?? false,
          source: overrides.source ?? "personal",
          note: overrides.note?.trim() || target.name,
          wishlistItemId: target.id,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        markWishlistBought(target, spendingId, date);
      },
      "spending",
      storedText("audit.wishlistPurchased", { name: item.name }),
      { itemId, spendingId, amount, date },
    );

    return { status: "created", spendingId };
  },

  linkSpendingToWishlistItem: (spendingId, itemId) => {
    if (!get().isCurrentPeriodMutable()) return { status: "locked" };
    const snapshot = get().snapshot;
    const entry = findSpendingEntryById(snapshot, spendingId);
    if (!entry) return { status: "not-found" };

    if (!itemId) {
      const owner = findWishlistItemBySpendingId(snapshot, spendingId);
      if (!entry.wishlistItemId && !owner) return { status: "unlinked" };
      commit(
        set,
        get,
        (draft) => clearWishlistLinks(draft, entry.wishlistItemId, spendingId),
        "wishlist",
        storedText("audit.wishlistUnlinked"),
        { spendingId, itemId: entry.wishlistItemId },
      );
      return { status: "unlinked", spendingId };
    }

    const item = findWishlistItemById(snapshot, itemId);
    if (!item) return { status: "not-found" };
    if (entry.wishlistItemId === itemId && item.linkedSpendingId === spendingId) {
      return { status: "linked", spendingId };
    }
    // The item already has a live transaction of its own: linking a second one
    // would count the same purchase twice.
    const rival = findSpendingEntryById(snapshot, item.linkedSpendingId);
    if (rival && rival.id !== spendingId) return { status: "already-linked", spendingId: rival.id };

    commit(
      set,
      get,
      (draft) => {
        const draftEntry = findSpendingEntryById(draft, spendingId);
        const draftItem = findWishlistItemById(draft, itemId);
        if (!draftEntry || !draftItem) return;
        clearWishlistLinks(draft, itemId, spendingId);
        draftEntry.wishlistItemId = itemId;
        draftEntry.updatedAt = new Date().toISOString();
        markWishlistBought(draftItem, spendingId, draftEntry.date);
      },
      "wishlist",
      storedText("audit.wishlistLinked", { name: item.name }),
      { spendingId, itemId },
    );
    return { status: "linked", spendingId };
  },

  unlinkWishlistPurchase: (itemId) => {
    if (!get().isCurrentPeriodMutable()) return { status: "locked" };
    const snapshot = get().snapshot;
    const item = findWishlistItemById(snapshot, itemId);
    if (!item) return { status: "not-found" };
    const linkedId = item.linkedSpendingId;
    const linked = findSpendingEntryById(snapshot, linkedId);
    if (!linkedId) return { status: "unlinked" };

    commit(
      set,
      get,
      // The spending entry is deliberately kept: only the user decides whether
      // money that was really spent disappears from a period.
      (draft) => clearWishlistLinks(draft, itemId, linkedId),
      "wishlist",
      storedText("audit.wishlistUnlinkedFrom", { name: item.name }),
      { itemId, spendingId: linkedId },
    );
    return { status: "unlinked", spendingId: linked?.id };
  },

  setWishlistItemBought: (itemId, bought) => {
    if (!get().isCurrentPeriodMutable()) return { status: "locked" };
    const snapshot = get().snapshot;
    const item = findWishlistItemById(snapshot, itemId);
    if (!item) return { status: "not-found" };
    const linked = findSpendingEntryById(snapshot, item.linkedSpendingId);
    if (item.bought === bought && !(bought === false && item.linkedSpendingId)) {
      return { status: "updated" };
    }

    commit(
      set,
      get,
      (draft) => {
        const target = findWishlistItemById(draft, itemId);
        if (!target) return;
        if (bought) {
          markWishlistBought(target, target.linkedSpendingId, undefined);
          return;
        }
        clearWishlistLinks(draft, itemId, target.linkedSpendingId);
        target.bought = false;
        target.datePurchased = undefined;
        Object.assign(target, normalizeWishlistPatch(target));
      },
      "wishlist",
      storedText(bought ? "audit.wishlistBought" : "audit.wishlistUnbought", { name: item.name }),
      { itemId, bought },
    );

    return bought ? { status: "updated" } : { status: "unlinked", spendingId: linked?.id };
  },

  findLinkedSpendingEntry: (itemId) => {
    const snapshot = get().snapshot;
    const item = findWishlistItemById(snapshot, itemId);
    return findSpendingEntryById(snapshot, item?.linkedSpendingId);
  },

  addWalletEntry: (entry) => {
    if (!get().isCurrentPeriodMutable()) return;
    commit(
      set,
      get,
      (snapshot) => {
        currentYear(snapshot).walletEntries.push({
          ...entry,
          id: entry.id ?? id("wallet"),
          createdAt: new Date().toISOString(),
        });
      },
      "wallet",
      storedText("audit.walletAdded"),
      entry,
    );
  },

  allocateBudget: ({ amount, currency, date, note, source }) => {
    if (!get().isCurrentPeriodMutable()) return;
    if (!Number.isFinite(amount) || amount === 0) return;
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));
    commit(
      set,
      get,
      (snapshot) => {
        ensureYearRecord(snapshot, year).walletEntries.push({
          id: id("wallet-allocation"),
          year,
          month,
          date,
          amount,
          currency,
          /*
           * A translation key, not a sentence.
           *
           * The store has no language. Writing "Budget for August 2026" here
           * put an English string into a French ledger for ever — and, worse,
           * froze it: changing the interface language afterwards could not
           * change a row that had already been saved. The panel resolves
           * `wallet.allocationSource` at render time, so the ledger reads in
           * whatever language the user is using today.
           */
          source: source?.trim() || storedText("wallet.allocationSource", { month: monthName(month), year }),
          type: ALLOCATION_TYPE,
          note: note?.trim() ?? "",
          createdAt: new Date().toISOString(),
        });
      },
      "wallet",
      storedText("audit.budgetAllocated", { month: monthName(month), year }),
      { year, month, amount, currency },
    );
  },

  transferBudgetToPersonal: (amount, note) => {
    if (!get().isCurrentPeriodMutable()) return;
    if (!Number.isFinite(amount) || amount <= 0) return;
    const snapshot = get().snapshot;
    const year = snapshot.settings.selectedYear;
    const month = snapshot.settings.selectedMonth;
    commit(
      set,
      get,
      (draft) => {
        ensureYearRecord(draft, year).walletEntries.push({
          id: id("wallet-transfer"),
          year,
          month,
          date: todayDateInput(),
          amount,
          currency: draft.settings.baseCurrency,
          source: storedText("wallet.transferSource"),
          type: TRANSFER_TYPE,
          note: note?.trim() || storedText("wallet.transferLedgerNote"),
          createdAt: new Date().toISOString(),
        });
      },
      "wallet",
      storedText("audit.walletTransferred"),
      { year, month, amount },
    );
  },

  resetWallet: () => {
    if (!get().isCurrentPeriodMutable()) return null;
    const snapshot = get().snapshot;
    const year = snapshot.settings.selectedYear;
    // The real balance across the whole ledger, not one year's entries: the
    // wallet is continuous, and zeroing a slice of it would leave a figure
    // that is zero on one screen and not on another.
    const balance = walletState(snapshot).walletBalance;
    // Below a hundredth of a unit is below anything the app displays, and
    // writing a €0.000001 adjustment would be noise in the ledger forever.
    if (Math.abs(balance) < 0.005) return null;

    const adjustment = -balance;
    // Budget money still claimed by the ledger. Zeroing the cash while leaving
    // this standing would assert that €600 of budget money is available in a
    // wallet the user has just declared empty — a contradiction they can see,
    // and one that drives the personal balance negative by exactly that
    // amount. The claim is released first, so all three figures land on zero.
    const claimed = walletState(snapshot).budgetRemaining;

    commit(
      set,
      get,
      (draft) => {
        const record = ensureYearRecord(draft, year);
        if (Math.abs(claimed) >= 0.005) {
          record.walletEntries.push({
            id: id("wallet-reset-claim"),
            year,
            month: draft.settings.selectedMonth,
            date: todayDateInput(),
            amount: claimed,
            currency: draft.settings.baseCurrency,
            source: storedText("wallet.resetSource"),
            type: TRANSFER_TYPE,
            note: storedText("wallet.resetClaimNote"),
            createdAt: new Date().toISOString(),
          });
        }
        record.walletEntries.push({
          id: id("wallet-reset"),
          year,
          month: draft.settings.selectedMonth,
          amount: adjustment,
          currency: draft.settings.baseCurrency,
          date: todayDateInput(),
          source: storedText("wallet.resetSource"),
          type: "adjustment",
          note: storedText("wallet.resetLedgerNote"),
          createdAt: new Date().toISOString(),
        });
      },
      "wallet",
      storedText("audit.walletReset"),
      { year, previousBalance: balance, adjustment },
    );
    return adjustment;
  },

  updateWalletEntry: (idValue, patch) => {
    if (!get().isCurrentPeriodMutable()) return;
    commit(
      set,
      get,
      (snapshot) => {
        const entry = currentYear(snapshot).walletEntries.find((item) => item.id === idValue);
        if (entry) Object.assign(entry, patch);
      },
      "wallet",
      storedText("audit.walletUpdated"),
      { id: idValue, patch },
    );
  },

  removeWalletEntry: (idValue) => {
    if (!get().isCurrentPeriodMutable()) return;
    commit(
      set,
      get,
      (snapshot) => {
        const year = currentYear(snapshot);
        year.walletEntries = year.walletEntries.filter((item) => item.id !== idValue);
      },
      "delete",
      storedText("audit.walletDeleted"),
      { id: idValue },
    );
  },

  closeMonth: (year, month, applyRollover) => {
    if (!get().isCurrentPeriodMutable()) return;
    commit(
      set,
      get,
      (snapshot) => {
        const record = snapshot.years[String(year)];
        if (!record) return;
        const timestamp = new Date().toISOString();
        const existing = record.closedMonths.find((item) => item.month === month);
        if (existing) {
          record.closedMonths = record.closedMonths.filter((item) => item.month !== month);
        }
        const delta = calculateRolloverDelta(snapshot, year, month);
        let closeRecord: MonthCloseRecord;
        if (delta == null) {
          closeRecord = {
            id: id("close"),
            year,
            month,
            status: "blocked-missing-data",
            spendTotal: null,
            delta: null,
            confirmedAt: timestamp,
            note: storedText("audit.rolloverBlocked"),
          };
        } else if (applyRollover) {
          const walletEntryId = id("wallet-rollover");
          record.walletEntries.push({
            id: walletEntryId,
            year,
            month,
            amount: delta,
            currency: snapshot.settings.baseCurrency,
            source: storedText("wallet.monthEndRollover"),
            type: "rollover",
            note: delta < 0 ? storedText("audit.rolloverNegative") : storedText("audit.rolloverPositive"),
            createdAt: timestamp,
          });
          closeRecord = {
            id: id("close"),
            year,
            month,
            status: "closed-with-rollover",
            spendTotal: snapshot.settings.monthlyBudget - delta,
            delta,
            rolloverWalletEntryId: walletEntryId,
            confirmedAt: timestamp,
            note: delta < 0 ? storedText("audit.rolloverConfirmedNegative") : storedText("audit.rolloverConfirmedPositive"),
          };
        } else {
          closeRecord = {
            id: id("close"),
            year,
            month,
            status: "closed-without-rollover",
            spendTotal: snapshot.settings.monthlyBudget - delta,
            delta,
            confirmedAt: timestamp,
            note: storedText("audit.rolloverSkipped"),
          };
        }
        record.closedMonths.push(closeRecord);
      },
      "rollover",
      applyRollover ? storedText("audit.monthClosedRollover") : storedText("audit.monthClosed"),
      { year, month, applyRollover },
    );
  },

  recordBudgetApproval: (approval) => {
    // Intentionally checks the period directly rather than
    // `isCurrentPeriodMutable()`: the historical override unlocks *data*, not
    // decision records. An approval states what was decided at the time, so it
    // stays immutable even while the rest of the period is unlocked (Rule 6),
    // and the consent dialog promises exactly this.
    if (isViewingHistoricalPeriod(get().snapshot.settings)) return;
    if (get().snapshot.budgetApprovals.some((item) => item.year === approval.year && item.month === approval.month && item.status === "approved")) {
      return;
    }
    commit(
      set,
      get,
      (snapshot) => {
        const timestamp = new Date().toISOString();
        snapshot.budgetApprovals.unshift({
          ...approval,
          id: id("budget-approval"),
          createdAt: timestamp,
          decidedAt: timestamp,
        });
        if (approval.status === "approved" && approval.approvedAmount != null) {
          snapshot.settings.monthlyBudget = approval.approvedAmount;
          snapshot.settings.monthlyBudgetCurrency = approval.currency;
        }
      },
      "settings",
      approval.status === "approved" ? storedText("audit.budgetApproved") : storedText("audit.budgetRejected"),
      approval,
    );
  },

  setMonthlyNote: (year, month, note) => {
    const trimmed = note.trim();
    commit(
      set,
      get,
      (snapshot) => {
        const record = snapshot.years[String(year)];
        if (!record) return;
        if (!record.monthlyNotes) record.monthlyNotes = {};
        if (trimmed) {
          record.monthlyNotes[month] = { month, note: trimmed, updatedAt: new Date().toISOString() };
        } else {
          delete record.monthlyNotes[month];
        }
      },
      "settings",
      storedText(trimmed ? "audit.noteWritten" : "audit.noteCleared", { month: monthName(month), year }),
      { year, month },
    );
  },

  captureSeasonalPreset: (name, season) => {
    commit(
      set,
      get,
      (snapshot) => {
        const year = currentYear(snapshot);
        const activityOverrides: SeasonalPreset["activityOverrides"] = {};
        for (const activity of year.activities) {
          // Only the fields a season is about. Capturing everything would make
          // applying a season overwrite names, categories and schedules too.
          activityOverrides[activity.id] = {
            active: activity.active,
            visible: activity.visible,
            pricePerMonth: activity.pricePerMonth,
            recurrenceType: activity.recurrenceType,
            recurrenceInterval: activity.recurrenceInterval,
            currency: activity.currency,
          };
        }
        snapshot.seasonalPresets.push({
          id: id("season"),
          name,
          season,
          activityOverrides,
          // The season's own note is stored text: it is written once and read
          // back by whoever opens the Scenario Lab, in their language.
          notes: storedText("audit.seasonCaptured", { count: year.activities.length }),
        });
      },
      "preset",
      storedText("audit.seasonSaved", { name }),
    );
  },

  removeSeasonalPreset: (presetId) => {
    commit(
      set,
      get,
      (snapshot) => {
        snapshot.seasonalPresets = snapshot.seasonalPresets.filter((item) => item.id !== presetId);
      },
      "delete",
      storedText("audit.seasonDeleted"),
      { presetId },
    );
  },

  applySeasonalPreset: (presetId) => {
    commit(
      set,
      get,
      (snapshot) => {
        const preset = snapshot.seasonalPresets.find((item) => item.id === presetId);
        if (!preset) return;
        snapshot.settings.selectedSeason = preset.season;
        const year = currentYear(snapshot);
        for (const activity of year.activities) {
          const patch = preset.activityOverrides[activity.id];
          if (patch) Object.assign(activity, patch);
        }
      },
      "preset",
      storedText("audit.seasonApplied"),
      { presetId },
    );
  },

  addScenarioPreset: (preset) => {
    commit(
      set,
      get,
      (snapshot) => {
        snapshot.scenarioPresets.push({ ...preset, id: id("scenario") } as ScenarioPreset);
      },
      "preset",
      storedText("audit.scenarioCreated", { name: preset.name }),
    );
  },

  updateScenarioPreset: (presetId, patch) => {
    commit(
      set,
      get,
      (snapshot) => {
        const preset = snapshot.scenarioPresets.find((item) => item.id === presetId);
        if (!preset) return;
        Object.assign(preset, patch);
      },
      "preset",
      storedText("audit.scenarioUpdated"),
      { presetId },
    );
  },

  duplicateScenarioPreset: (presetId) => {
    commit(
      set,
      get,
      (snapshot) => {
        const source = snapshot.scenarioPresets.find((item) => item.id === presetId);
        if (!source) return;
        const index = snapshot.scenarioPresets.indexOf(source);
        snapshot.scenarioPresets.splice(index + 1, 0, {
          ...source,
          id: id("scenario"),
          name: `${source.name} copy`,
          // Copied, not shared: mutating the original's caps through its clone
          // is exactly the kind of surprise a duplicate must not produce.
          categoryCaps: source.categoryCaps ? { ...source.categoryCaps } : undefined,
        });
      },
      "preset",
      storedText("audit.scenarioDuplicated"),
      { presetId },
    );
  },

  removeScenarioPreset: (presetId) => {
    commit(
      set,
      get,
      (snapshot) => {
        const index = snapshot.scenarioPresets.findIndex((item) => item.id === presetId);
        if (index !== -1) snapshot.scenarioPresets.splice(index, 1);
      },
      "preset",
      storedText("audit.scenarioDeleted"),
      { presetId },
    );
  },

  captureScenarioPreset: (name) => {
    commit(
      set,
      get,
      (snapshot) => {
        snapshot.scenarioPresets.push(scenarioFromCurrentState(snapshot, name, id("scenario")));
      },
      "preset",
      storedText("audit.scenarioCaptured", { name }),
    );
  },

  applyScenarioPreset: (presetId) => {
    commit(
      set,
      get,
      (snapshot) => {
        const preset = snapshot.scenarioPresets.find((item) => item.id === presetId);
        if (!preset) return;
        if (preset.monthlyBudget != null) snapshot.settings.monthlyBudget = preset.monthlyBudget;
        /*
         * `pilotIncludedInBudget` is deliberately not applied any more.
         *
         * It was the scenario system's one hard-coded assumption — that every
         * budget has a "Piloting" activity — and it has been replaced by the
         * per-activity states below, which say the same thing for any activity
         * and are shown in the preview. A legacy scenario keeps the stored
         * field so it round-trips, but applying a value the preview does not
         * list would change a setting the user was never shown.
         */
        for (const category of snapshot.categories) {
          const cap = preset.categoryCaps?.[category.id];
          if (cap != null) category.monthlyCap = cap;
        }
        // Per-activity: whether it runs, and who pays for it. Only activities
        // that still exist — a state naming a deleted one is inert rather than
        // an error.
        const record = snapshot.years[String(snapshot.settings.selectedYear)];
        for (const activity of record?.activities ?? []) {
          const state = preset.activityStates?.[activity.id];
          if (!state) continue;
          activity.active = state.enabled !== false;
          if (state.funding != null) activity.fundingSource = state.funding;
        }
      },
      "preset",
      storedText("audit.scenarioApplied"),
      { presetId },
    );
  },

  // Category management.
  //
  // Categories are shared, snapshot-level records rather than period-bound
  // ones, so they are editable regardless of the selected period. Two fields
  // are read live when reporting a period — `bucket` by calculateYear, and
  // `monthlyCap` by the analytics cap tracking — so changing either would
  // retroactively restate a closed period. Both are guarded below while a
  // historical period is selected, keeping Rule 3 (history is immutable)
  // intact without freezing harmless edits like renaming or recolouring.
  addCategory: (category) => {
    commit(
      set,
      get,
      (snapshot) => {
        const newCat = { ...category, id: id("cat") };
        snapshot.categories.push(newCat);
      },
      "settings",
      storedText("audit.categoryAdded"),
      category,
    );
  },

  updateCategory: (idValue, patch) => {
    const historical = !get().isCurrentPeriodMutable();
    commit(
      set,
      get,
      (snapshot) => {
        const cat = snapshot.categories.find((c) => c.id === idValue);
        if (!cat) return;
        const safePatch = { ...patch };
        if (historical) {
          // These two feed calculateYear directly, so changing them while
          // viewing history would rewrite that period's reported totals.
          delete safePatch.bucket;
          delete safePatch.monthlyCap;
        }
        if (safePatch.parentId != null && !isSafeParent(snapshot, idValue, safePatch.parentId)) {
          delete safePatch.parentId;
        }
        Object.assign(cat, safePatch);
      },
      "settings",
      storedText("audit.categoryUpdated"),
      { id: idValue, patch },
    );
  },

  archiveCategory: (idValue) => {
    commit(
      set,
      get,
      (snapshot) => {
        const cat = snapshot.categories.find((c) => c.id === idValue);
        if (cat) cat.archived = true;
      },
      "settings",
      storedText("audit.categoryArchived"),
      { id: idValue },
    );
  },

  reorderCategory: (sourceId, targetId) => {
    commit(
      set,
      get,
      (snapshot) => {
        const cats = snapshot.categories;
        const sourceIndex = cats.findIndex((c) => c.id === sourceId);
        const targetIndex = cats.findIndex((c) => c.id === targetId);
        if (sourceIndex < 0 || targetIndex < 0) return;
        const [source] = cats.splice(sourceIndex, 1);
        cats.splice(targetIndex, 0, source);
      },
      "settings",
      storedText("audit.categoriesReordered"),
      { sourceId, targetId },
    );
  },

  undo: () => {
    const { undoStack, redoStack, snapshot } = get();
    const previous = undoStack[0];
    if (!previous) return;
    // Restoring an older state still counts as a *new* revision so the
    // server accepts it instead of treating it as a stale write.
    const restored = { ...previous, revision: (snapshot.revision ?? 0) + 1 };
    set({
      snapshot: restored,
      undoStack: undoStack.slice(1),
      redoStack: [snapshot, ...redoStack].slice(0, 40),
    });
    persistSnapshot(restored, set, get);
  },

  redo: () => {
    const { undoStack, redoStack, snapshot } = get();
    const next = redoStack[0];
    if (!next) return;
    const restored = { ...next, revision: (snapshot.revision ?? 0) + 1 };
    set({
      snapshot: restored,
      undoStack: [snapshot, ...undoStack].slice(0, 40),
      redoStack: redoStack.slice(1),
    });
    persistSnapshot(restored, set, get);
  },
}));

function commit(
  set: (partial: Partial<BudgetStore>) => void,
  get: () => BudgetStore,
  recipe: (snapshot: BudgetSnapshot) => BudgetSnapshot | unknown,
  type: AuditType,
  summary: string,
  metadata?: Record<string, unknown> | unknown,
): void {
  const before = clone(get().snapshot);
  const next = clone(before);
  const replacement = recipe(next);
  const finalSnapshot = isBudgetSnapshot(replacement) ? replacement : next;
  finalSnapshot.revision = (before.revision ?? 0) + 1;

  // A change to period-bound data made while the historical override is active
  // is recorded as such, so the audit trail always shows when the past was
  // rewritten and which period was affected.
  const historicalEdit =
    PERIOD_BOUND_AUDIT_TYPES.has(type) &&
    get().historicalEditUnlocked &&
    isViewingHistoricalPeriod(before.settings);

  touch(finalSnapshot, type, summary, metadata, historicalEdit ? periodToken(before.settings) : null);
  set({
    snapshot: finalSnapshot,
    undoStack: [before, ...get().undoStack].slice(0, 40),
    redoStack: [],
  });
  persistSnapshot(finalSnapshot, set, get);
}

function touch(
  snapshot: BudgetSnapshot,
  type: AuditType,
  summary: string,
  metadata?: unknown,
  historicalPeriodLabel: string | null = null,
): void {
  const timestamp = new Date().toISOString();
  if (snapshot.settings.saveTimestampEnabled) {
    snapshot.settings.lastUpdated = timestamp;
  }
  const record = snapshot.years[String(snapshot.settings.selectedYear)];
  if (record) record.updatedAt = timestamp;

  const baseMetadata = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : undefined;

  snapshot.auditLog.unshift({
    id: id("audit"),
    type,
    /*
     * The summary is left exactly as written.
     *
     * It used to have "(historical edit · July 2026)" appended, which (a) put a
     * second English sentence inside a record the interface now translates, and
     * (b) would corrupt a `@key|name=value` sigil by appending text to its last
     * parameter. The same two facts are already on the record as
     * `historicalEdit` and `historicalPeriod`, and the History panel shows
     * both.
     */
    summary,
    createdAt: timestamp,
    historicalEdit: historicalPeriodLabel != null,
    historicalPeriod: historicalPeriodLabel ?? undefined,
    metadata: baseMetadata,
  });
  snapshot.auditLog = snapshot.auditLog.slice(0, 300);
}

function currentYear(snapshot: BudgetSnapshot): YearRecord {
  return ensureYearRecord(snapshot, snapshot.settings.selectedYear);
}

function ensureYearRecord(snapshot: BudgetSnapshot, year: number): YearRecord {
  const key = String(year);
  if (!snapshot.years[key]) {
    snapshot.years[key] = createNextYearRecord(snapshot, year);
  }
  return snapshot.years[key];
}

function nextOrder(activities: Activity[]): number {
  return activities.reduce((max, activity) => Math.max(max, activity.order), -1) + 1;
}

/**
 * Categories nest one level deep. A parent is only valid when it exists, is
 * not the category itself, and is not already a child — otherwise a pair of
 * categories can be made each other's parent, and any code walking the chain
 * loops forever.
 */
function isSafeParent(snapshot: BudgetSnapshot, categoryId: string, parentId: string): boolean {
  if (parentId === categoryId) return false;
  const parent = snapshot.categories.find((c) => c.id === parentId);
  if (!parent) return false;
  if (parent.parentId) return false;
  return true;
}

function normalizeWishlistPatch<T extends Partial<WishlistItem>>(item: T): T {
  const actualPrice = item.actualPrice ?? null;
  const effectiveValue = item.active && item.inWishlist && !item.bought && actualPrice != null ? actualPrice : 0;
  return { ...item, actualPrice, effectiveValue };
}

/**
 * Fields the database will not accept as null, guaranteed on the way in.
 *
 * `dateAdded` backs a NOT NULL column, and an item without one does not fail
 * by itself — it fails the whole snapshot write, which the interface then
 * reports as being offline. Both ends are defended: the server defaults it too.
 * This end is the one that keeps the value honest, because here we still know
 * whether the item is new.
 */
function withRequiredWishlistFields<T extends Partial<WishlistItem>>(item: T): T {
  return item.dateAdded ? item : { ...item, dateAdded: new Date().toISOString() };
}

/**
 * Wishlist ↔ spending link plumbing
 * ---------------------------------
 * Items and entries are looked up across every year record, not just the
 * selected one: a purchase can be dated into another year, and a link that
 * only half resolves is worse than no link at all.
 */

function findWishlistItemById(snapshot: BudgetSnapshot, itemId: string | undefined): WishlistItem | null {
  if (!itemId) return null;
  const selected = snapshot.years[String(snapshot.settings.selectedYear)]?.wishlistItems.find((item) => item.id === itemId);
  if (selected) return selected;
  for (const record of Object.values(snapshot.years)) {
    const found = record.wishlistItems.find((item) => item.id === itemId);
    if (found) return found;
  }
  return null;
}

function findSpendingEntryById(snapshot: BudgetSnapshot, entryId: string | undefined): SpendingEntry | null {
  if (!entryId) return null;
  for (const record of Object.values(snapshot.years)) {
    const found = record.spendingEntries.find((entry) => entry.id === entryId);
    if (found) return found;
  }
  return null;
}

function findWishlistItemBySpendingId(snapshot: BudgetSnapshot, entryId: string): WishlistItem | null {
  for (const record of Object.values(snapshot.years)) {
    const found = record.wishlistItems.find((item) => item.linkedSpendingId === entryId);
    if (found) return found;
  }
  return null;
}

/**
 * Remove every reference naming `itemId` or `spendingId`, on both sides.
 *
 * Run before establishing a new pair so re-linking cannot leave a second item
 * claiming the same transaction (or the reverse), which would double-count a
 * purchase in one place and orphan it in another.
 */
function clearWishlistLinks(snapshot: BudgetSnapshot, itemId?: string, spendingId?: string): void {
  if (!itemId && !spendingId) return;
  for (const record of Object.values(snapshot.years)) {
    for (const entry of record.spendingEntries) {
      const matchesItem = itemId != null && entry.wishlistItemId === itemId;
      const matchesEntry = spendingId != null && entry.id === spendingId;
      if (matchesItem || matchesEntry) entry.wishlistItemId = undefined;
    }
    for (const item of record.wishlistItems) {
      const matchesEntry = spendingId != null && item.linkedSpendingId === spendingId;
      const matchesItem = itemId != null && item.id === itemId;
      if (matchesEntry || matchesItem) item.linkedSpendingId = undefined;
    }
  }
}

/** Mark an item bought, keeping `effectiveValue` and `datePurchased` honest. */
function markWishlistBought(item: WishlistItem, spendingId: string | undefined, date: string | undefined): void {
  item.bought = true;
  item.linkedSpendingId = spendingId;
  item.datePurchased = purchaseTimestamp(date) ?? item.datePurchased ?? new Date().toISOString();
  // A bought item no longer competes for the budget, so its effective value
  // drops to 0 — the same rule the rest of the wishlist already applies.
  Object.assign(item, normalizeWishlistPatch(item));
}

const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDateInput(value: string | undefined): string | undefined {
  if (!value || !DATE_INPUT.test(value)) return undefined;
  return Number.isNaN(new Date(`${value}T12:00:00`).getTime()) ? undefined : value;
}

/**
 * Midday local time on the purchase date, so `toLocaleDateString()` shows the
 * day the user chose rather than drifting a day either side of UTC.
 */
function purchaseTimestamp(date: string | undefined): string | undefined {
  const normalized = normalizeDateInput(date);
  if (!normalized) return undefined;
  return new Date(`${normalized}T12:00:00`).toISOString();
}

function id(prefix: string): string {
  if ("crypto" in globalThis && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clone<T>(value: T): T {
  if ("structuredClone" in globalThis) return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function isBudgetSnapshot(value: unknown): value is BudgetSnapshot {
  return Boolean(value && typeof value === "object" && "version" in value && "settings" in value);
}


function normalizeSnapshot(snapshot: BudgetSnapshot): BudgetSnapshot {
  // Matched on the seed key, not the id: ids are now generated per budget, so
  // an id comparison would find nothing and re-add all ten defaults on every
  // load. The id fallback covers budgets written before seed keys existed,
  // whose rows still carry the key value as their id.
  const presentKeys = new Set(
    snapshot.categories.flatMap((category) => [category.seedKey, category.id].filter(Boolean) as string[]),
  );
  const missingCategories: BudgetCategory[] = defaultCategories
    .filter((template) => !presentKeys.has(template.seedKey))
    .map((template) => ({
      id: id("cat"),
      seedKey: template.seedKey,
      name: template.name,
      bucket: template.bucket,
      color: template.color,
    }));
  if (missingCategories.length > 0) {
    snapshot.categories = [...snapshot.categories, ...missingCategories];
  }
  snapshot.budgetApprovals ??= [];
  snapshot.revision ??= 0;
  snapshot.settings.selectedPeriodMode ??= "month";
  snapshot.settings.selectedWeekYear ??= snapshot.settings.selectedYear;
  return snapshot;
}

/**
 * Persistence model
 * -----------------
 * The server is authoritative whenever it is reachable. IndexedDB is an
 * explicit offline cache, never a silent equal: if a write cannot reach the
 * server the store reports `offline`, so the UI can say "saved on this device
 * only" instead of implying the change is safe everywhere.
 *
 * Writes use a compare-and-swap on `baseRevision` (the revision this client
 * last read from the server), and the server assigns the next revision. That
 * is what makes two devices safe: a client that edited while offline holds a
 * stale base, so its write is rejected rather than overwriting the other
 * device's work.
 */

/** Serialises saves so two rapid commits cannot race each other to the server. */
let saveChain: Promise<unknown> = Promise.resolve();

function persistSnapshot(
  snapshot: BudgetSnapshot,
  set: (partial: Partial<BudgetStore>) => void,
  get: () => BudgetStore,
): void {
  set({ syncState: "saving" });

  saveChain = saveChain
    .catch(() => undefined)
    .then(async () => {
      // The local cache is written first so an interrupted session keeps the
      // change even if the network call never returns.
      await saveIdbSnapshot(snapshot).catch((error) => {
        console.error("Failed to write the local cache:", error);
      });

      const apiClient = getApiClient();
      try {
        const assigned = await apiClient.saveSnapshot(snapshot, get().baseRevision);
        set({
          baseRevision: assigned ?? get().baseRevision,
          syncState: "saved",
          lastSyncedAt: new Date().toISOString(),
          pendingLocalChanges: false,
          syncError: null,
        });
        if (assigned != null) {
          // Keep the in-memory revision aligned with what the server stored.
          const current = get().snapshot;
          if (current === snapshot) set({ snapshot: { ...current, revision: assigned } });
        }
      } catch (error) {
        if (error instanceof SnapshotConflictError) {
          if (error.serverSnapshot) {
            const server = normalizeSnapshot(error.serverSnapshot);
            set({
              snapshot: server,
              undoStack: [],
              redoStack: [],
              baseRevision: error.serverRevision ?? server.revision ?? null,
              syncState: "conflict",
              pendingLocalChanges: false,
              syncNotice: storedText("sync.conflictReloaded"),
            });
            await saveIdbSnapshot(server).catch(() => undefined);
          } else {
            set({ syncState: "conflict", syncNotice: storedText("sync.outOfDate") });
          }
          return;
        }

        // The session ended between opening the page and saving. Report it as
        // such: "error" alone would leave the user retrying a write that can
        // never succeed.
        if (error instanceof AuthRequiredError) {
          useAuthStore.getState().handleSessionExpired();
          set({ syncState: "error", pendingLocalChanges: true, syncError: null });
          return;
        }

        if (error instanceof ApiUnavailableError) {
          // Explicitly NOT "saved": the change exists only on this device.
          set({
            syncState: "offline",
            pendingLocalChanges: true,
            syncError: storedText("sync.offlineOnly"),
          });
          return;
        }

        set({
          syncState: "error",
          pendingLocalChanges: true,
          syncError: error instanceof Error ? error.message : storedText("sync.saveFailed"),
        });
      }
    });
}

/**
 * Pull the server snapshot when it is newer than what this device holds.
 * Called on load, on window focus, and on explicit retry, so a change made on
 * another device appears without the user hunting for a refresh button.
 *
 * Unsynced local edits are never discarded silently: with pending changes the
 * server copy is not adopted, and the user is told the two have diverged.
 */
async function syncFromServer(
  set: (partial: Partial<BudgetStore>) => void,
  get: () => BudgetStore,
  options: { force?: boolean } = {},
): Promise<void> {
  const apiClient = getApiClient();
  try {
    const remoteRevision = await apiClient.loadRevision();
    const base = get().baseRevision;

    if (remoteRevision == null) {
      set({ syncState: get().pendingLocalChanges ? "offline" : "saved", syncError: null });
      return;
    }
    if (!options.force && base != null && remoteRevision === base) {
      set({ syncState: get().pendingLocalChanges ? "offline" : "saved", syncError: null });
      return;
    }

    if (get().pendingLocalChanges && !options.force) {
      set({
        syncState: "conflict",
        syncNotice:
          storedText("sync.divergedRetry"),
      });
      return;
    }

    const remote = await apiClient.loadSnapshot();
    if (!remote) return;
    set({
      snapshot: normalizeSnapshot(remote),
      baseRevision: remote.revision ?? remoteRevision,
      syncState: "saved",
      lastSyncedAt: new Date().toISOString(),
      pendingLocalChanges: false,
      syncError: null,
      undoStack: [],
      redoStack: [],
    });
    await saveIdbSnapshot(remote).catch(() => undefined);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      useAuthStore.getState().handleSessionExpired();
      set({ syncState: "error", syncError: null });
      return;
    }
    if (error instanceof ApiUnavailableError) {
      set({
        syncState: "offline",
        syncError: storedText("sync.offlineLocal"),
      });
      return;
    }
    set({ syncState: "error", syncError: error instanceof Error ? error.message : storedText("sync.failed") });
  }
}


/*
 * The live store, published for the browser harness — development only.
 *
 * The harness reaches into the store with a dynamic `import()`, and after an
 * HMR update Vite serves the same module under a `?t=` URL: the import then
 * returns a second, empty copy, and every check that reads it reports that
 * nothing was ever stored. The guard for that used to *infer* the problem from
 * `hydrated` being false — which is also true while hydration is simply still
 * in flight, so a slow backend and a duplicated module were indistinguishable.
 * Diagnosing the difference cost an hour.
 *
 * This makes it exact: the application publishes the instance it is actually
 * using, and the harness compares object identity. `import.meta.env.DEV` keeps
 * it out of the production bundle entirely.
 */
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__budgetStoreInstance = useBudgetStore;
}
