import { describe, expect, test } from 'vitest';
import type { SyncBundle, SyncRecord } from '@khazana/domain/syncMerge';
import { TOMBSTONE_TTL_MS } from '@khazana/domain/syncMerge';
import {
  SyncFileError, buildBundle, decodeSyncFile, encodeSyncFile, isSyncFileName, planSync, stampOf,
  type SyncPayload,
} from './syncFile';

// Small numbers on purpose: stamps in these tests sit well inside the 90-day
// tombstone window, as real ones from an active device would.
const NOW = 1_000_000;
const rec = (type: string, id: string, updatedAt: number, extra: Record<string, unknown> = {}): SyncRecord =>
  ({ id, type, updatedAt, value: { id, changedAt: updatedAt, ...extra } });
const bundle = (records: SyncRecord[], tombstones: SyncBundle['tombstones'] = []): SyncBundle => ({ records, tombstones });
const remote = (deviceId: string, b: SyncBundle, exportedAt = NOW) => ({ deviceId, exportedAt, bundle: b });

/** Applies a plan to a bundle, as the store does to the vault. */
function apply(local: SyncBundle, others: SyncBundle[], joining = false): SyncBundle {
  return planSync(local, others.map((b, i) => remote(`d${i}`, b)), { now: NOW, joining }).merged;
}
const ids = (b: SyncBundle) => b.records.map((r) => `${r.type}:${r.id}@${r.updatedAt}`).sort();

describe('sync file', () => {
  const payload: SyncPayload = {
    deviceId: 'mac-1', deviceName: 'Mac', exportedAt: NOW, schemaVersion: 3,
    bundle: bundle([rec('txn', 't1', 5, { amount: '450', merchant: 'swiggy' })]),
  };

  test('round-trips, and nothing readable is left outside the encryption', async () => {
    const text = await encodeSyncFile(payload, 'correct horse battery');
    expect(text).not.toMatch(/swiggy|450|Mac|mac-1/);
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(['enc', 'kdf', 'magic', 'saltB64', 'v']);
    expect(await decodeSyncFile(text, 'correct horse battery', 3)).toEqual(payload);
  });

  test('a wrong passphrase and a tampered file are both refused', async () => {
    const text = await encodeSyncFile(payload, 'correct horse battery');
    await expect(decodeSyncFile(text, 'wrong horse battery', 3)).rejects.toMatchObject({ kind: 'wrong_passphrase' });
    const env = JSON.parse(text);
    env.enc.ct = env.enc.ct.slice(0, -4) + (env.enc.ct.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    await expect(decodeSyncFile(JSON.stringify(env), 'correct horse battery', 3)).rejects.toBeInstanceOf(SyncFileError);
  });

  test('refuses what is not ours, and what a newer build wrote', async () => {
    await expect(decodeSyncFile('{"hello":1}', 'x', 3)).rejects.toMatchObject({ kind: 'not_sync_file' });
    const text = await encodeSyncFile({ ...payload, schemaVersion: 9 }, 'correct horse battery');
    await expect(decodeSyncFile(text, 'correct horse battery', 3)).rejects.toMatchObject({ kind: 'newer_version' });
  });

  test('file names are confined', () => {
    expect(isSyncFileName('3f2a-91bc.khazana-sync')).toBe(true);
    expect(isSyncFileName('../x.khazana-sync')).toBe(false);
  });
});

describe('buildBundle', () => {
  test('leaves out derived postings and receipt images, and orders by changedAt', () => {
    const b = buildBundle([
      { type: 'txn', value: { id: 't1', changedAt: 9, updatedAt: 3, createdAt: 1 } },
      { type: 'posting', value: { id: 't1:dr' } },
      { type: 'attachment', value: { id: 'a1' } },
      { type: 'category', value: { id: 'c1' } },
    ], [{ id: 'p:x', type: 'posting', deletedAt: 1 }, { id: 't2', type: 'txn', deletedAt: 2 }]);
    expect(b.records.map((r) => [r.type, r.updatedAt])).toEqual([['txn', 9], ['category', 0]]);
    expect(b.tombstones).toEqual([{ id: 't2', type: 'txn', deletedAt: 2 }]);
    expect(stampOf({ updatedAt: 3, createdAt: 1 })).toBe(3);
  });
});

describe('planSync', () => {
  test('two devices adding different things both end up with both', () => {
    const mac = bundle([rec('txn', 'a', 1)]);
    const phone = bundle([rec('txn', 'b', 2)]);
    expect(ids(apply(mac, [phone]))).toEqual(['txn:a@1', 'txn:b@2']);
    expect(ids(apply(phone, [mac]))).toEqual(['txn:a@1', 'txn:b@2']);
  });

  test('the later edit of the same record wins, on both sides', () => {
    const mac = bundle([rec('txn', 'a', 10, { amount: '100' })]);
    const phone = bundle([rec('txn', 'a', 20, { amount: '120' })]);
    const plan = planSync(mac, [remote('phone', phone)], { now: NOW, joining: false });
    expect(plan.upserts.map((u) => u.value.amount)).toEqual(['120']);
    expect(apply(phone, [mac]).records[0].value.amount).toBe('120');
  });

  test('a delete on one device removes the record on the other', () => {
    const mac = bundle([rec('txn', 'a', 10)]);
    const phone = bundle([], [{ id: 'a', type: 'txn', deletedAt: 15 }]);
    const plan = planSync(mac, [remote('phone', phone)], { now: NOW, joining: false });
    expect(plan.deletes).toEqual([{ type: 'txn', id: 'a' }]);
    expect(plan.tombstones).toEqual([{ id: 'a', type: 'txn', deletedAt: 15 }]);
  });

  test('an edit made after the delete brings the record back', () => {
    const mac = bundle([rec('txn', 'a', 30)]);
    const phone = bundle([], [{ id: 'a', type: 'txn', deletedAt: 15 }]);
    expect(planSync(mac, [remote('phone', phone)], { now: NOW, joining: false }).deletes).toEqual([]);
  });

  test('three devices converge to the same vault whatever order they merge in', () => {
    const a = bundle([rec('txn', 'x', 5), rec('txn', 'shared', 10, { v: 'a' })]);
    const b = bundle([rec('txn', 'y', 6), rec('txn', 'shared', 12, { v: 'b' })], [{ id: 'x', type: 'txn', deletedAt: 7 }]);
    const c = bundle([rec('goal', 'z', 8)]);
    const fromA = apply(a, [b, c]);
    const fromB = apply(b, [c, a]);
    const fromC = apply(c, [a, b]);
    expect(ids(fromA)).toEqual(['goal:z@8', 'txn:shared@12', 'txn:y@6']);
    expect(ids(fromB)).toEqual(ids(fromA));
    expect(ids(fromC)).toEqual(ids(fromA));
  });

  test('joining adopts the other devices\' data and drops this device\'s seeded defaults', () => {
    const fresh = bundle([rec('category', 'my-food', 1, { name: 'Food' }), rec('profile', 'my-personal', 1)]);
    const mac = bundle([rec('category', 'food', 1, { name: 'Food' }), rec('profile', 'personal', 1), rec('txn', 't', 2)]);
    const plan = planSync(fresh, [remote('mac', mac)], { now: NOW, joining: true });
    expect(plan.deletes.map((d) => d.id).sort()).toEqual(['my-food', 'my-personal']);
    expect(ids(plan.merged)).toEqual(ids(mac));
  });

  test('a device silent for longer than the tombstone window is skipped', () => {
    const mac = bundle([]);
    const old = bundle([rec('txn', 'deleted-long-ago', 1)]);
    const plan = planSync(mac, [remote('old-phone', old, NOW - TOMBSTONE_TTL_MS - 1)], { now: NOW, joining: false });
    expect(plan.stale).toEqual(['old-phone']);
    expect(plan.upserts).toEqual([]);
  });

  test('reports the newest remote stamp, so local clocks can move past it', () => {
    const plan = planSync(bundle([]), [remote('p', bundle([rec('txn', 'a', 50)], [{ id: 'b', type: 'txn', deletedAt: 70 }]))], { now: NOW, joining: false });
    expect(plan.maxRemoteStamp).toBe(70);
  });
});
