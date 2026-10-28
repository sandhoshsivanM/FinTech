// Bank and investment linking on the device: the delivery key ring, opening
// sealed payloads, mapping FI data to entities, and the import/revoke flow
// against an in-memory AA service that seals exactly as the server does
// (crypto_box_seal of {payload_id, kind, data}).
import { describe, expect, test } from 'vitest';
import { STORE, type Account, type Holding, type HoldingLot, type Insurance, type Txn } from '@khazana/domain/types';
import { toBase64, utf8 } from '../crypto/bytes';
import { newDek, ready } from '../crypto/e2e';
import type { LocalRecord } from '../vault';
import { AaClient, FI_BUNDLE_KIND, PayloadError, SEALED_ALG, openPayload, type FiBundle, type InboxItem } from './api';
import { DELIVERY_KEYS, ensureDeliveryKey, loadDeliveryKeys } from './deliveryKeys';
import { AA_LINKS, Linker } from './link';
import { aaAccountId, planImport, type Entry, type MapContext } from './mapping';

class MemoryRecords {
  map = new Map<string, LocalRecord>();
  all = async () => [...this.map.values()];
  save = async (rs: LocalRecord[]) => { for (const r of rs) this.map.set(`${r.collection}/${r.recordId}`, r); };
}

const CONSENT = '01930000-0000-7000-8000-000000000001';

function sampleBundle(overrides: Partial<FiBundle> = {}): FiBundle {
  return {
    schema: FI_BUNDLE_KIND, consent_id: CONSENT, fetched_at: '2026-10-28T09:00:00Z', from: '2026-04-01', to: '2026-10-28',
    deposits: [{
      link_ref: 'link-sb-1', fip_id: 'HDFC-FIP', fip_name: 'HDFC Bank', masked_account_number: 'XXXXXXXX6053', account_type: 'SAVINGS',
      ifsc: 'HDFC0000001', currency: 'INR', current_balance: '50000.50', balance_at: '2026-10-28T08:00:00Z',
      transactions: [
        { txn_id: 'T1', type: 'CREDIT', mode: 'NEFT', amount: '85000', balance_after: '90000.50', at: '2026-10-01T04:30:00Z', value_date: '2026-10-01', narration: 'NEFT SALARY ACME LTD', reference: 'N1' },
        { txn_id: 'T2', type: 'DEBIT', mode: 'UPI', amount: '450', balance_after: '89550.50', at: '2026-10-20T02:45:00Z', value_date: '2026-10-20', narration: 'UPI/SWIGGY/311234567890', reference: '311234567890' },
        { txn_id: 'T3', type: 'DEBIT', mode: 'ACH', amount: '39550', balance_after: '50000.50', at: '2026-10-25T02:45:00Z', value_date: '2026-10-25', narration: 'RENT OCT', reference: 'A9' },
      ],
    }],
    term_deposits: [{
      link_ref: 'link-fd-1', fip_id: 'HDFC-FIP', fip_name: 'HDFC Bank', masked_account_number: 'XXXX5566', kind: 'TERM', principal: '200000',
      interest_rate: '7.1', opened_on: '2025-06-01', matures_on: '2027-06-01', maturity_amount: '229400',
      current_value: '213900', monthly_instalment: null,
    }],
    mutual_funds: [{
      link_ref: 'link-mf-1', fip_id: 'CAMS', fip_name: 'CAMS', masked_folio: 'XXXX7788', holdings: [
        { isin: 'INF1', scheme_code: '120503', scheme_name: 'Sample Flexi Cap Fund - Direct Growth', units: '1000', nav: '64.5', nav_date: '2026-10-27', cost_value: '50000', current_value: '64500' },
        { isin: 'INF2', scheme_code: '1', scheme_name: 'Sample Liquid Fund', units: '10', nav: '4000', nav_date: '2026-10-27', cost_value: '39000', current_value: '40000' },
      ],
    }],
    equities: [{ link_ref: 'link-demat-1', fip_id: 'CDSL', fip_name: 'CDSL', masked_demat_id: 'XXXX1201', holdings: [
      { isin: 'INE002A01018', symbol: 'RELIANCE', issuer_name: 'Reliance Industries', exchange: 'NSE', kind: 'EQUITY', units: '10', last_price: '2925', current_value: '29250' },
    ] }],
    nps: [{ link_ref: 'link-nps', fip_id: 'NSDL', fip_name: 'NSDL CRA', masked_pran: 'XXXX3344', tier: 'TIER_I', total_value: '245000.50', as_of: '2026-10-25' }],
    retirement: [{ link_ref: 'link-epf', fip_id: 'EPFO', fip_name: 'EPFO', kind: 'EPF', masked_number: 'XXXX9900', establishment: 'Acme', employee_share: '300000', employer_share: '250000', pension_share: '50000', total_balance: '600000', as_of: '2026-10-01' }],
    insurance: [{ link_ref: 'link-ins', fip_id: 'LIC', fip_name: 'Sample Life', masked_policy_number: 'XXXX4455', policy_type: 'TERM', plan_name: 'Sample Term Plan', sum_assured: '10000000', premium: '1250', premium_frequency: 'MONTHLY', started_on: '2022-01-15', next_premium_due: '2026-11-15', matures_on: '2057-01-15' }],
    ...overrides,
  };
}

const emptyCtx = (over: Partial<MapContext> = {}): MapContext => ({
  vaultId: 'default', profileId: 'default', categories: [{ id: 'cat-food', name: 'Food' }, { id: 'cat-salary', name: 'Salary' }, { id: 'cat-rent', name: 'Rent' }, { id: 'cat-other', name: 'Other' }],
  accounts: [], txns: [], holdings: [], insurances: [], pendingCaptures: [], now: Date.parse('2026-10-28T09:00:00Z'), ...over,
});

const of = <T,>(entries: Entry[], type: string) => entries.filter((e) => e.type === type).map((e) => e.value as unknown as T);

describe('the delivery key ring', () => {
  test('one key is made, stored encrypted under the data key, and found by every device', async () => {
    const dek = newDek();
    const recs = new MemoryRecords();
    let syncs = 0;
    const deps = { dek: () => dek, records: recs, save: recs.save, sync: async () => { syncs++; } };
    const key = await ensureDeliveryKey(deps);
    expect(syncs).toBe(2); // once to look for another device's key, once to send ours
    const again = await ensureDeliveryKey(deps);
    expect(toBase64(again.publicKey)).toBe(toBase64(key.publicKey));

    const [stored] = await recs.all();
    expect(stored.collection).toBe(DELIVERY_KEYS);
    const raw = toBase64(stored.ciphertext!);
    expect(raw).not.toContain(toBase64(key.privateKey));
    expect(new TextDecoder().decode(stored.ciphertext!)).not.toContain(toBase64(key.privateKey));

    // Another device with the same data key and the synced record sees the same key.
    const ring = await loadDeliveryKeys({ dek: () => dek, records: recs });
    expect(ring.map((k) => toBase64(k.privateKey))).toEqual([toBase64(key.privateKey)]);
    // A device with another account's key sees nothing.
    expect(await loadDeliveryKeys({ dek: () => newDek(), records: recs })).toEqual([]);
  });

  test('a record moved under another key id, or a pair that is not a pair, is ignored', async () => {
    const dek = newDek();
    const recs = new MemoryRecords();
    await ensureDeliveryKey({ dek: () => dek, records: recs, save: recs.save });
    const [r] = await recs.all();
    recs.map.set('moved', { ...r, recordId: 'someone-elses-id' });
    recs.map.delete(`${r.collection}/${r.recordId}`);
    expect(await loadDeliveryKeys({ dek: () => dek, records: recs })).toEqual([]);
  });

  test('two devices that each made a key keep both, and agree on the oldest for new consents', async () => {
    const dek = newDek();
    const a = new MemoryRecords();
    const b = new MemoryRecords();
    const first = await ensureDeliveryKey({ dek: () => dek, records: a, save: a.save, now: () => new Date('2026-10-01T00:00:00Z') });
    await ensureDeliveryKey({ dek: () => dek, records: b, save: b.save, now: () => new Date('2026-10-02T00:00:00Z') });
    for (const r of await b.all()) await a.save([r]);
    const ring = await loadDeliveryKeys({ dek: () => dek, records: a });
    expect(ring).toHaveLength(2);
    expect(toBase64(ring[0].publicKey)).toBe(toBase64(first.publicKey));
  });
});

async function seal(item: Omit<InboxItem, 'sealed_payload' | 'alg' | 'kind'> & { kind?: string }, publicKey: Uint8Array, data: unknown, payloadId = item.id): Promise<InboxItem> {
  const s = await ready();
  const kind = item.kind ?? FI_BUNDLE_KIND;
  const sealed = s.crypto_box_seal(utf8(JSON.stringify({ payload_id: payloadId, kind, data })), publicKey);
  return { ...item, kind, alg: SEALED_ALG, sealed_payload: toBase64(sealed) };
}

describe('opening a sealed payload', () => {
  test('opens with a key in the ring, and refuses a payload that names another id or consent', async () => {
    const s = await ready();
    const pair = s.crypto_box_keypair();
    const other = s.crypto_box_keypair();
    const ring = [{ publicKey: other.publicKey, privateKey: other.privateKey, createdAt: 'a' }, { publicKey: pair.publicKey, privateKey: pair.privateKey, createdAt: 'b' }];
    const base = { id: 'p1', consent_id: CONSENT, created_at: '', expires_at: '' };
    const bundle = await openPayload(await seal(base, pair.publicKey, sampleBundle()), ring);
    expect(bundle.deposits[0].current_balance).toBe('50000.50');

    await expect(openPayload(await seal(base, pair.publicKey, sampleBundle(), 'p2'), ring)).rejects.toBeInstanceOf(PayloadError);
    await expect(openPayload(await seal({ ...base, consent_id: 'x' }, pair.publicKey, sampleBundle()), ring)).rejects.toBeInstanceOf(PayloadError);
    await expect(openPayload(await seal(base, s.crypto_box_keypair().publicKey, sampleBundle()), ring)).rejects.toThrow(/No delivery key/);
  });
});

describe('mapping FI data to Khazana entities', () => {
  test('a bank account and its transactions, with the balance matching the bank today', async () => {
    const plan = await planImport(sampleBundle(), emptyCtx());
    const [account] = of<Account>(plan.entries, STORE.account);
    expect(account).toMatchObject({ type: 'asset', subtype: 'bank', name: 'HDFC Bank Savings ··6053', currency: 'INR' });
    expect(account.id).toBe(await aaAccountId('link-sb-1'));
    expect(account.id).not.toContain('6053');
    const txns = of<Txn>(plan.entries, STORE.txn);
    expect(txns).toHaveLength(3);
    expect(txns.every((t) => t.accountId === account.id)).toBe(true);
    const salary = txns.find((t) => t.type === 'income')!;
    expect(salary).toMatchObject({ amount: '85000', categoryId: 'cat-salary' });
    expect(txns.find((t) => t.amount === '450')).toMatchObject({ type: 'expense', categoryId: 'cat-food', note: 'UPI · Ref 311234567890' });
    // opening + 85000 − 450 − 39550 = 50000.50
    expect(account.openingBalance).toBe('5000.5');
    // The account is written before its transactions.
    expect(plan.entries.findIndex((e) => e.type === STORE.account)).toBeLessThan(plan.entries.findIndex((e) => e.type === STORE.txn));
  });

  test('importing again adds nothing new and keeps the user’s edits and names', async () => {
    const first = await planImport(sampleBundle(), emptyCtx());
    const accounts = of<Account>(first.entries, STORE.account).map((a) => ({ ...a, name: 'Salary account' }));
    const txns = of<Txn>(first.entries, STORE.txn);
    const again = await planImport(sampleBundle(), emptyCtx({ accounts, txns }));
    expect(of<Txn>(again.entries, STORE.txn)).toHaveLength(0);
    const [account] = of<Account>(again.entries, STORE.account);
    expect(account.name).toBe('Salary account');
    expect(account.openingBalance).toBe('5000.5');
  });

  test('a payment already captured from SMS and approved is not imported twice', async () => {
    const plan = await planImport(sampleBundle(), emptyCtx({
      pendingCaptures: [{ utr: '311234567890', status: 'approved', postedTxnId: 'txn-from-sms' }],
    }));
    expect(of<Txn>(plan.entries, STORE.txn).map((t) => t.amount)).toEqual(['85000', '39550']);
    expect(plan.counts.skippedDuplicates).toBe(1);
  });

  test('deposits, funds, shares, NPS, EPF and policies become holdings and insurance', async () => {
    const plan = await planImport(sampleBundle(), emptyCtx());
    const holdings = of<Holding>(plan.entries, STORE.holding);
    const byType = (t: string) => holdings.filter((h) => h.assetType === t);
    expect(byType('fd')[0]).toMatchObject({ quantity: '1', avgCost: '200000', lastPrice: '213900', couponRatePct: '7.1', payoutFrequency: 'cumulative' });
    expect(byType('equity_mf')[0]).toMatchObject({ symbol: '120503', quantity: '1000', avgCost: '50', lastPrice: '64.5', exchange: 'AMFI' });
    expect(byType('debt_mf')[0]).toMatchObject({ name: 'Sample Liquid Fund', avgCost: '3900' });
    expect(byType('equity_etf')[0]).toMatchObject({ symbol: 'RELIANCE', quantity: '10', lastPrice: '2925', firstPurchaseDate: null });
    expect(byType('nps')[0]).toMatchObject({ lastPrice: '245000.5' });
    expect(byType('ppf_epf')[0]).toMatchObject({ avgCost: '300000', lastPrice: '600000' });
    // Only the FD has a known purchase date, so only it gets a lot.
    const lots = of<HoldingLot>(plan.entries, STORE.lot);
    expect(lots).toHaveLength(1);
    expect(lots[0].holdingId).toBe(byType('fd')[0].id);
    const [policy] = of<Insurance>(plan.entries, STORE.insurance);
    expect(policy).toMatchObject({ type: 'term', coverAmount: '10000000', premium: '15000', provider: 'Sample Life' });
    expect(plan.counts).toMatchObject({ accounts: 1, txns: 3, holdings: 6, policies: 1 });
  });
});

/** The AA service, in memory: seals to whatever public key a consent was made with. */
class FakeAa {
  consents = new Map<string, { id: string; status: string; key: Uint8Array; fi_types: string[] }>();
  inbox: InboxItem[] = [];
  acked: string[] = [];
  revoked: string[] = [];
  bodies: unknown[] = [];
  n = 0;

  gateway = {
    call: async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
      this.bodies.push(body);
      if (method === 'GET' && path === '/v1/aa/provider') return { provider: 'fake', sample: true, needs_aa_handle: false, fi_types: ['DEPOSIT'] } as T;
      if (method === 'POST' && path === '/v1/aa/consents') {
        const b = body as { fi_types: string[]; delivery_key: string };
        const id = CONSENT;
        this.consents.set(id, { id, status: 'pending', key: Uint8Array.from(atob(b.delivery_key), (c) => c.charCodeAt(0)), fi_types: b.fi_types });
        return this.view(id) as T;
      }
      const consent = path.match(/^\/v1\/aa\/consents\/([^/]+)$/);
      if (consent && method === 'GET') {
        const c = this.consents.get(consent[1])!;
        if (c.status === 'pending') c.status = 'active';
        return this.view(c.id) as T;
      }
      if (consent && method === 'DELETE') { this.revoked.push(consent[1]); return undefined as T; }
      if (method === 'POST' && path === '/v1/aa/fetch') {
        const c = this.consents.get((body as { consent_id: string }).consent_id)!;
        this.inbox.push(await seal({ id: `p${++this.n}`, consent_id: c.id, created_at: '', expires_at: '' }, c.key, sampleBundle()));
        return { saga_id: 's1', state: 'requested', started: true, attempt: 0, error_code: null, last_fetched_at: null } as T;
      }
      if (method === 'GET' && path === '/v1/aa/fetch/s1') return { saga_id: 's1', state: 'sealed', started: false, attempt: 0, error_code: null, last_fetched_at: 'x' } as T;
      if (method === 'GET' && path === '/v1/aa/inbox') return this.inbox.slice(0, 10) as T;
      const ack = path.match(/^\/v1\/aa\/inbox\/([^/]+)\/ack$/);
      if (ack) { this.acked.push(ack[1]); this.inbox = this.inbox.filter((i) => i.id !== ack[1]); return undefined as T; }
      throw new Error(`unexpected ${method} ${path}`);
    },
  };

  view(id: string) {
    const c = this.consents.get(id)!;
    return { id, status: c.status, fi_types: c.fi_types, provider: 'fake', redirect_url: null };
  }
}

function harness() {
  const dek = newDek();
  const recs = new MemoryRecords();
  const aa = new FakeAa();
  const written: Entry[] = [];
  const deleted: { type: string; id: string }[] = [];
  const state = {
    ...emptyCtx(),
    get txns() { return of<Txn>(written, STORE.txn).filter((t) => !deleted.some((d) => d.id === t.id)); },
    putMany: async (entries: Entry[]) => { written.push(...entries); },
    delMany: async (entries: { type: string; id: string }[]) => { deleted.push(...entries); },
  };
  const keyDeps = { dek: () => dek, records: recs, save: recs.save };
  const linker = new Linker({
    aa: new AaClient(aa.gateway), ring: () => loadDeliveryKeys(keyDeps), ensureKey: () => ensureDeliveryKey(keyDeps),
    state: () => state, dek: () => dek, records: recs, save: recs.save, sleep: async () => undefined,
  });
  return { aa, recs, linker, written, deleted, dek };
}

describe('linking, end to end on the device', () => {
  test('consent with the public key only, fetch, open, import, then ack', async () => {
    const { aa, recs, linker, written, dek } = harness();
    const consent = await linker.createConsent(['DEPOSIT']);
    const sent = JSON.stringify(aa.bodies);
    const [keyRecord] = (await recs.all()).filter((r) => r.collection === DELIVERY_KEYS);
    expect(keyRecord).toBeDefined();
    const ring = await loadDeliveryKeys({ dek: () => newDek(), records: recs });
    expect(ring).toEqual([]);
    expect((await linker.waitWhilePending(consent.id)).status).toBe('active');

    const { report } = await linker.refresh(consent.id);
    expect(report).toMatchObject({ payloads: 1, failed: 0, accounts: 1, txns: 3 });
    expect(aa.acked).toEqual(['p1']);
    expect(written.filter((e) => e.type === STORE.txn)).toHaveLength(3);
    const link = (await linker.linkRecords()).get(CONSENT)!;
    expect(link.owned.some((o) => o.type === STORE.account)).toBe(true);
    expect((await recs.all()).some((r) => r.collection === AA_LINKS)).toBe(true);
    // Only a 32-byte public key went to the server, never the private one.
    const priv = (await loadDeliveryKeys({ dek: () => dek, records: recs }))[0].privateKey;
    expect(sent).not.toContain(toBase64(priv));
  });

  test('a payload this device cannot open stays in the inbox, unacked', async () => {
    const { aa, linker } = harness();
    const s = await ready();
    aa.inbox.push(await seal({ id: 'stranger', consent_id: CONSENT, created_at: '', expires_at: '' }, s.crypto_box_keypair().publicKey, sampleBundle()));
    await linker.createConsent(['DEPOSIT']);
    const report = await linker.importInbox();
    expect(report).toMatchObject({ payloads: 0, failed: 1 });
    expect(aa.acked).toEqual([]);
    expect(aa.inbox.map((i) => i.id)).toEqual(['stranger']);
  });

  test('revoking keeps imported data unless asked, and can remove everything the link imported', async () => {
    const { aa, linker, deleted } = harness();
    const consent = await linker.createConsent(['DEPOSIT']);
    await linker.waitWhilePending(consent.id);
    await linker.refresh(consent.id);
    expect(await linker.revoke(consent.id, false)).toBe(0);
    expect(deleted).toEqual([]);
    const removed = await linker.revoke(consent.id, true);
    expect(aa.revoked).toEqual([CONSENT, CONSENT]);
    expect(removed).toBeGreaterThan(3);
    expect(deleted.filter((d) => d.type === STORE.txn)).toHaveLength(3);
    // Transactions go before the account they sit on.
    expect(deleted.findIndex((d) => d.type === STORE.txn)).toBeLessThan(deleted.findIndex((d) => d.type === STORE.account));
    expect((await linker.linkRecords()).has(CONSENT)).toBe(false);
  });
});
