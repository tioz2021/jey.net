/** Persistent chat identity storage. The private key never leaves IndexedDB. */
import type { ChatIdentity } from "./chat-crypto";

const DB_NAME = "jey-chat";
const DB_VERSION = 1;
const STORE = "identity";
const KEY = "current";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
  });
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
    tx.oncomplete = () => database.close();
  });
}

export async function loadIdentity(): Promise<ChatIdentity | null> {
  try {
    const value = await transaction<ChatIdentity | undefined>("readonly", (store) => store.get(KEY));
    return value ?? null;
  } catch {
    return null;
  }
}

export async function saveIdentity(identity: ChatIdentity): Promise<void> {
  await transaction("readwrite", (store) => store.put(identity, KEY));
}

export async function clearIdentity(): Promise<void> {
  await transaction("readwrite", (store) => store.delete(KEY));
}
