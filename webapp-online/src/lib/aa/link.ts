// Linking banks and investments through the Account Aggregator, end to end on
// the device: consent → (approval at the AA) → fetch → sealed inbox → open with
// the delivery key → map → write through the store → ack.
//
// Plaintext bank data exists only here, in memory, between opening a payload
// and writing it as encrypted records. The server holds sealed bytes it can't
// open, and deletes them on ack.
import { STORE } from '@khazana/domain/types';
import { own, toBase64, utf8 } from '../crypto/bytes';
import { KEY_VERSION, decryptRecord, encryptRecord } from '../crypto/e2e';
import type { LocalRecord } from '../vault';
import { AaClient, PayloadError, openPayload, type Consent, type FetchView, type ProviderInfo } from './api';
import type { DeliveryKey } from './deliveryKeys';
import { planImport, type Entry, type MapContext } from './mapping';

/** Sync collection: one record per consent, what it imported (for "remove imported data"). */
export const AA_LINKS = 'aa_links';

/** Entries per store write: big enough to be quick, small enough to stay responsive. */
export const WRITE_BATCH = 400;

export type LinkRecord = {
  id: string;
  owned: { type: string; id: string }[];
  lastImportedAt: string | null;
  imported: { accounts: number; txns: number; holdings: number; policies: number };
};

type StoreState = MapContext & {
  putMany: (entries: Entry[]) => Promise<void>;
  delMany: (entries: { type: string; id: string }[]) => Promise<void>;
};

export interface LinkDeps {
  aa: AaClient;
  ring: () => Promise<DeliveryKey[]>;
  ensureKey: () => Promise<DeliveryKey>;
  state: () => StoreState;
  dek: () => Uint8Array;
  records: { all(): Promise<LocalRecord[]> };
  save: (records: LocalRecord[]) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export type ImportReport = { payloads: number; failed: number; accounts: number; txns: number; skippedDuplicates: number; holdings: number; policies: number };

const sleepFor = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function linkRecordId(consentId: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', own(utf8(`aa_link\0${consentId}`))));
  return toBase64(d).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class Linker {
  constructor(private readonly deps: LinkDeps) {}

  private now = () => (this.deps.now ?? Date.now)();
  private sleep = (ms: number) => (this.deps.sleep ?? sleepFor)(ms);

  provider = (): Promise<ProviderInfo> => this.deps.aa.provider();
  consents = (): Promise<Consent[]> => this.deps.aa.list();

  /** Creates the consent with the delivery key's public half. The caller redirects when there is an approval URL. */
  async createConsent(fiTypes: string[], aaHandle?: string): Promise<Consent> {
    const key = await this.deps.ensureKey();
    return this.deps.aa.create({ fiTypes, deliveryPublicKey: key.publicKey, aaHandle });
  }

  /** Polls a consent until it leaves `pending` or the time is up. */
  async waitWhilePending(id: string, timeoutMs = 120_000, cancelled: () => boolean = () => false): Promise<Consent> {
    const until = this.now() + timeoutMs;
    for (;;) {
      const c = await this.deps.aa.get(id);
      if (c.status !== 'pending' || this.now() >= until || cancelled()) return c;
      await this.sleep(2000);
    }
  }

  /** "Refresh now": asks for a fetch, waits for it to be sealed, then imports what is waiting. */
  async refresh(consentId: string, timeoutMs = 180_000): Promise<{ fetch: FetchView; report: ImportReport }> {
    let view = await this.deps.aa.fetch(consentId);
    const until = this.now() + timeoutMs;
    while (view.saga_id && (view.state === 'requested' || view.state === 'fetching') && this.now() < until) {
      await this.sleep(2000);
      view = await this.deps.aa.fetchStatus(view.saga_id);
    }
    return { fetch: view, report: await this.importInbox() };
  }

  /**
   * Imports every payload waiting in the inbox. A payload this device can't
   * open is left there (another device, or a later key sync, may open it) and
   * counted as failed; it is never acked unread.
   */
  async importInbox(): Promise<ImportReport> {
    const report: ImportReport = { payloads: 0, failed: 0, accounts: 0, txns: 0, skippedDuplicates: 0, holdings: 0, policies: 0 };
    const ring = await this.deps.ring();
    const tried = new Set<string>();
    for (;;) {
      const page = (await this.deps.aa.inbox()).filter((i) => !tried.has(i.id));
      if (page.length === 0) return report;
      for (const item of page) {
        tried.add(item.id);
        let bundle;
        try {
          bundle = await openPayload(item, ring);
        } catch (e) {
          if (!(e instanceof PayloadError)) throw e;
          report.failed++;
          continue;
        }
        const plan = await planImport(bundle, { ...this.deps.state(), now: this.now() });
        for (let i = 0; i < plan.entries.length; i += WRITE_BATCH) {
          await this.deps.state().putMany(plan.entries.slice(i, i + WRITE_BATCH));
        }
        await this.recordImport(item.consent_id, plan.owned, plan.counts);
        // Only now, with the data written to this device, may the server forget it.
        await this.deps.aa.ack(item.id);
        report.payloads++;
        report.accounts += plan.counts.accounts;
        report.txns += plan.counts.txns;
        report.skippedDuplicates += plan.counts.skippedDuplicates;
        report.holdings += plan.counts.holdings;
        report.policies += plan.counts.policies;
      }
      // Every item on the page was tried; one that failed stays and is filtered out above.
    }
  }

  /** What each consent imported, by consent id. */
  async linkRecords(): Promise<Map<string, LinkRecord>> {
    const out = new Map<string, LinkRecord>();
    const dek = this.deps.dek();
    for (const r of await this.deps.records.all()) {
      if (r.collection !== AA_LINKS || r.deleted || !r.ciphertext) continue;
      try {
        const v = await decryptRecord<LinkRecord>(dek, { recordId: r.recordId, collection: r.collection, keyVersion: r.keyVersion }, r.ciphertext);
        if (typeof v?.id === 'string' && (await linkRecordId(v.id)) === r.recordId) out.set(v.id, v);
      } catch {
        // Another key version, or damaged: ignored.
      }
    }
    return out;
  }

  private async recordImport(consentId: string, owned: LinkRecord['owned'], counts: LinkRecord['imported']) {
    const prev = (await this.linkRecords()).get(consentId);
    const seen = new Set((prev?.owned ?? []).map((o) => `${o.type}:${o.id}`));
    const merged = [...(prev?.owned ?? [])];
    for (const o of owned) if (!seen.has(`${o.type}:${o.id}`)) merged.push(o);
    const at = new Date(this.now()).toISOString();
    const value: LinkRecord = {
      id: consentId, owned: merged, lastImportedAt: at,
      imported: {
        accounts: Math.max(prev?.imported.accounts ?? 0, counts.accounts), holdings: Math.max(prev?.imported.holdings ?? 0, counts.holdings),
        policies: Math.max(prev?.imported.policies ?? 0, counts.policies), txns: (prev?.imported.txns ?? 0) + counts.txns,
      },
    };
    const recordId = await linkRecordId(consentId);
    const ciphertext = await encryptRecord(this.deps.dek(), { recordId, collection: AA_LINKS, keyVersion: KEY_VERSION }, value);
    await this.deps.save([{ collection: AA_LINKS, recordId, updatedAt: at, deleted: false, ciphertext, keyVersion: KEY_VERSION }]);
  }

  /**
   * Revokes at the server (and through it at the AA). With `removeData`, also
   * deletes what this consent imported: its accounts with every transaction on
   * them, its holdings, lots and policies. Without it, imported data stays.
   */
  async revoke(consentId: string, removeData: boolean): Promise<number> {
    await this.deps.aa.revoke(consentId);
    if (!removeData) return 0;
    const link = (await this.linkRecords()).get(consentId);
    if (!link) return 0;
    const accounts = new Set(link.owned.filter((o) => o.type === STORE.account).map((o) => o.id));
    const txns = this.deps.state().txns.filter((t) => t.accountId && accounts.has(t.accountId)).map((t) => ({ type: STORE.txn, id: t.id }));
    // Children before parents: transactions, lots, then accounts and holdings.
    const order = [STORE.txn, STORE.lot, STORE.insurance, STORE.holding, STORE.account] as string[];
    const all = [...txns, ...link.owned].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
    for (let i = 0; i < all.length; i += WRITE_BATCH) await this.deps.state().delMany(all.slice(i, i + WRITE_BATCH));
    const at = new Date(this.now()).toISOString();
    await this.deps.save([{ collection: AA_LINKS, recordId: await linkRecordId(consentId), updatedAt: at, deleted: true, ciphertext: null, keyVersion: KEY_VERSION }]);
    return all.length;
  }
}
