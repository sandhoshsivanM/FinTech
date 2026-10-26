// Two devices through the real store, real encryption and an in-memory vault:
// a Mac's transaction reaches a phone that joins, ledger legs and all, and the
// phone's delete comes back to the Mac.
import { beforeEach, describe, expect, test, vi } from 'vitest';

type Row = Record<string, unknown>;
const mem = vi.hoisted(() => ({
  vaults: new Map<string, Row>(),
  records: new Map<string, Row>(),
  tombstones: new Map<string, Row>(),
}));

vi.mock('./db', () => {
  const coll = (m: Map<string, Row>, pred: (r: Row) => boolean) => {
    const c = {
      filter(f: (r: Row) => boolean) { const p = pred; pred = (r) => p(r) && f(r); return c; },
      toArray: async () => [...m.values()].filter(pred),
      primaryKeys: async () => [...m.entries()].filter(([, r]) => pred(r)).map(([k]) => k),
      count: async () => [...m.values()].filter(pred).length,
      modify: async (ch: Row) => { [...m.values()].filter(pred).forEach((r) => Object.assign(r, ch)); },
      delete: async () => { for (const [k, r] of m) if (pred(r)) m.delete(k); },
    };
    return c;
  };
  const table = (m: Map<string, Row>, pk: string) => ({
    get: async (k: string) => m.get(k),
    put: async (r: Row) => { m.set(r[pk] as string, r); },
    delete: async (k: string) => { m.delete(k); },
    bulkPut: async (rs: Row[]) => { for (const r of rs) m.set(r[pk] as string, r); },
    bulkDelete: async (ks: string[]) => { for (const k of ks) m.delete(k); },
    count: async () => m.size,
    toArray: async () => [...m.values()],
    where: (field: string) => ({
      equals: (v: unknown) => coll(m, (r) => field === '[type+vaultId]'
        ? r.type === (v as string[])[0] && r.vaultId === (v as string[])[1]
        : r[field] === v),
      anyOf: (ks: string[]) => coll(m, (r) => ks.includes(r[pk] as string)),
    }),
  });
  return {
    db: {
      vaults: {
        get: async (id: string) => mem.vaults.get(id),
        put: async (v: Row) => { mem.vaults.set(v.vaultId as string, v); },
        update: async (id: string, ch: Row) => { mem.vaults.set(id, { ...mem.vaults.get(id), ...ch }); return 1; },
      },
      records: table(mem.records, 'id'),
      tombstones: table(mem.tombstones, 'key'),
      transaction: async (...args: unknown[]) => (args[args.length - 1] as () => Promise<unknown>)(),
    },
    persistenceState: async () => 'unsupported',
    requestPersistence: async () => 'unsupported',
  };
});

const { useApp } = await import('./store');
const { putRecord, applyMutations, listRecords } = await import('./repo');
const { deriveKey } = await import('./crypto');

const PASS = 'a long shared sync phrase';
const key = await deriveKey('1234', new Uint8Array(16));
const V = 'default';

type Snapshot = { vaults: Map<string, Row>; records: Map<string, Row>; tombstones: Map<string, Row> };
const snapshot = (): Snapshot => ({ vaults: new Map(mem.vaults), records: new Map(mem.records), tombstones: new Map(mem.tombstones) });
function restore(s: Snapshot) {
  for (const t of ['vaults', 'records', 'tombstones'] as const) {
    mem[t].clear();
    for (const [k, v] of s[t]) mem[t].set(k, v);
  }
}
async function device(deviceId: string) {
  mem.vaults.set(V, { vaultId: V });
  useApp.setState({ key, vaultId: V, activeProfileId: '', status: 'unlocked' });
  if (!(await useApp.getState().getSyncConfig())) {
    await useApp.getState().setSyncConfig({ passphrase: PASS, deviceId, deviceName: deviceId, lastSyncAt: null });
  }
}
const types = async (type: string) => (await listRecords<{ id: string }>(key, type, V)).map((r) => r.id).sort();

beforeEach(() => {
  mem.vaults.clear();
  mem.records.clear();
  mem.tombstones.clear();
});

describe('sync between two devices', () => {
  test('join, rebuild the ledger, and carry a delete back', async () => {
    // The Mac, with one profile, one category and one spend.
    await device('mac');
    await putRecord(key, 'profile', V, 'p1', { id: 'p1', vaultId: V, name: 'Personal', kind: 'self', createdAt: 1 });
    await putRecord(key, 'category', V, 'food', { id: 'food', vaultId: V, name: 'Food' });
    await putRecord(key, 'txn', V, 't1', {
      id: 't1', vaultId: V, profileId: 'p1', amount: '450', type: 'expense', categoryId: 'food', date: 5, createdAt: 5,
    });
    const macFile = (await useApp.getState().syncWith([])).own!;
    expect(macFile.name).toBe('mac.khazana-sync');
    const mac = snapshot();

    // A phone with an empty vault joins from the Mac's file.
    mem.vaults.clear(); mem.records.clear(); mem.tombstones.clear();
    await device('phone');
    const joined = await useApp.getState().syncWith([macFile]);
    expect(joined.needsConfirm).toBe(false);
    expect(joined.devices.map((d) => d.deviceName)).toEqual(['mac']);
    expect(await types('txn')).toEqual(['t1']);
    // Postings are not in the file; the phone rebuilt them.
    expect(await types('posting')).toEqual(['t1:cr', 't1:dr']);

    // The phone deletes the spend and writes its file.
    await applyMutations(key, V, [
      { op: 'delete', type: 'txn', id: 't1' },
      { op: 'delete', type: 'posting', id: 't1:dr' },
      { op: 'delete', type: 'posting', id: 't1:cr' },
    ]);
    const phoneFile = (await useApp.getState().syncWith([macFile])).own!;

    // Back on the Mac: the delete arrives, legs included.
    restore(mac);
    await device('mac');
    await useApp.getState().syncWith([phoneFile, macFile]);
    expect(await types('txn')).toEqual([]);
    expect(await types('posting')).toEqual([]);
  });

  test('an unchanged vault produces no new file', async () => {
    await device('mac');
    await putRecord(key, 'goal', V, 'g', { id: 'g', vaultId: V, name: 'Trip' });
    const first = (await useApp.getState().syncWith([])).own!;
    await useApp.getState().markSyncWritten(first.digest);
    expect((await useApp.getState().syncWith([{ name: first.name, text: '' }])).own).toBeNull();
  });

  test('two separate vaults are not merged without asking', async () => {
    await device('mac');
    await putRecord(key, 'profile', V, 'p-mac', { id: 'p-mac', vaultId: V, name: 'Personal', createdAt: 1 });
    await putRecord(key, 'txn', V, 'm', { id: 'm', vaultId: V, profileId: 'p-mac', amount: '1', type: 'expense', categoryId: 'c', date: 1, createdAt: 1 });
    const macFile = (await useApp.getState().syncWith([])).own!;

    mem.vaults.clear(); mem.records.clear(); mem.tombstones.clear();
    await device('laptop');
    await putRecord(key, 'profile', V, 'p-laptop', { id: 'p-laptop', vaultId: V, name: 'Personal', createdAt: 1 });
    await putRecord(key, 'txn', V, 'l', { id: 'l', vaultId: V, profileId: 'p-laptop', amount: '2', type: 'expense', categoryId: 'c', date: 1, createdAt: 1 });
    const asked = await useApp.getState().syncWith([macFile]);
    expect(asked.needsConfirm).toBe(true);
    expect(await types('txn')).toEqual(['l']);

    await useApp.getState().syncWith([macFile], { confirmSeparate: true });
    expect(await types('txn')).toEqual(['l', 'm']);
  });

  test('a file from a different passphrase is reported, not merged', async () => {
    await device('mac');
    await putRecord(key, 'goal', V, 'g', { id: 'g', vaultId: V });
    const macFile = (await useApp.getState().syncWith([])).own!;
    mem.vaults.clear(); mem.records.clear(); mem.tombstones.clear();
    mem.vaults.set(V, { vaultId: V });
    useApp.setState({ key, vaultId: V, status: 'unlocked' });
    await useApp.getState().setSyncConfig({ passphrase: 'some other passphrase', deviceId: 'x', deviceName: 'x', lastSyncAt: null });
    const r = await useApp.getState().syncWith([macFile]);
    expect(r.errors).toEqual([{ name: 'mac.khazana-sync', message: expect.stringMatching(/passphrase/) }]);
    expect(await types('goal')).toEqual([]);
  });
});
