// Test plumbing only (never imported by the app): an in-memory record store and
// a fake sync server that enforces the real server's rules (SyncRules.cs), so
// tests of two "devices" exercise the actual SyncEngine.
import { newDek } from '../crypto/e2e';
import { createAppStore, type AppDeps } from '../appStore';
import type { Cursor, LocalRecord, RecordStore } from '../vault';
import { SyncEngine } from './engine';

const key = (r: Pick<LocalRecord, 'collection' | 'recordId'>) => `${r.collection}/${r.recordId}`;

type Ref = Pick<LocalRecord, 'collection' | 'recordId'>;

export function memoryRecords(): RecordStore {
  const records = new Map<string, LocalRecord>();
  const outbox = new Map<string, LocalRecord>();
  let cursor: Cursor = { since: 0, epoch: 0 };
  return {
    all: async () => [...records.values()],
    get: async (r: Ref) => records.get(key(r)),
    put: async (r: LocalRecord) => void records.set(key(r), r),
    putMany: async (rs: LocalRecord[]) => void rs.forEach((r) => records.set(key(r), r)),
    saveMany: async (rs: LocalRecord[]) => void rs.forEach((r) => { records.set(key(r), r); outbox.set(key(r), r); }),
    clear: async () => void records.clear(),
    outbox: async () => [...outbox.values()],
    queue: async (r: LocalRecord) => void outbox.set(key(r), r),
    unqueue: async (r: LocalRecord) => void outbox.delete(key(r)),
    unqueueMany: async (rs: LocalRecord[]) => void rs.forEach((r) => outbox.delete(key(r))),
    cursor: async () => cursor,
    setCursor: async (c: Cursor) => void (cursor = c),
  } as unknown as RecordStore;
}

type Row = { record_id: string; collection: string; seq: number; client_updated_at: string; deleted: boolean; ciphertext: string | null; key_version: number };

/** One user's server: ordered rows, last-write-wins on client_updated_at, the real validation rules. */
export class FakeServer {
  rows = new Map<string, Row>(); // by record_id: the primary key is (user, record_id)
  seq = 0;
  pushes = 0;
  clock = () => Date.now();

  gatewayFor() {
    return { call: async <T,>(method: string, path: string, body?: unknown): Promise<T> => this.handle(method, path, body) as T };
  }

  private handle(method: string, path: string, body?: unknown): unknown {
    if (method === 'POST' && path === '/v1/sync/push') return this.push((body as { records: Row[] & Record<string, unknown>[] }).records);
    if (method === 'GET' && path.startsWith('/v1/sync/pull')) {
      const q = new URL(path, 'http://x').searchParams;
      const since = Number(q.get('since')), limit = Number(q.get('limit'));
      const after = [...this.rows.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq);
      const records = after.slice(0, limit);
      return { records, last_seq: records.length ? records[records.length - 1].seq : since, epoch: 0, more: after.length > limit, reset_required: false };
    }
    throw new Error(`unexpected ${method} ${path}`);
  }

  private push(records: Record<string, unknown>[]) {
    this.pushes++;
    if (records.length < 1 || records.length > 500) throw new Error('400 a push holds 1 to 500 records');
    const seen = new Set<string>();
    for (const r of records) {
      const id = r.record_id as string;
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error(`400 bad record id ${id}`);
      if (!/^[a-z][a-z0-9_]{0,31}$/.test(r.collection as string)) throw new Error(`400 bad collection ${String(r.collection)}`);
      if (seen.has(id)) throw new Error('400 duplicate record id in batch');
      seen.add(id);
      if (Date.parse(r.client_updated_at as string) > this.clock() + 5 * 60_000) throw new Error('400 future timestamp');
      if (!r.deleted) {
        const bytes = Math.floor(((r.ciphertext as string).replace(/=+$/, '').length * 3) / 4);
        if (bytes < 28) throw new Error('400 ciphertext too short');
        if (bytes > 64 * 1024) throw new Error('400 record too large');
      }
      // (user, record_id) is the key: an id reused under another collection would silently replace it.
      const have = this.rows.get(id);
      if (have && have.collection !== r.collection) throw new Error(`409 record id ${id} already used in ${have.collection}`);
    }
    let accepted = 0;
    const stale: string[] = [];
    for (const r of records) {
      const have = this.rows.get(r.record_id as string);
      if (have && Date.parse(have.client_updated_at) >= Date.parse(r.client_updated_at as string)) { stale.push(r.record_id as string); continue; }
      this.rows.set(r.record_id as string, { ...(r as unknown as Row), seq: ++this.seq });
      accepted++;
    }
    return { accepted, stale, last_seq: this.seq };
  }
}

export function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

export type TestDevice = ReturnType<typeof device>;

/** A device: its own record store and clock, the shared data key, an engine against the fake server. */
export function device(server: FakeServer, dek: Uint8Array, opts: { clock?: { t: number }; deps?: Partial<AppDeps> } = {}) {
  const clock = opts.clock ?? { t: Date.parse('2026-10-27T10:00:00Z') };
  const records = memoryRecords();
  const engine = new SyncEngine(server.gatewayFor(), records);
  const now = () => (clock.t += 1000);
  let n = 0;
  const app = createAppStore({
    dek: () => dek, engine, records, now, uid: () => `id-${Math.random().toString(36).slice(2, 10)}-${n++}`,
    storage: memoryStorage(), ...opts.deps,
  });
  return { app, engine, records, clock, sync: async () => { const r = await engine.sync(); await app.getState().reload(); return r; } };
}

export const newTestDek = newDek;
