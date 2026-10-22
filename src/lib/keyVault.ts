import { loadSigningKey, createSigningKey, type KeyMaterial } from "@verifact/core";

const DB = "verifact-vault";
const STORE = "keys";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB unavailable"));
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

/**
 * Loads a named demo key from this browser's IndexedDB or creates it. Only used in local demo mode
 * (the server keeps real keys on disk); falls back to a session-only key when storage is unavailable.
 */
export async function loadOrCreateLocalKey(id: "issuer"): Promise<KeyMaterial & { persistent: boolean }> {
  try {
    const db = await open();
    const stored = (await tx(db, "readonly", (s) => s.get(id))) as JsonWebKey | undefined;
    if (stored) return { ...(await loadSigningKey(stored)), persistent: true };
    const created = await createSigningKey();
    await tx(db, "readwrite", (s) => s.put(created.privateKeyJwk, id));
    return { ...created.material, persistent: true };
  } catch {
    return { ...(await createSigningKey()).material, persistent: false };
  }
}

export async function resetLocalKeys(): Promise<void> {
  const db = await open();
  await tx(db, "readwrite", (s) => s.clear());
}
