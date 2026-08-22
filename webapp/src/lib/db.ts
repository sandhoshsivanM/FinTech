// Encrypted local store (IndexedDB via Dexie). Every record's value is
// AES-GCM encrypted at rest; only id/vaultId/type keys are plaintext (for
// indexing). Reads decrypt with the in-memory session key. No server, ever.
import Dexie, { type Table } from 'dexie';
import { type Encrypted } from './crypto';

export interface EncRecord {
  id: string; // `${type}:${uuid}`
  type: string; // 'txn' | 'category' | 'budget' | ...
  vaultId: string;
  enc: Encrypted;
}

export interface VaultMeta {
  vaultId: string;
  name: string;
  saltB64: string;
  verifier: Encrypted; // encrypts a known token to validate the PIN
  schemaVersion?: number; // data-shape version; drives forward migrations
}

/// Soft-delete marker for sync (records what was deleted, and when).
export interface Tombstone {
  key: string; // `${type}:${id}`
  type: string;
  recId: string; // the entity id
  vaultId: string;
  deletedAt: number; // epoch ms
}

class KhazanaDB extends Dexie {
  records!: Table<EncRecord, string>;
  vaults!: Table<VaultMeta, string>;
  tombstones!: Table<Tombstone, string>;

  constructor() {
    // FROZEN: the IndexedDB database name stays `fintech_os` despite the rebrand.
    // Renaming it would orphan every existing vault — the encrypted records,
    // salt and verifier would still be on disk but invisible, dropping users
    // onto the first-run "Set up your vault" screen. Class name only was renamed.
    super('fintech_os');
    this.version(1).stores({
      records: 'id, [type+vaultId], vaultId',
      vaults: 'vaultId',
    });
    // v2: tombstones for cross-device sync (soft-delete tracking).
    this.version(2).stores({
      tombstones: 'key, vaultId',
    });
  }
}

export const db = new KhazanaDB();

/** What the browser will tell us about the durability of this vault. */
export type PersistenceState =
  | 'persisted' // the browser has promised not to evict us
  | 'denied' // it declined; data is evictable
  | 'unsupported'; // no Storage API — assume evictable

/**
 * Asks the browser to mark this origin's storage as persistent.
 *
 * This matters more here than in almost any other app. There is no server, so
 * IndexedDB is not a cache of the truth — it *is* the truth. Browsers treat
 * ordinary origin storage as disposable and clear it under storage pressure;
 * Safari is the sharp case, evicting script-writable storage for sites the user
 * has not installed after roughly seven days of no visits. A user who tracked
 * their finances for a month, went on holiday, and came back to an empty vault
 * would be entirely right to call that data loss, and would have no way to know
 * it was coming.
 *
 * Chrome and Firefox grant this silently based on engagement heuristics
 * (bookmarked, installed, notification permission). Safari grants it on
 * install. It can legitimately be refused, which is why the result is surfaced
 * in Settings rather than swallowed: the honest thing is to tell the user their
 * only copy is evictable and that they should keep an exported backup.
 *
 * Idempotent — `persist()` returns the existing answer once granted.
 */
export async function requestPersistence(): Promise<PersistenceState> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
      return 'unsupported';
    }
    if (await navigator.storage.persisted()) return 'persisted';
    return (await navigator.storage.persist()) ? 'persisted' : 'denied';
  } catch {
    // Some privacy modes throw rather than returning false.
    return 'unsupported';
  }
}

/** Reads the current state without prompting for an upgrade. */
export async function persistenceState(): Promise<PersistenceState> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persisted) {
      return 'unsupported';
    }
    return (await navigator.storage.persisted()) ? 'persisted' : 'denied';
  } catch {
    return 'unsupported';
  }
}
