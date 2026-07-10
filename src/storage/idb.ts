import type { BudgetSnapshot } from "../domain/types";

const DB_NAME = "premium-budget-os";
const STORE_NAME = "snapshots";
const SNAPSHOT_KEY = "active";
const DB_VERSION = 1;

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
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(SNAPSHOT_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as BudgetSnapshot | undefined) ?? null);
    tx.oncomplete = () => database.close();
  });
}

export async function saveSnapshot(snapshot: BudgetSnapshot): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(snapshot, SNAPSHOT_KEY);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => {
      database.close();
      resolve();
    };
  });
}

export async function deleteSnapshot(): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(SNAPSHOT_KEY);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => {
      database.close();
      resolve();
    };
  });
}
