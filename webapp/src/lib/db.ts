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

class FintechDB extends Dexie {
  records!: Table<EncRecord, string>;
  vaults!: Table<VaultMeta, string>;

  constructor() {
    super('fintech_os');
    this.version(1).stores({
      records: 'id, [type+vaultId], vaultId',
      vaults: 'vaultId',
    });
  }
}

export const db = new FintechDB();
