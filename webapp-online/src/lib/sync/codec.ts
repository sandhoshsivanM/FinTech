// Entity <-> sync record. One generic codec for every offline entity type.
//
// Server rules (backend/services/Sync SyncRules.cs) this has to respect:
// - collection  ^[a-z][a-z0-9_]{0,31}$   -> the store's camelCase type, snake_cased
// - record id   ^[A-Za-z0-9_-]{1,64}$ and UNIQUE ACROSS collections for a user
//   (the primary key is user_id + record_id) -> a hash of "type\0entity id",
//   base64url, 43 characters. Entity ids contain characters and lengths the
//   rule refuses (acct-exp-<profile>-<category> is 80+), and two types may
//   share an id, so the id is never used raw. The entity id travels inside
//   the ciphertext.
// - ciphertext <= 64 KiB -> a larger entity is refused here with a clear error
//   rather than rejected by the server later and stuck in the outbox.
//
// Not synced: postings (derived; recomputed locally) and attachments (their
// own endpoint, see attachments.ts).
import { STORE } from '@khazana/domain/types';
import { toBase64, utf8 } from '../crypto/bytes';
import { decryptRecord, encryptRecord, KEY_VERSION } from '../crypto/e2e';
import type { LocalRecord } from '../vault';

export const MAX_CIPHERTEXT = 64 * 1024;
export const RECORD_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const COLLECTION = /^[a-z][a-z0-9_]{0,31}$/;

/** Derived or stored elsewhere: never written as a sync record. */
export const NOT_SYNCED: ReadonlySet<string> = new Set([STORE.posting, STORE.attachment]);

export const SYNCED_TYPES: string[] = Object.values(STORE).filter((t) => !NOT_SYNCED.has(t));

export const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const COLLECTIONS = new Map(SYNCED_TYPES.map((t) => [t, snake(t)]));
const TYPES = new Map(SYNCED_TYPES.map((t) => [snake(t), t]));

/** Collections from before the shared store; still read, for the one-time migration. */
export const LEGACY_ACCOUNTS = 'accounts';
export const LEGACY_TRANSACTIONS = 'transactions';
/** Online-only credit cards. Unchanged. */
export const CARDS = 'cards';

export function collectionOf(type: string): string {
  const c = COLLECTIONS.get(type);
  if (!c) throw new Error(`"${type}" is not a synced type.`);
  return c;
}
export const typeOfCollection = (collection: string): string | undefined => TYPES.get(collection);

export async function recordIdFor(type: string, id: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(`${type}\0${id}`)));
  return toBase64(digest).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class RecordTooLargeError extends Error {
  constructor(readonly type: string, readonly id: string, readonly bytes: number) {
    super(`${type} ${id} is ${bytes} bytes encrypted; a synced record may be at most ${MAX_CIPHERTEXT}.`);
  }
}

/** Fields kept out of the synced payload (too large for a record; stay on the device). */
function forSync(type: string, entity: Record<string, unknown>): Record<string, unknown> {
  if (type === STORE.profile && 'photo' in entity) {
    const { photo: _photo, ...rest } = entity;
    return rest;
  }
  return entity;
}

export async function encodeEntity(
  dek: Uint8Array, type: string, entity: { id: string } & Record<string, unknown>, updatedAt: string,
): Promise<LocalRecord> {
  const collection = collectionOf(type);
  const recordId = await recordIdFor(type, entity.id);
  const ciphertext = await encryptRecord(dek, { recordId, collection, keyVersion: KEY_VERSION }, forSync(type, entity));
  if (ciphertext.length > MAX_CIPHERTEXT) throw new RecordTooLargeError(type, entity.id, ciphertext.length);
  return { collection, recordId, updatedAt, deleted: false, ciphertext, keyVersion: KEY_VERSION };
}

export async function tombstoneFor(type: string, id: string, updatedAt: string): Promise<LocalRecord> {
  return { collection: collectionOf(type), recordId: await recordIdFor(type, id), updatedAt, deleted: true, ciphertext: null, keyVersion: KEY_VERSION };
}

/** The entity inside a live record of a synced collection, or undefined when it can't be opened or isn't one. */
export async function decodeEntity(dek: Uint8Array, r: LocalRecord): Promise<{ type: string; entity: { id: string } & Record<string, unknown> } | undefined> {
  const type = typeOfCollection(r.collection);
  if (!type || r.deleted || !r.ciphertext) return undefined;
  try {
    const entity = await decryptRecord<{ id: string } & Record<string, unknown>>(dek, { recordId: r.recordId, collection: r.collection, keyVersion: r.keyVersion }, r.ciphertext);
    // The record id must be the hash of what the payload claims to be, so a
    // record can't be replayed under another entity's id.
    if (typeof entity?.id !== 'string' || (await recordIdFor(type, entity.id)) !== r.recordId) return undefined;
    return { type, entity };
  } catch {
    return undefined;
  }
}
