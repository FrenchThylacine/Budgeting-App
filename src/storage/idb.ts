import type { BudgetSnapshot } from "../domain/types";

const DB_NAME = "premium-budget-os";
const STORE_NAME = "snapshots";
const DB_VERSION = 1;

/**
 * The offline cache is keyed per account.
 *
 * It used to be a single slot called "active". With accounts, that slot is a
 * leak: sign out, sign in as someone else, lose the network for a moment, and
 * the app would hydrate the previous person's budget from this device's cache
 * and present it as the current account's. Everything downstream — totals,
 * charts, and the next save — would then be built on it.
 *
 * The key is derived from the account id, so two accounts on one device cannot
 * see each other's cache, and a signed-out app addresses no slot at all.
 */
let activeKey: string | null = null;

/** Point the cache at an account. Pass null when signed out. */
export function setCacheOwner(userId: string | null): void {
  activeKey = userId ? `user:${userId}` : null;
}


/**
 * Thrown when the cache is used before an owner is set.
 *
 * Deliberately loud. Silently falling back to a shared key is how the leak
 * above happened in the first place.
 */
export class NoCacheOwnerError extends Error {
  constructor() {
    super("The offline cache has no account. Sign in before reading or writing it.");
    this.name = "NoCacheOwnerError";
  }
}

function requireKey(): string {
  if (!activeKey) throw new NoCacheOwnerError();
  return activeKey;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function loadSnapshot(): Promise<BudgetSnapshot | null> {
  const key = requireKey();
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as BudgetSnapshot | undefined) ?? null);
    tx.oncomplete = () => database.close();
  });
}

export async function saveSnapshot(snapshot: BudgetSnapshot): Promise<void> {
  const key = requireKey();
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(snapshot, key);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => {
      database.close();
      resolve();
    };
  });
}

export async function deleteSnapshot(): Promise<void> {
  const key = requireKey();
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => {
      database.close();
      resolve();
    };
  });
}

/**
 * Remove every cached budget on this device.
 *
 * Called on sign-out. Deleting only the current account's slot would leave
 * earlier accounts' budgets sitting on a device the owner may be handing back,
 * lending, or selling.
 */
export async function clearAllCachedSnapshots(): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readwrite");
    const request = tx.objectStore(STORE_NAME).clear();
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => {
      database.close();
      resolve();
    };
  });
}
