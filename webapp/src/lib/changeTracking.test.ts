// Every write is stamped and every delete leaves a tombstone — what sync
// compares — except writes that are not the user changing something.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { EncRecord, Tombstone } from './db';

const mem = { records: new Map<string, EncRecord>(), tombstones: new Map<string, Tombstone>() };

vi.mock('./crypto', () => ({
  encryptJson: async (_k: unknown, v: unknown) => ({ iv: '', ct: JSON.stringify(v) }),
  decryptJson: async (_k: unknown, e: { ct: string }) => JSON.parse(e.ct),
}));

vi.mock('./db', () => {
  const table = <T extends { id?: string; key?: string }>(m: Map<string, T>, pk: 'id' | 'key') => ({
    get: async (k: string) => m.get(k),
    put: async (v: T) => { m.set(v[pk] as string, v); },
    delete: async (k: string) => { m.delete(k); },
    bulkPut: async (vs: T[]) => { for (const v of vs) m.set(v[pk] as string, v); },
    bulkDelete: async (ks: string[]) => { for (const k of ks) m.delete(k); },
    where: () => ({
      anyOf: (ks: string[]) => ({ primaryKeys: async () => ks.filter((k) => m.has(k)) }),
      equals: (vault: string) => ({
        delete: async () => { for (const [k, v] of m) if ((v as { vaultId?: string }).vaultId === vault) m.delete(k); },
      }),
    }),
  });
  return {
    db: {
      records: table(mem.records, 'id'),
      tombstones: table(mem.tombstones, 'key'),
      transaction: async (_mode: string, ...rest: unknown[]) => (rest[rest.length - 1] as () => Promise<void>)(),
    },
  };
});

const { applyMutations, putRecord, deleteRecord, clearVault, nextStamp, observeStamp } = await import('./repo');
const key = {} as CryptoKey;
const valueOf = (id: string) => JSON.parse(mem.records.get(id)!.enc.ct);

beforeEach(() => {
  mem.records.clear();
  mem.tombstones.clear();
});

describe('stamps', () => {
  test('an ordinary write is stamped inside the encrypted value', async () => {
    await putRecord(key, 'txn', 'v', 't1', { id: 't1', amount: '5' });
    expect(valueOf('txn:t1').changedAt).toEqual(expect.any(Number));
    expect(Object.keys(mem.records.get('txn:t1')!)).toEqual(['id', 'type', 'vaultId', 'enc']); // nothing plaintext
  });

  test('stamps only move forward, even within one millisecond', () => {
    const a = nextStamp();
    const b = nextStamp();
    expect(b).toBeGreaterThan(a);
  });

  test('a stamp seen from another device pushes later local stamps past it', () => {
    const future = Date.now() + 60_000;
    observeStamp(future);
    expect(nextStamp()).toBeGreaterThan(future);
  });

  test('a preserved write keeps the stamp the record already had', async () => {
    await applyMutations(key, 'v', [{ op: 'put', type: 'txn', id: 't1', value: { id: 't1', changedAt: 42 } }], { preserve: true });
    expect(valueOf('txn:t1').changedAt).toBe(42);
  });
});

describe('tombstones', () => {
  test('deleting a record leaves a tombstone; deleting nothing leaves none', async () => {
    await putRecord(key, 'txn', 'v', 't1', { id: 't1' });
    await applyMutations(key, 'v', [
      { op: 'delete', type: 'txn', id: 't1' },
      { op: 'delete', type: 'posting', id: 'never-written' },
    ]);
    expect([...mem.tombstones.keys()]).toEqual(['txn:t1']);
    expect(mem.tombstones.get('txn:t1')).toMatchObject({ type: 'txn', recId: 't1', vaultId: 'v' });
  });

  test('deleteRecord records the tombstone under the record\'s own vault', async () => {
    await putRecord(key, 'profile', 'v', 'p1', { id: 'p1' });
    await deleteRecord('profile', 'p1');
    expect(mem.tombstones.get('profile:p1')?.vaultId).toBe('v');
  });

  test('writing a deleted record again clears its tombstone', async () => {
    await putRecord(key, 'txn', 'v', 't1', { id: 't1' });
    await deleteRecord('txn', 't1');
    await applyMutations(key, 'v', [{ op: 'put', type: 'txn', id: 't1', value: { id: 't1' } }]);
    expect(mem.tombstones.size).toBe(0);
  });

  test('a restore (preserve) deletes without telling other devices to', async () => {
    await putRecord(key, 'txn', 'v', 't1', { id: 't1' });
    await applyMutations(key, 'v', [{ op: 'delete', type: 'txn', id: 't1' }], { preserve: true });
    expect(mem.records.size).toBe(0);
    expect(mem.tombstones.size).toBe(0);
  });

  test('wiping a vault clears its tombstones too', async () => {
    await putRecord(key, 'txn', 'v', 't1', { id: 't1' });
    await deleteRecord('txn', 't1');
    await clearVault('v');
    expect(mem.tombstones.size).toBe(0);
  });
});
