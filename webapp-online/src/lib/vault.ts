// Khazana Online's own browser storage. It is a different database from the
// offline app's (`fintech_os`) on a different origin, and nothing here ever
// reads or writes the offline app's data (ADR 0007).
//
// The device key is stored as a CryptoKey object: IndexedDB keeps it
// non-extractable, so the private half never exists as bytes in this origin.
// The refresh token is stored too: the server only honours it with a proof
// from this same key (RefreshTokenRules checks cnf.jkt), so copying it out is
// useless without the key. The access token lives in memory only.
import type { DeviceKey } from './dpop';

export const DB_NAME = 'khazana_online';
const STORE = 'device';
// Version 2 adds the synced records (encrypted, exactly as the server has
// them), the outbox of changes not yet pushed, and the sync cursor.
const STORES = [STORE, 'records', 'outbox', 'meta'] as const;
type StoreName = (typeof STORES)[number];

export type Session = { refreshToken: string; userId: string; deviceId: string };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      for (const name of STORES) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>, name: StoreName = STORE): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(name, mode);
      const request = work(tx.objectStore(name));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Several stores in ONE transaction on ONE connection. `run` opens the database
 * per call, which is fine for a single write but turns an import of 1,100 rows
 * into 1,100 opens; a batch goes through here instead, and is atomic (all of it
 * is stored or none).
 */
async function runBatch(names: StoreName[], work: (stores: Record<string, IDBObjectStore>) => void): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(names, 'readwrite');
      const stores: Record<string, IDBObjectStore> = {};
      for (const n of names) stores[n] = tx.objectStore(n);
      work(stores);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const loadKey = () => run<DeviceKey | undefined>('readonly', (s) => s.get('key'));
export const saveKey = (key: DeviceKey) => run('readwrite', (s) => s.put(key, 'key'));
export const loadSession = () => run<Session | undefined>('readonly', (s) => s.get('session'));
export const saveSession = (session: Session) => run('readwrite', (s) => s.put(session, 'session'));
export const clearSession = () => run('readwrite', (s) => s.delete('session'));

// --- end-to-end keys (ADR 0005) ---------------------------------------------
//
// The device's X25519 key opens the account's data key (DEK) from this device's
// envelope. Its private half is stored encrypted under a separate AES-GCM key
// that IndexedDB holds as a non-extractable CryptoKey: the bytes on disk are
// useless without this origin's own key object, and are only decrypted in
// memory when the app unlocks. The envelope (the DEK sealed to this device)
// is kept too, so the app unlocks without a round trip.

export type StoredDeviceKeys = { publicKey: Uint8Array; wrappedPrivate: Uint8Array; iv: Uint8Array };
export type StoredEnvelope = { wrappedDek: Uint8Array; keyVersion: number };

export const loadDeviceKeys = () => run<StoredDeviceKeys | undefined>('readonly', (s) => s.get('x25519'));
export const saveDeviceKeys = (k: StoredDeviceKeys) => run('readwrite', (s) => s.put(k, 'x25519'));
export const loadWrapKey = () => run<CryptoKey | undefined>('readonly', (s) => s.get('x25519-wrap'));
export const saveWrapKey = (k: CryptoKey) => run('readwrite', (s) => s.put(k, 'x25519-wrap'));
export const loadEnvelope = () => run<StoredEnvelope | undefined>('readonly', (s) => s.get('envelope'));
export const saveEnvelope = (e: StoredEnvelope) => run('readwrite', (s) => s.put(e, 'envelope'));

/** Sign-out: forget the session, every key and every synced record on this device. */
export async function clearAll(): Promise<void> {
  for (const name of STORES) await run('readwrite', (s) => s.clear(), name);
}

// --- synced records (ADR 0006) ----------------------------------------------

/** A record as stored and synced: ciphertext only, never the decrypted value. */
export type LocalRecord = {
  collection: string;
  recordId: string;
  updatedAt: string;
  deleted: boolean;
  ciphertext: Uint8Array | null;
  keyVersion: number;
};
export type Cursor = { since: number; epoch: number };

const keyOf = (r: Pick<LocalRecord, 'collection' | 'recordId'>) => `${r.collection}/${r.recordId}`;

export const records = {
  all: () => run<LocalRecord[]>('readonly', (s) => s.getAll(), 'records'),
  get: (r: Pick<LocalRecord, 'collection' | 'recordId'>) => run<LocalRecord | undefined>('readonly', (s) => s.get(keyOf(r)), 'records'),
  put: (r: LocalRecord) => run('readwrite', (s) => s.put(r, keyOf(r)), 'records'),
  /** Many records, one transaction. */
  putMany: (rs: LocalRecord[]) => (rs.length === 0 ? Promise.resolve() : runBatch(['records'], ({ records }) => { for (const r of rs) records.put(r, keyOf(r)); })),
  /** Local changes: stored and queued for the server together, in one transaction. */
  saveMany: (rs: LocalRecord[]) => (rs.length === 0 ? Promise.resolve() : runBatch(['records', 'outbox'], ({ records, outbox }) => {
    for (const r of rs) { records.put(r, keyOf(r)); outbox.put(r, keyOf(r)); }
  })),
  clear: () => run('readwrite', (s) => s.clear(), 'records'),
  outbox: () => run<LocalRecord[]>('readonly', (s) => s.getAll(), 'outbox'),
  queue: (r: LocalRecord) => run('readwrite', (s) => s.put(r, keyOf(r)), 'outbox'),
  unqueue: (r: LocalRecord) => run('readwrite', (s) => s.delete(keyOf(r)), 'outbox'),
  unqueueMany: (rs: LocalRecord[]) => (rs.length === 0 ? Promise.resolve() : runBatch(['outbox'], ({ outbox }) => { for (const r of rs) outbox.delete(keyOf(r)); })),
  cursor: async (): Promise<Cursor> => (await run<Cursor | undefined>('readonly', (s) => s.get('cursor'), 'meta')) ?? { since: 0, epoch: 0 },
  setCursor: (c: Cursor) => run('readwrite', (s) => s.put(c, 'cursor'), 'meta'),
};
export type RecordStore = typeof records;
