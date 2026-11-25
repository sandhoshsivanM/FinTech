// The reload's read cache: an unchanged record keeps its object (so memoised
// screens skip work), and nothing else ever comes out of it — not a changed
// record, not a tampered one, not one read under a different session key.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { EncRecord } from './db';

const rows: EncRecord[] = [];

vi.mock('./db', () => ({
  db: {
    records: {
      where: () => ({
        equals: ([type, vaultId]: [string, string]) => ({
          toArray: async () => rows.filter((r) => r.type === type && r.vaultId === vaultId),
        }),
      }),
    },
  },
}));

const { listRecordsShared, listRecords, clearReadCache } = await import('./repo');
const { encryptJson } = await import('./crypto');

const newKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

async function put(key: CryptoKey, id: string, value: unknown) {
  const enc = await encryptJson(key, value);
  const at = rows.findIndex((r) => r.id === `txn:${id}`);
  const row = { id: `txn:${id}`, type: 'txn', vaultId: 'v', enc } as EncRecord;
  if (at >= 0) rows[at] = row; else rows.push(row);
}

beforeEach(() => {
  rows.length = 0;
  clearReadCache();
});

describe('listRecordsShared', () => {
  test('an unchanged record comes back as the same object', async () => {
    const key = await newKey();
    await put(key, 'a', { id: 'a', amount: '10' });
    await put(key, 'b', { id: 'b', amount: '20' });
    const first = await listRecordsShared<{ id: string }>(key, 'txn', 'v');
    const second = await listRecordsShared<{ id: string }>(key, 'txn', 'v');
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
  });

  test('a rewritten record is decrypted again; the others keep their identity', async () => {
    const key = await newKey();
    await put(key, 'a', { id: 'a', amount: '10' });
    await put(key, 'b', { id: 'b', amount: '20' });
    const first = await listRecordsShared<{ id: string; amount: string }>(key, 'txn', 'v');
    await put(key, 'b', { id: 'b', amount: '25' });
    const second = await listRecordsShared<{ id: string; amount: string }>(key, 'txn', 'v');
    expect(second[0]).toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
    expect(second[1].amount).toBe('25');
  });

  test('a tampered row with the same IV is never served from the cache', async () => {
    const key = await newKey();
    await put(key, 'a', { id: 'a' });
    await listRecordsShared(key, 'txn', 'v');
    const ct = rows[0].enc.ct;
    const flipped = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);
    rows[0] = { ...rows[0], enc: { iv: rows[0].enc.iv, ct: flipped } };
    const failures: { type: string; id: string }[] = [];
    const out = await listRecordsShared(key, 'txn', 'v', failures);
    expect(out).toEqual([]);
    expect(failures).toEqual([{ type: 'txn', id: 'txn:a' }]);
  });

  test('a different session key never sees cached plaintext', async () => {
    const key = await newKey();
    const other = await newKey();
    await put(key, 'a', { id: 'a' });
    await listRecordsShared(key, 'txn', 'v');
    const failures: { type: string; id: string }[] = [];
    expect(await listRecordsShared(other, 'txn', 'v', failures)).toEqual([]);
    expect(failures).toHaveLength(1);
  });

  test('clearReadCache drops every cached value', async () => {
    const key = await newKey();
    await put(key, 'a', { id: 'a' });
    const first = await listRecordsShared(key, 'txn', 'v');
    clearReadCache();
    const second = await listRecordsShared(key, 'txn', 'v');
    expect(second[0]).not.toBe(first[0]);
    expect(second[0]).toEqual(first[0]);
  });
});

describe('listRecords (parallel decrypt)', () => {
  test('keeps row order and reports each unreadable row once', async () => {
    const key = await newKey();
    for (const id of ['a', 'b', 'c']) await put(key, id, { id });
    rows[1] = { ...rows[1], enc: { iv: rows[1].enc.iv, ct: rows[0].enc.ct } };
    const failures: { type: string; id: string }[] = [];
    const out = await listRecords<{ id: string }>(key, 'txn', 'v', failures);
    expect(out.map((r) => r.id)).toEqual(['a', 'c']);
    expect(failures).toEqual([{ type: 'txn', id: 'txn:b' }]);
  });
});
