// The web vault's "never over existing data" rules.
//
// The Flutter app lost users' data when an update made it believe a vault did
// not exist: setup ran, wrote a new salt, and the existing database became
// unreadable. The web vault has the same shape of risk — `init()` used to
// decide "no vault" from the vault row alone, and `setup()` wrote a new salt
// without looking at what was already stored — plus a second one: "Load
// sample data" cleared every profile without asking.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { EncRecord, Tombstone, VaultMeta } from './db';

// A minimal in-memory stand-in for the Dexie tables these paths touch.
const mem = vi.hoisted(() => ({
  vaults: new Map<string, unknown>(),
  records: [] as Record<string, unknown>[],
  tombstones: [] as Record<string, unknown>[],
}));

vi.mock('./db', () => {
  const coll = (arr: Record<string, unknown>[], field: string, value: unknown) => {
    let pred = (r: Record<string, unknown>) => r[field] === value;
    const c = {
      filter(f: (r: Record<string, unknown>) => boolean) { const p = pred; pred = (r) => p(r) && f(r); return c; },
      count: async () => arr.filter(pred).length,
      toArray: async () => arr.filter(pred),
      modify: async (changes: Record<string, unknown>) => { arr.filter(pred).forEach((r) => Object.assign(r, changes)); },
      delete: async () => { for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) arr.splice(i, 1); },
    };
    return c;
  };
  const table = (arr: Record<string, unknown>[]) => ({
    count: async () => arr.length,
    where: (field: string) => ({ equals: (v: unknown) => coll(arr, field, v) }),
  });
  return {
    db: {
      vaults: {
        get: async (id: string) => mem.vaults.get(id),
        put: async (v: { vaultId: string }) => { mem.vaults.set(v.vaultId, v); },
        update: async () => 1,
      },
      records: table(mem.records),
      tombstones: table(mem.tombstones),
      transaction: async (...args: unknown[]) => (args[args.length - 1] as () => Promise<unknown>)(),
    },
    persistenceState: async () => 'unsupported',
    requestPersistence: async () => 'unsupported',
  };
});

const { useApp } = await import('./store');
const { userRecordCount } = await import('./repo');
const { loadSampleData } = await import('./sampleData');

const rec = (type: string, id: string, vaultId = 'default'): Record<string, unknown> =>
  ({ id: `${type}:${id}`, type, vaultId, enc: { iv: 'x', ct: 'y' } } satisfies Omit<EncRecord, 'enc'> & { enc: unknown });
const meta: VaultMeta = {
  vaultId: 'default', name: 'My Vault', saltB64: 'c2FsdA==',
  verifier: { iv: 'a', ct: 'b' } as unknown as VaultMeta['verifier'], schemaVersion: 3,
};

beforeEach(() => {
  mem.vaults.clear();
  mem.records.length = 0;
  mem.tombstones.length = 0;
  useApp.setState({ status: 'loading', error: null, strandedRecords: 0, key: null });
});

describe('records with no vault row', () => {
  test('init reports them as stranded instead of a clean first run', async () => {
    mem.records.push(rec('txn', 'a'), rec('txn', 'b'), rec('category', 'c'));
    await useApp.getState().init();
    expect(useApp.getState().status).toBe('uninitialized');
    expect(useApp.getState().strandedRecords).toBe(3);
  });

  test('records already set aside do not count', async () => {
    mem.records.push(rec('txn', 'a', 'set-aside-1'));
    await useApp.getState().init();
    expect(useApp.getState().strandedRecords).toBe(0);
  });

  test('setup refuses, and writes no new salt', async () => {
    mem.records.push(rec('txn', 'a'));
    await useApp.getState().setup('123456');
    expect(mem.vaults.size).toBe(0);
    expect(mem.records).toHaveLength(1);
    expect(useApp.getState().strandedRecords).toBe(1);
    expect(useApp.getState().error).toMatch(/Nothing was changed/);
  });

  test('setting them aside keeps every record, under another vault id', async () => {
    mem.records.push(rec('txn', 'a'), rec('account', 'b'));
    mem.tombstones.push({ key: 'txn:z', type: 'txn', recId: 'z', vaultId: 'default', deletedAt: 1 } satisfies Tombstone);
    await useApp.getState().setAsideStranded();
    expect(mem.records).toHaveLength(2);
    expect(mem.records.every((r) => String(r.vaultId).startsWith('set-aside-'))).toBe(true);
    expect(mem.tombstones[0].vaultId).toMatch(/^set-aside-/);
    expect(useApp.getState().strandedRecords).toBe(0);
  });
});

test('setup over an existing vault row refuses and leaves the row alone', async () => {
  mem.vaults.set('default', meta);
  await useApp.getState().setup('123456');
  expect(mem.vaults.get('default')).toBe(meta);
  expect(useApp.getState().status).toBe('locked');
});

describe('what counts as the user’s own data', () => {
  test('a brand-new vault has none', async () => {
    mem.records.push(
      rec('category', 'c1'), rec('profile', 'p1'), rec('snapshot', 's1'),
      rec('account', 'acct-cash-p1'), rec('account', 'acct-opening-p1'),
    );
    expect(await userRecordCount('default')).toBe(0);
  });

  test('a transaction, or an account the user added, is data', async () => {
    mem.records.push(rec('txn', 't1'), rec('account', 'u-123'));
    expect(await userRecordCount('default')).toBe(2);
  });
});

describe('load sample data', () => {
  test('refuses when the vault has the user’s records, and deletes nothing', async () => {
    mem.records.push(rec('txn', 't1'), rec('txn', 't2', 'default'));
    useApp.setState({ key: {} as CryptoKey, vaultId: 'default' });
    await expect(loadSampleData()).rejects.toThrow(/Nothing was changed/);
    expect(mem.records).toHaveLength(2);
  });
});
