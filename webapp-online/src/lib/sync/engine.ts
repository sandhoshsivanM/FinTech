// Encrypted sync (ADR 0006). The server stores ciphertext by sequence number
// and never merges; this engine does the rest:
// - Local changes go to an outbox and are pushed in batches (≤ 500).
// - Pulls page through everything after the cursor {since, epoch}.
// - Last write wins on client_updated_at. A change the server already has a
//   newer version of comes back as "stale": the pull brings the newer one.
// - A deletion is a tombstone (no ciphertext).
// - reset_required (tombstones were purged since our cursor): drop the local
//   copy, keep the outbox, and resync from zero with the new epoch.
import { fromBase64, toBase64 } from '../crypto/bytes';
import type { Cursor, LocalRecord, RecordStore } from '../vault';

type Gateway = { call<T>(method: string, path: string, body?: unknown): Promise<T> };

type PushResult = { accepted: number; stale: string[]; last_seq: number };
type PulledRecord = {
  record_id: string; collection: string; seq: number; client_updated_at: string;
  deleted: boolean; ciphertext: string | null; key_version: number;
};
type PullPage = { records: PulledRecord[]; last_seq: number; epoch: number; more: boolean; reset_required: boolean };

export const MAX_BATCH = 500;

export type SyncReport = { pushed: number; pulled: number; reset: boolean };

export class SyncEngine {
  constructor(private readonly gateway: Gateway, private readonly store: RecordStore) {}

  /** A local change: stored at once (so the app shows it) and queued for the server. */
  async save(record: LocalRecord): Promise<void> {
    await this.store.put(record);
    await this.store.queue(record);
  }

  /** Many local changes in one transaction (an import): atomic, and one database open instead of one per record. */
  async saveMany(records: LocalRecord[]): Promise<void> {
    await this.store.saveMany(records);
  }

  async pending(): Promise<number> {
    return (await this.store.outbox()).length;
  }

  async sync(): Promise<SyncReport> {
    const pushed = await this.push();
    const { pulled, reset } = await this.pull();
    return { pushed, pulled, reset };
  }

  private async push(): Promise<number> {
    const outbox = await this.store.outbox();
    for (let i = 0; i < outbox.length; i += MAX_BATCH) {
      const batch = outbox.slice(i, i + MAX_BATCH);
      await this.gateway.call<PushResult>('POST', '/v1/sync/push', {
        records: batch.map((r) => ({
          record_id: r.recordId,
          collection: r.collection,
          client_updated_at: r.updatedAt,
          deleted: r.deleted,
          ciphertext: r.deleted || !r.ciphertext ? null : toBase64(r.ciphertext),
          key_version: r.keyVersion,
        })),
      });
      // Accepted or stale, the server has dealt with it: a stale one loses to
      // the newer version the pull is about to bring. Only drop what wasn't
      // edited again while the push was in flight.
      const current = await this.store.outbox();
      const byKey = new Map(current.map((r) => [`${r.collection}/${r.recordId}`, r]));
      await this.store.unqueueMany(batch.filter((sent) => byKey.get(`${sent.collection}/${sent.recordId}`)?.updatedAt === sent.updatedAt));
    }
    return outbox.length;
  }

  private async pull(): Promise<{ pulled: number; reset: boolean }> {
    let cursor: Cursor = await this.store.cursor();
    let pulled = 0;
    let reset = false;
    for (;;) {
      const page = await this.gateway.call<PullPage>('GET', `/v1/sync/pull?since=${cursor.since}&epoch=${cursor.epoch}&limit=${MAX_BATCH}`);
      if (page.reset_required) {
        if (reset) throw new Error('The server asked for a second reset in one sync.');
        reset = true;
        await this.store.clear();
        cursor = { since: 0, epoch: page.epoch };
        await this.store.setCursor(cursor);
        continue;
      }
      const outbox = await this.store.outbox();
      const queuedByKey = new Map(outbox.map((q) => [`${q.collection}/${q.recordId}`, q]));
      const incomingRecords: LocalRecord[] = [];
      for (const r of page.records) {
        const incoming: LocalRecord = {
          collection: r.collection,
          recordId: r.record_id,
          updatedAt: r.client_updated_at,
          deleted: r.deleted,
          ciphertext: r.deleted || !r.ciphertext ? null : fromBase64(r.ciphertext),
          keyVersion: r.key_version,
        };
        // A newer local change not yet pushed wins (it goes up next sync).
        const queued = queuedByKey.get(`${incoming.collection}/${incoming.recordId}`);
        if (queued && Date.parse(queued.updatedAt) >= Date.parse(incoming.updatedAt)) continue;
        incomingRecords.push(incoming);
        pulled++;
      }
      await this.store.putMany(incomingRecords);
      cursor = { since: page.last_seq, epoch: page.epoch };
      await this.store.setCursor(cursor);
      if (!page.more) return { pulled, reset };
    }
  }
}
