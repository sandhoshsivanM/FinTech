// Generic encrypted repository over the Dexie store. Each entity is encrypted
// before write and decrypted on read with the in-memory session key.
import { db, type EncRecord, type Tombstone } from './db';
import { decryptJson, encryptJson } from './crypto';

function recId(type: string, id: string) {
  return `${type}:${id}`;
}

/* -------------------------------------------------------------------------- */
/* Change tracking, for cross-device sync                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every ordinary write stamps the record with `changedAt`, inside the
 * encrypted value — never as a plaintext column, which would tell anyone
 * holding the database file when each record was last touched. Every delete
 * leaves a tombstone. Sync compares these to decide which copy wins.
 *
 * `changedAt` is separate from `Txn.updatedAt`, which the UI shows as "edited";
 * stamping that on every write would mark every entry as edited.
 */
let lastStamp = 0;

/**
 * Wall-clock ms, but never equal to or behind the last stamp this device issued
 * or saw from another. A Mac whose clock is a minute slow would otherwise lose
 * every conflict against a phone that is right, even for edits made after it.
 */
export function nextStamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

/** Called by sync with the newest remote stamp, so later local edits order after it. */
export function observeStamp(ts: number): void {
  if (ts > lastStamp) lastStamp = ts;
}

/**
 * `preserve` is for writes that are not the user changing something —
 * migrations, ledger backfills and restores. They keep the stamp the record
 * already carries and leave no tombstones. Otherwise a migration on one device
 * would look newer than a real edit made on another, and restoring an old
 * backup would delete everything added since, on every device.
 */
export interface WriteOptions { preserve?: boolean }

function stamped(value: unknown, opts?: WriteOptions): unknown {
  if (opts?.preserve || value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  return { ...(value as Record<string, unknown>), changedAt: nextStamp() };
}

const tombstone = (type: string, id: string, vaultId: string, deletedAt: number): Tombstone =>
  ({ key: recId(type, id), type, recId: id, vaultId, deletedAt });

/** A record that is in the vault but could not be read back. */
export interface ReadFailure { type: string; id: string }

/**
 * @param failures collects records that would otherwise vanish silently.
 *
 * A record that fails to decrypt used to be skipped without a word. It then
 * disappeared from every screen *and* from the next backup export, so the
 * damage propagated into the user's only copy. Callers that can report it pass
 * an array; the read still succeeds so one bad record cannot blank a screen.
 */
export async function listRecords<T>(
  key: CryptoKey,
  type: string,
  vaultId: string,
  failures?: ReadFailure[],
): Promise<T[]> {
  const rows = await db.records.where('[type+vaultId]').equals([type, vaultId]).toArray();
  const out: T[] = [];
  for (const r of rows) {
    try {
      out.push(await decryptJson<T>(key, r.enc));
    } catch {
      failures?.push({ type, id: r.id });
    }
  }
  return out;
}

/**
 * The ids of every record of a type, without decrypting any of them.
 *
 * Dexie's primary key is `<type>:<id>`, so the ids are already in the index.
 * Used for attachments, where the payload is a base64 image and decrypting the
 * lot just to learn which ids exist would be absurd.
 */
export async function listRecordIds(type: string, vaultId: string): Promise<string[]> {
  const keys = await db.records.where('[type+vaultId]').equals([type, vaultId]).primaryKeys();
  return (keys as string[]).map((k) => k.slice(type.length + 1));
}

export async function getRecord<T>(
  key: CryptoKey,
  type: string,
  id: string,
): Promise<T | null> {
  const row = await db.records.get(recId(type, id));
  if (!row) return null;
  try {
    return await decryptJson<T>(key, row.enc);
  } catch {
    return null;
  }
}

export async function putRecord(
  key: CryptoKey,
  type: string,
  vaultId: string,
  id: string,
  value: unknown,
  opts?: WriteOptions,
): Promise<void> {
  const enc = await encryptJson(key, stamped(value, opts));
  const rec: EncRecord = { id: recId(type, id), type, vaultId, enc };
  await db.transaction('rw', db.records, db.tombstones, async () => {
    await db.records.put(rec);
    // Written again after a delete: it exists, so it is no longer deleted.
    if (!opts?.preserve) await db.tombstones.delete(rec.id);
  });
}

export async function deleteRecord(type: string, id: string): Promise<void> {
  const k = recId(type, id);
  await db.transaction('rw', db.records, db.tombstones, async () => {
    const existing = await db.records.get(k);
    await db.records.delete(k);
    if (existing) await db.tombstones.put(tombstone(type, id, existing.vaultId, nextStamp()));
  });
}

/** One record to write, or an id to delete, as part of an atomic batch. */
export type Mutation =
  | { op: 'put'; type: string; id: string; value: unknown }
  | { op: 'delete'; type: string; id: string };

/**
 * Applies every mutation or none.
 *
 * A transaction and its two ledger legs are one financial event, but they were
 * written as three sequential `putRecord` calls — a failure between them left
 * an entry with a single leg, which unbalances the ledger and moves one account
 * balance without the other.
 *
 * Encryption happens up front, deliberately outside the transaction: awaiting a
 * non-Dexie promise inside a Dexie transaction drops out of its zone and the
 * transaction commits early, which would defeat the point.
 */
export async function applyMutations(
  key: CryptoKey,
  vaultId: string,
  mutations: Mutation[],
  opts?: WriteOptions,
): Promise<void> {
  if (mutations.length === 0) return;

  const puts: EncRecord[] = [];
  const deletes: string[] = [];
  const tombs: Tombstone[] = [];
  for (const m of mutations) {
    if (m.op === 'delete') {
      deletes.push(recId(m.type, m.id));
      tombs.push(tombstone(m.type, m.id, vaultId, nextStamp()));
      continue;
    }
    puts.push({ id: recId(m.type, m.id), type: m.type, vaultId, enc: await encryptJson(key, stamped(m.value, opts)) });
  }

  await db.transaction('rw', db.records, db.tombstones, async () => {
    if (deletes.length > 0) {
      // Only what actually existed: deleting a posting that was never written
      // (a transfer's legs, say) is not news another device needs.
      const present = new Set(await db.records.where('id').anyOf(deletes).primaryKeys());
      await db.records.bulkDelete(deletes);
      if (!opts?.preserve) await db.tombstones.bulkPut(tombs.filter((t) => present.has(t.key)));
    }
    if (puts.length > 0) {
      await db.records.bulkPut(puts);
      if (!opts?.preserve) await db.tombstones.bulkDelete(puts.map((p) => p.id));
    }
  });
}

/**
 * How many records in a vault are the user's own, counted without decrypting.
 *
 * Excludes what every vault has from the moment it exists — categories, the
 * profile, the structural `acct-…` accounts (Cash, Opening Balances, …) and
 * the net-worth snapshots taken on unlock — so a brand-new vault reads 0 and
 * anything typed, imported or restored reads > 0.
 */
export async function userRecordCount(vaultId: string): Promise<number> {
  const NOT_USER_DATA = new Set(['category', 'profile', 'snapshot']);
  return db.records
    .where('vaultId').equals(vaultId)
    .filter((r) => !NOT_USER_DATA.has(r.type) && !r.id.startsWith('account:acct-'))
    .count();
}

export async function clearVault(vaultId: string): Promise<void> {
  await db.transaction('rw', db.records, db.tombstones, async () => {
    await db.records.where('vaultId').equals(vaultId).delete();
    await db.tombstones.where('vaultId').equals(vaultId).delete();
  });
}

/**
 * Writes a merge from another device: records keep the stamps they arrived
 * with, and the vault's tombstones are replaced by the merged set — all in one
 * transaction, so a sync interrupted halfway leaves the vault as it was.
 */
export async function applySync(
  key: CryptoKey,
  vaultId: string,
  mutations: Mutation[],
  tombstones: { id: string; type: string; deletedAt: number }[],
): Promise<void> {
  const puts: EncRecord[] = [];
  const deletes: string[] = [];
  for (const m of mutations) {
    if (m.op === 'delete') deletes.push(recId(m.type, m.id));
    else puts.push({ id: recId(m.type, m.id), type: m.type, vaultId, enc: await encryptJson(key, m.value) });
  }
  await db.transaction('rw', db.records, db.tombstones, async () => {
    if (deletes.length > 0) await db.records.bulkDelete(deletes);
    if (puts.length > 0) await db.records.bulkPut(puts);
    await db.tombstones.where('vaultId').equals(vaultId).delete();
    await db.tombstones.bulkPut(tombstones.map((t) => tombstone(t.type, t.id, vaultId, t.deletedAt)));
  });
}

/** Tombstones for a vault, in the shape sync compares. */
export async function listTombstones(vaultId: string): Promise<{ id: string; type: string; deletedAt: number }[]> {
  const rows = await db.tombstones.where('vaultId').equals(vaultId).toArray();
  return rows.map((t) => ({ id: t.recId, type: t.type, deletedAt: t.deletedAt }));
}
