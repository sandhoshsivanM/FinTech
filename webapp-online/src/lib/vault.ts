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

export type Session = { refreshToken: string; userId: string; deviceId: string };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
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

/** Sign-out: forget the session and every key on this device. */
export const clearAll = () => run('readwrite', (s) => s.clear());
