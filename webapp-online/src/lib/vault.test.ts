import 'fake-indexeddb/auto';
import { expect, test, vi } from 'vitest';
import { DB_NAME, clearSession, loadSession, saveSession } from './vault';

test('the session round-trips through its own database, and clears', async () => {
  expect(DB_NAME).toBe('khazana_online');
  expect(await loadSession()).toBeUndefined();
  await saveSession({ refreshToken: 'r', userId: 'u', deviceId: 'd' });
  expect(await loadSession()).toEqual({ refreshToken: 'r', userId: 'u', deviceId: 'd' });
  await clearSession();
  expect(await loadSession()).toBeUndefined();
});

// A 1,100-row import used to cost one database open per record (two, with the
// outbox). The batched path stores the same records in one transaction.
test('saving a batch opens the database once, not once per record, and is much faster', async () => {
  const { records } = await import('./vault');
  await records.clear();
  for (const r of await records.outbox()) await records.unqueue(r);
  const batch = Array.from({ length: 1100 }, (_, i) => ({
    collection: 'txn', recordId: `r${i}`, updatedAt: '2026-10-27T00:00:00.000Z', deleted: false, ciphertext: new Uint8Array(64), keyVersion: 1,
  }));
  const open = vi.spyOn(indexedDB, 'open');

  const t0 = performance.now();
  for (const r of batch) { await records.put(r); await records.queue(r); }
  const oneByOne = { ms: performance.now() - t0, opens: open.mock.calls.length };

  await records.clear();
  for (const r of await records.outbox()) await records.unqueue(r);
  open.mockClear();
  const t1 = performance.now();
  await records.saveMany(batch);
  const batched = { ms: performance.now() - t1, opens: open.mock.calls.length };

  console.info(`1,100 records: one by one ${oneByOne.opens} opens / ${oneByOne.ms.toFixed(0)} ms; batched ${batched.opens} open / ${batched.ms.toFixed(0)} ms`);
  expect(oneByOne.opens).toBe(2200);
  expect(batched.opens).toBe(1);
  expect(batched.ms).toBeLessThan(oneByOne.ms);
  expect((await records.all()).length).toBe(1100);
  expect((await records.outbox()).length).toBe(1100);
  open.mockRestore();
});
