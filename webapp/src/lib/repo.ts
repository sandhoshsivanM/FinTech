// Generic encrypted repository over the Dexie store. Each entity is encrypted
// before write and decrypted on read with the in-memory session key.
import { db, type EncRecord } from './db';
import { decryptJson, encryptJson } from './crypto';

function recId(type: string, id: string) {
  return `${type}:${id}`;
}

export async function listRecords<T>(
  key: CryptoKey,
  type: string,
  vaultId: string,
): Promise<T[]> {
  const rows = await db.records.where('[type+vaultId]').equals([type, vaultId]).toArray();
  const out: T[] = [];
  for (const r of rows) {
    try {
      out.push(await decryptJson<T>(key, r.enc));
    } catch {
      // Skip records that fail to decrypt (wrong key / corruption).
    }
  }
  return out;
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

export async function clearVault(vaultId: string): Promise<void> {
  await db.records.where('vaultId').equals(vaultId).delete();
}
