// Generic encrypted repository over the Dexie store. Each entity is encrypted
// before write and decrypted on read with the in-memory session key.
import { db, type EncRecord } from './db';
import { decryptJson, encryptJson } from './crypto';

function recId(type: string, id: string) {
  return `${type}:${id}`;
}

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
): Promise<void> {
  const enc = await encryptJson(key, value);
  const rec: EncRecord = { id: recId(type, id), type, vaultId, enc };
  await db.records.put(rec);
}

export async function deleteRecord(type: string, id: string): Promise<void> {
  await db.records.delete(recId(type, id));
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
): Promise<void> {
  if (mutations.length === 0) return;

  const puts: EncRecord[] = [];
  const deletes: string[] = [];
  for (const m of mutations) {
    if (m.op === 'delete') {
      deletes.push(recId(m.type, m.id));
      continue;
    }
    puts.push({ id: recId(m.type, m.id), type: m.type, vaultId, enc: await encryptJson(key, m.value) });
  }

  await db.transaction('rw', db.records, async () => {
    if (deletes.length > 0) await db.records.bulkDelete(deletes);
    if (puts.length > 0) await db.records.bulkPut(puts);
  });
}

export async function clearVault(vaultId: string): Promise<void> {
  await db.records.where('vaultId').equals(vaultId).delete();
}
