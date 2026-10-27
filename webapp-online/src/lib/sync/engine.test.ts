import { describe, expect, test } from 'vitest';
import { MAX_BATCH, SyncEngine } from './engine';
import type { Cursor, LocalRecord, RecordStore } from '../vault';

type ServerRecord = { record_id: string; collection: string; seq: number; client_updated_at: string; deleted: boolean; ciphertext: string | null; key_version: number };

/** The Sync service's rules in memory (SyncRules, SyncHandlers, SyncService). */
class FakeSync {
  rows = new Map<string, ServerRecord>();
  seq = 0;
  epoch = 0;
  purgedThrough = 0;
  pushes = 0;

  as() {
    return { call: async <T,>(method: string, path: string, body?: any): Promise<T> => this.handle(method, path, body) as T };
  }

  private handle(method: string, path: string, body: any): unknown {
    if (method === 'POST' && path === '/v1/sync/push') {
      if (body.records.length > MAX_BATCH) throw new Error('400 batch too large');
      this.pushes++;
      const stale: string[] = [];
      for (const r of body.records) {
        const key = `${r.collection}/${r.record_id}`;
        const existing = this.rows.get(key);
        this.seq++;
        if (existing && Date.parse(existing.client_updated_at) > Date.parse(r.client_updated_at)) {
          stale.push(r.record_id);
          continue;
        }
        this.rows.set(key, { ...r, seq: this.seq });
      }
      return { accepted: body.records.length - stale.length, stale, last_seq: this.seq };
    }
    const q = new URLSearchParams(path.split('?')[1]);
    const since = Number(q.get('since')), epoch = Number(q.get('epoch')), limit = Number(q.get('limit'));
    if (since > 0 && epoch !== this.epoch && since < this.purgedThrough) {
      return { records: [], last_seq: 0, epoch: this.epoch, more: false, reset_required: true };
    }
    const after = [...this.rows.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq);
    const page = after.slice(0, limit);
    return { records: page, last_seq: page.at(-1)?.seq ?? Math.max(since, this.seq), epoch: this.epoch, more: after.length > limit, reset_required: false };
  }

  /** The 90-day sweep: tombstones go, and cursors from before it need a reset. */
  purgeTombstones() {
    for (const [k, r] of this.rows) if (r.deleted) this.rows.delete(k);
    this.purgedThrough = this.seq;
    this.epoch++;
  }
}

function memoryStore(): RecordStore & { rows: Map<string, LocalRecord> } {
  const rows = new Map<string, LocalRecord>();
  const out = new Map<string, LocalRecord>();
  let cursor: Cursor = { since: 0, epoch: 0 };
  const k = (r: Pick<LocalRecord, 'collection' | 'recordId'>) => `${r.collection}/${r.recordId}`;
  return {
    rows,
    all: async () => [...rows.values()],
    get: async (r) => rows.get(k(r)),
    put: async (r) => { rows.set(k(r), r); return k(r); },
    putMany: async (rs) => { for (const r of rs) rows.set(k(r), r); },
    saveMany: async (rs) => { for (const r of rs) { rows.set(k(r), r); out.set(k(r), r); } },
    clear: async () => { rows.clear(); return undefined; },
    outbox: async () => [...out.values()],
    queue: async (r) => { out.set(k(r), r); return k(r); },
    unqueue: async (r) => { out.delete(k(r)); return undefined; },
    unqueueMany: async (rs) => { for (const r of rs) out.delete(k(r)); },
    cursor: async () => cursor,
    setCursor: async (c) => { cursor = c; return 'cursor'; },
  };
}

let clock = Date.parse('2026-10-23T10:00:00Z');
const tick = () => new Date((clock += 1000)).toISOString();
const rec = (id: string, body: string, deleted = false): LocalRecord => ({
  collection: 'accounts', recordId: id, updatedAt: tick(), deleted, ciphertext: deleted ? null : new TextEncoder().encode(body.padEnd(28, '.')), keyVersion: 1,
});
const text = (r?: LocalRecord) => (r?.ciphertext ? new TextDecoder().decode(r.ciphertext).replace(/\.+$/, '') : r?.deleted ? '<deleted>' : undefined);

describe('SyncEngine', () => {
  test('a change on the laptop reaches the phone', async () => {
    const server = new FakeSync();
    const laptop = new SyncEngine(server.as(), memoryStore());
    const phoneStore = memoryStore();
    const phone = new SyncEngine(server.as(), phoneStore);
    await laptop.save(rec('a1', 'HDFC Savings'));
    expect(await laptop.sync()).toMatchObject({ pushed: 1 });
    expect(await phone.sync()).toMatchObject({ pulled: 1 });
    expect(text(phoneStore.rows.get('accounts/a1'))).toBe('HDFC Savings');
    expect(await laptop.pending()).toBe(0);
  });

  test('both edit the same record: the later edit wins on both devices', async () => {
    const server = new FakeSync();
    const aStore = memoryStore(), bStore = memoryStore();
    const a = new SyncEngine(server.as(), aStore), b = new SyncEngine(server.as(), bStore);
    await a.save(rec('a1', 'v1'));
    await a.sync();
    await b.sync();
    await a.save(rec('a1', 'older edit'));
    await b.save(rec('a1', 'newer edit'));
    await b.sync();
    await a.sync(); // a's edit is stale; the pull brings b's
    await b.sync();
    expect(text(aStore.rows.get('accounts/a1'))).toBe('newer edit');
    expect(text(bStore.rows.get('accounts/a1'))).toBe('newer edit');
    expect(await a.pending()).toBe(0);
  });

  test('an offline change waits in the outbox and goes up later', async () => {
    const server = new FakeSync();
    let online = false;
    const flaky = { call: async <T,>(m: string, p: string, b?: unknown): Promise<T> => { if (!online) throw new TypeError('offline'); return server.as().call<T>(m, p, b); } };
    const store = memoryStore();
    const phone = new SyncEngine(flaky, store);
    await phone.save(rec('t1', 'Coffee 120'));
    await expect(phone.sync()).rejects.toThrow('offline');
    expect(await phone.pending()).toBe(1);
    expect(text(store.rows.get('accounts/t1'))).toBe('Coffee 120');
    online = true;
    await phone.sync();
    expect(await phone.pending()).toBe(0);
    expect(server.rows.has('accounts/t1')).toBe(true);
  });

  test('a deletion travels as a tombstone', async () => {
    const server = new FakeSync();
    const a = new SyncEngine(server.as(), memoryStore());
    const bStore = memoryStore();
    const b = new SyncEngine(server.as(), bStore);
    await a.save(rec('a1', 'Old card'));
    await a.sync();
    await b.sync();
    await a.save(rec('a1', '', true));
    await a.sync();
    await b.sync();
    expect(text(bStore.rows.get('accounts/a1'))).toBe('<deleted>');
    expect(server.rows.get('accounts/a1')!.ciphertext).toBeNull();
  });

  test('more than one page and more than one batch', async () => {
    const server = new FakeSync();
    const a = new SyncEngine(server.as(), memoryStore());
    const bStore = memoryStore();
    const b = new SyncEngine(server.as(), bStore);
    for (let i = 0; i < 1203; i++) await a.save(rec(`r${i}`, `n${i}`));
    await a.sync();
    expect(server.pushes).toBe(3);
    await b.sync();
    expect(bStore.rows.size).toBe(1203);
  });

  test('after tombstones are purged, a device behind the purge resyncs from zero and keeps its unpushed change', async () => {
    const server = new FakeSync();
    const a = new SyncEngine(server.as(), memoryStore());
    const bStore = memoryStore();
    const b = new SyncEngine(server.as(), bStore);
    await a.save(rec('keep', 'stays'));
    await a.save(rec('gone', 'will be deleted'));
    await a.sync();
    await b.sync();
    await a.save(rec('gone', '', true));
    await a.save(rec('more', 'after'));
    await a.sync();
    server.purgeTombstones();
    await b.save(rec('mine', 'offline edit'));
    const report = await b.sync();
    expect(report.reset).toBe(true);
    // b no longer holds the record every other device deleted, and kept its own change.
    expect(bStore.rows.has('accounts/gone')).toBe(false);
    expect(text(bStore.rows.get('accounts/more'))).toBe('after');
    expect(server.rows.has('accounts/mine')).toBe(true);
    expect((await bStore.cursor()).epoch).toBe(server.epoch);
    // And the next sync doesn't reset again (the loop that #35 fixed server-side).
    expect((await b.sync()).reset).toBe(false);
  });

  test('an edit made while a push is in flight is not lost', async () => {
    const server = new FakeSync();
    const store = memoryStore();
    let engine!: SyncEngine;
    const slow = { call: async <T,>(m: string, p: string, body?: unknown): Promise<T> => {
      if (m === 'POST') await engine.save(rec('a1', 'second edit'));
      return server.as().call<T>(m, p, body);
    } };
    engine = new SyncEngine(slow, store);
    await engine.save(rec('a1', 'first edit'));
    await engine.sync();
    expect(await engine.pending()).toBe(1);
    expect(text(store.rows.get('accounts/a1'))).toBe('second edit');
  });
});
