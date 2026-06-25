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

class FintechDB extends Dexie {
  records!: Table<EncRecord, string>;
  vaults!: Table<VaultMeta, string>;
  tombstones!: Table<Tombstone, string>;

  constructor() {
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

export const db = new FintechDB();
