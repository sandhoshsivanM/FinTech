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
