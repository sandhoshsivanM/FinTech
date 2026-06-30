// Run with: npm test  (Vitest). Assertions use node:assert/strict, which Vitest supports.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mergeBundles, type SyncBundle } from '../src/domain/syncMerge.ts';

const now = 1_700_000_000_000;
const rec = (id: string, updatedAt: number, extra: Record<string, unknown> = {}) => ({
  id, type: 'txn', updatedAt, value: { id, updatedAt, ...extra },
});
const tomb = (id: string, deletedAt: number) => ({ id, type: 'txn', deletedAt });
const empty: SyncBundle = { records: [], tombstones: [] };

test('new record on remote is pulled in', () => {
  const r = mergeBundles(empty, { records: [rec('a', now - 100)], tombstones: [] }, now);
  assert.equal(r.upserts.length, 1);
  assert.equal(r.upserts[0].id, 'a');
  assert.equal(r.deletes.length, 0);
});

test('local-only record is untouched (no upsert needed)', () => {
  const r = mergeBundles({ records: [rec('a', now - 100)], tombstones: [] }, empty, now);
  assert.equal(r.upserts.length, 0);
  assert.equal(r.deletes.length, 0);
});

test('both edited same record → later updatedAt wins', () => {
  const local = { records: [rec('a', now - 200, { amt: 'L' })], tombstones: [] };
  const remote = { records: [rec('a', now - 100, { amt: 'R' })], tombstones: [] };
  const r = mergeBundles(local, remote, now);
  assert.equal(r.upserts.length, 1);
  assert.equal((r.upserts[0].value as { amt: string }).amt, 'R');

  // symmetric: if local is newer, nothing to apply locally
  const r2 = mergeBundles(remote, local, now);
  assert.equal(r2.upserts.length, 0);
});

test('remote delete newer than local edit → record removed locally', () => {
  const local = { records: [rec('a', now - 200)], tombstones: [] };
  const remote = { records: [], tombstones: [tomb('a', now - 100)] };
  const r = mergeBundles(local, remote, now);
  assert.equal(r.deletes.length, 1);
  assert.equal(r.deletes[0].id, 'a');
  assert.equal(r.upserts.length, 0);
  assert.ok(r.tombstones.some((t) => t.id === 'a'));
});

test('local edit newer than remote delete → record survives', () => {
  const local = { records: [rec('a', now - 50)], tombstones: [] };
  const remote = { records: [], tombstones: [tomb('a', now - 100)] };
  const r = mergeBundles(local, remote, now);
  assert.equal(r.deletes.length, 0);
  assert.equal(r.upserts.length, 0); // local already has the winning record
});

test('tie on timestamp → delete wins', () => {
  const local = { records: [rec('a', now - 100)], tombstones: [] };
  const remote = { records: [], tombstones: [tomb('a', now - 100)] };
  const r = mergeBundles(local, remote, now);
  assert.equal(r.deletes.length, 1);
});

test('old tombstones are GC-ed past the TTL', () => {
  const remote = { records: [], tombstones: [tomb('a', now - 200 * 24 * 3600 * 1000)] };
  const r = mergeBundles(empty, remote, now);
  assert.equal(r.tombstones.length, 0);
});

test('re-sync is idempotent (converged state yields no changes)', () => {
  const state = {
    records: [rec('a', now - 100), rec('b', now - 150)],
    tombstones: [tomb('c', now - 120)],
  };
  const r = mergeBundles(state, state, now);
  assert.equal(r.upserts.length, 0);
  assert.equal(r.deletes.length, 0);
});
