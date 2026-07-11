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
} from "../domain/types";
import { createSeedBudgetSnapshot } from "../data/seedBudget";
import { defaultCategories } from "../data/seedBudget";
import { deleteSnapshot, loadSnapshot, saveSnapshot } from "../storage/idb";

type ActivityInput = Omit<Activity, "id" | "order"> & Partial<Pick<Activity, "id" | "order">>;
type SpendingInput = Omit<SpendingEntry, "id" | "createdAt" | "updatedAt"> & Partial<Pick<SpendingEntry, "id">>;
type WalletInput = Omit<WalletEntry, "id" | "createdAt"> & Partial<Pick<WalletEntry, "id">>;
type WishlistInput = Omit<WishlistItem, "id" | "dateAdded"> & Partial<Pick<WishlistItem, "id" | "dateAdded">>;

interface BudgetStore {
  snapshot: BudgetSnapshot;
  hydrated: boolean;
  undoStack: BudgetSnapshot[];
  redoStack: BudgetSnapshot[];
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
    const timestamp = new Date().toISOString();
    commit(
      set,
      get,
      (snapshot) => {
        currentYear(snapshot).spendingEntries.push({
          ...entry,
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
    commit(
      set,
      get,
      (snapshot) => {
        const entry = currentYear(snapshot).spendingEntries.find((item) => item.id === idValue);
        if (!entry) return;
        Object.assign(entry, patch);
        if (patch.date) {
          entry.month = monthFromDateInput(patch.date);
          entry.week = weekFromDateInput(patch.date);
        }
        entry.updatedAt = new Date().toISOString();
      },
      "spending",
      "Updated spending entry.",
      { id: idValue, patch },
    );
  },

  removeSpendingEntry: (idValue) => {
    commit(
      set,
      get,
      (snapshot) => {
        const year = currentYear(snapshot);
        year.spendingEntries = year.spendingEntries.filter((item) => item.id !== idValue);
      },
      "delete",
      "Deleted spending entry.",
      { id: idValue },
    );
  },

  addWishlistItem: (item) => {
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
        snapshot.budgetApprovals = snapshot.budgetApprovals.slice(0, 120);
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

  // Category management
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
    commit(
      set,
      get,
      (snapshot) => {
        const cat = snapshot.categories.find((c) => c.id === idValue);
        if (cat) Object.assign(cat, patch);
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
    set({
      snapshot: previous,
      undoStack: undoStack.slice(1),
      redoStack: [snapshot, ...redoStack].slice(0, 40),
    });
    void saveSnapshot(previous).catch(() => undefined);
  },

  redo: () => {
    const { undoStack, redoStack, snapshot } = get();
    const next = redoStack[0];
    if (!next) return;
    set({
      snapshot: next,
      undoStack: [snapshot, ...undoStack].slice(0, 40),
      redoStack: redoStack.slice(1),
    });
    void saveSnapshot(next).catch(() => undefined);
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
  touch(finalSnapshot, type, summary, metadata);
  set({
    snapshot: finalSnapshot,
    undoStack: [before, ...get().undoStack].slice(0, 40),
    redoStack: [],
  });
  void saveSnapshot(finalSnapshot).catch(() => undefined);
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
  const key = String(snapshot.settings.selectedYear);
  if (!snapshot.years[key]) {
    snapshot.years[key] = createNextYearRecord(snapshot, snapshot.settings.selectedYear);
  }
  return snapshot.years[key];
}

function nextOrder(activities: Activity[]): number {
  return activities.reduce((max, activity) => Math.max(max, activity.order), -1) + 1;
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
  return snapshot;
}
