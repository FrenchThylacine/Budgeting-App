import { create } from "zustand";
import { calculateRolloverDelta, createNextYearRecord } from "../domain/calculations";
import { monthFromDateInput, weekFromDateInput } from "../domain/dates";
import type {
  Activity,
  AuditType,
  BudgetApproval,
  BudgetSnapshot,
  CurrencyCode,
  MonthCloseRecord,
  Settings,
  SpendingEntry,
  WalletEntry,
  WishlistItem,
  YearRecord,
  BudgetCategory,
} from "../domain/types";
import { createSeedBudgetSnapshot } from "../data/seedBudget";
import { defaultCategories } from "../data/seedBudget";
import { deleteSnapshot as deleteIdbSnapshot, loadSnapshot as loadIdbSnapshot, saveSnapshot as saveIdbSnapshot } from "../storage/idb";
import { getApiClient, SnapshotConflictError } from "../api/client";
import { isViewingHistoricalPeriod } from "../utils/formatters";

type ActivityInput = Omit<Activity, "id" | "order"> & Partial<Pick<Activity, "id" | "order">>;
type SpendingInput = Omit<SpendingEntry, "id" | "createdAt" | "updatedAt"> & Partial<Pick<SpendingEntry, "id">>;
type WalletInput = Omit<WalletEntry, "id" | "createdAt"> & Partial<Pick<WalletEntry, "id">>;
type WishlistInput = Omit<WishlistItem, "id" | "dateAdded"> & Partial<Pick<WishlistItem, "id" | "dateAdded">>;

interface BudgetStore {
  snapshot: BudgetSnapshot;
  hydrated: boolean;
  undoStack: BudgetSnapshot[];
  redoStack: BudgetSnapshot[];
  /** User-facing message about cross-device sync (e.g. a rejected stale write). */
  syncNotice: string | null;
  clearSyncNotice: () => void;
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
  addWalletEntry: (entry: WalletInput) => void;
  updateWalletEntry: (id: string, patch: Partial<WalletEntry>) => void;
  removeWalletEntry: (id: string) => void;
  closeMonth: (year: number, month: number, applyRollover: boolean) => void;
  recordBudgetApproval: (approval: Omit<BudgetApproval, "id" | "createdAt" | "decidedAt">) => void;
  applySeasonalPreset: (presetId: string) => void;
  applyScenarioPreset: (presetId: string) => void;
  undo: () => void;
  redo: () => void;
  // Category management
  addCategory: (category: Omit<BudgetCategory, "id">) => void;
  updateCategory: (id: string, patch: Partial<BudgetCategory>) => void;
  archiveCategory: (id: string) => void;
  reorderCategory: (sourceId: string, targetId: string) => void;
}

export const useBudgetStore = create<BudgetStore>((set, get) => ({
  snapshot: createSeedBudgetSnapshot(),
  hydrated: false,
  undoStack: [],
  redoStack: [],
  syncNotice: null,
  clearSyncNotice: () => set({ syncNotice: null }),
  isCurrentPeriodMutable: () => !isViewingHistoricalPeriod(get().snapshot.settings),

  hydrate: async () => {
    try {
      const loaded = await loadSnapshot();
      set({ snapshot: normalizeSnapshot(loaded ?? createSeedBudgetSnapshot()), hydrated: true });
    } catch {
      set({ snapshot: normalizeSnapshot(createSeedBudgetSnapshot()), hydrated: true });
    }
  },

  resetToSeed: async () => {
    const next = createSeedBudgetSnapshot();
    await deleteSnapshot().catch(() => undefined);
    await saveSnapshot(next).catch(() => undefined);
    set({ snapshot: next, undoStack: [], redoStack: [], hydrated: true });
  },

  importSnapshot: (snapshot, summary = "Imported budget data.") => {
    commit(set, get, () => normalizeSnapshot(snapshot), "import", summary);
  },

  updateSettings: (patch) => {
    commit(
      set,
      get,
      (snapshot) => {
        snapshot.settings = { ...snapshot.settings, ...patch };
      },
      "settings",
      "Updated settings.",
      patch,
    );
  },

  selectYear: (year) => {
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
      `Switched to ${year}.`,
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
      `Added activity ${activity.name}.`,
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
      "Updated activity.",
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
      "Deleted activity.",
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
      "Duplicated activity.",
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
      "Reordered activities.",
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
      "Drag-reordered activities.",
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
      "Added spending entry.",
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
      "Updated spending entry.",
      { id: idValue, patch },
    );
  },

  removeSpendingEntry: (idValue) => {
    if (!get().isCurrentPeriodMutable()) return;
    commit(
      set,
      get,
      (snapshot) => {
        for (const year of Object.values(snapshot.years)) {
          year.spendingEntries = year.spendingEntries.filter((item) => item.id !== idValue);
        }
      },
      "delete",
      "Deleted spending entry.",
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
          ...normalizeWishlistPatch(item),
          id: item.id ?? id("wish"),
          dateAdded: item.dateAdded ?? new Date().toISOString(),
        });
      },
      "wishlist",
      `Added wishlist item ${item.name}.`,
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
        Object.assign(item, normalizeWishlistPatch(item));
      },
      "wishlist",
      "Updated wishlist item.",
      { id: idValue, patch },
    );
  },

  removeWishlistItem: (idValue) => {
    if (!get().isCurrentPeriodMutable()) return;
    commit(
      set,
      get,
      (snapshot) => {
        const year = currentYear(snapshot);
        year.wishlistItems = year.wishlistItems.filter((item) => item.id !== idValue);
      },
      "delete",
      "Deleted wishlist item.",
      { id: idValue },
    );
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
      "Added wallet entry.",
      entry,
    );
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
      "Updated wallet entry.",
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
      "Deleted wallet entry.",
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
            note: "Closed period has no value, so the NaN policy blocks automatic rollover.",
          };
        } else if (applyRollover) {
          const walletEntryId = id("wallet-rollover");
          record.walletEntries.push({
            id: walletEntryId,
            year,
            month,
            amount: delta,
            currency: snapshot.settings.baseCurrency,
            source: "Month-end rollover",
            type: "rollover",
            note: delta < 0 ? "Negative delta reduced wallet." : "Positive delta added to wallet.",
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
            note: delta < 0 ? "Confirmed negative rollover." : "Confirmed positive rollover.",
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
            note: "Month closed without wallet rollover.",
          };
        }
        record.closedMonths.push(closeRecord);
      },
      "rollover",
      applyRollover ? "Closed month with rollover." : "Closed month without rollover.",
      { year, month, applyRollover },
    );
  },

  recordBudgetApproval: (approval) => {
    if (!get().isCurrentPeriodMutable()) return;
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
      approval.status === "approved" ? "Approved suggested monthly budget." : "Rejected suggested monthly budget.",
      approval,
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
      "Applied seasonal preset.",
      { presetId },
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
        if (preset.pilotIncludedInBudget != null) snapshot.settings.pilotIncludedInBudget = preset.pilotIncludedInBudget;
        for (const category of snapshot.categories) {
          const cap = preset.categoryCaps?.[category.id];
          if (cap != null) category.monthlyCap = cap;
        }
      },
      "preset",
      "Applied scenario preset.",
      { presetId },
    );
  },

  // Category management.
  //
  // Categories are shared, snapshot-level records rather than period-bound
  // ones, so they are editable regardless of the selected period. The fields
  // that *would* retroactively rewrite historical figures — `bucket` and
  // `monthlyCap`, which calculations read live — are guarded below while a
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
      "Added category.",
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
      "Updated category.",
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
      "Archived category.",
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
      "Reordered categories.",
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
    persistSnapshot(restored, set);
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
    persistSnapshot(restored, set);
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
  touch(finalSnapshot, type, summary, metadata);
  set({
    snapshot: finalSnapshot,
    undoStack: [before, ...get().undoStack].slice(0, 40),
    redoStack: [],
  });
  persistSnapshot(finalSnapshot, set);
}

function touch(snapshot: BudgetSnapshot, type: AuditType, summary: string, metadata?: unknown): void {
  const timestamp = new Date().toISOString();
  if (snapshot.settings.saveTimestampEnabled) {
    snapshot.settings.lastUpdated = timestamp;
  }
  const record = snapshot.years[String(snapshot.settings.selectedYear)];
  if (record) record.updatedAt = timestamp;
  snapshot.auditLog.unshift({
    id: id("audit"),
    type,
    summary,
    createdAt: timestamp,
    metadata: metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : undefined,
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

export function currenciesForStore(): CurrencyCode[] {
  return ["EUR", "USD", "LBP", "GBP", "CAD", "AUD", "JPY", "TRY", "SAR", "AED"];
}

function normalizeSnapshot(snapshot: BudgetSnapshot): BudgetSnapshot {
  const existingCategories = new Set(snapshot.categories.map((category) => category.id));
  const missingCategories = defaultCategories.filter((category) => !existingCategories.has(category.id));
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
 * Load snapshot from API or fallback to IndexedDB
 */
async function loadSnapshot(): Promise<BudgetSnapshot | null> {
  const apiClient = getApiClient();
  try {
    // Try API first
    const apiSnapshot = await apiClient.loadSnapshot();
    if (apiSnapshot) return apiSnapshot;
  } catch (error) {
    console.warn("API load failed, falling back to IndexedDB:", error);
  }
  // Fallback to IndexedDB
  return loadIdbSnapshot();
}

/**
 * Save snapshot to API and IndexedDB (for offline capability)
 */
async function saveSnapshot(snapshot: BudgetSnapshot): Promise<void> {
  const apiClient = getApiClient();
  try {
    // Try saving to API
    await apiClient.saveSnapshot(snapshot);
  } catch (error) {
    if (error instanceof SnapshotConflictError) throw error;
    console.warn("API save failed, falling back to IndexedDB:", error);
  }
  // Also save to IndexedDB for offline capability
  try {
    await saveIdbSnapshot(snapshot);
  } catch (error) {
    console.error("Failed to save snapshot:", error);
  }
}

/**
 * Persist a committed snapshot in the background. When the server rejects the
 * write as stale (another device saved a newer revision first), adopt the
 * server snapshot so newer remote data is never overwritten by this device.
 */
function persistSnapshot(
  snapshot: BudgetSnapshot,
  set: (partial: Partial<BudgetStore>) => void,
): void {
  void saveSnapshot(snapshot).catch(async (error: unknown) => {
    if (error instanceof SnapshotConflictError && error.serverSnapshot) {
      const server = normalizeSnapshot(error.serverSnapshot);
      set({
        snapshot: server,
        undoStack: [],
        redoStack: [],
        syncNotice: "This device had outdated data. The latest version from your other device was loaded; please re-apply your last change.",
      });
      await saveIdbSnapshot(server).catch(() => undefined);
    }
  });
}

/**
 * Delete snapshot from API and IndexedDB
 */
async function deleteSnapshot(): Promise<void> {
  const apiClient = getApiClient();
  try {
    // Note: API doesn't have a delete endpoint yet; it would reset server-side
    // For now, just delete locally
    await deleteIdbSnapshot();
  } catch (error) {
    console.error("Failed to delete snapshot:", error);
  }
}
