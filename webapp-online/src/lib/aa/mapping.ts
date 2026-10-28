// FI data (an opened aa.fi-bundle.v1) to Khazana entities, on the device.
//
// - Ids are derived from the AA's stable link reference (and the bank's txn id,
//   the ISIN, …), so importing the same data again updates in place instead of
//   duplicating. The ids carry no account number: only a hash of the link ref.
// - Deposits: one bank Account per linked account, one Txn per transaction.
//   A transaction already in the vault is left as the user last edited it.
//   One whose UTR matches an SMS capture the user already approved is skipped
//   (it is that same payment). The opening balance is set so the account's
//   balance equals what the bank reports today.
// - FD/RD, mutual funds, shares, ETFs, NPS, EPF, PPF: Holdings, refreshed on
//   every import. AA summaries carry no purchase dates, so no lots are invented
//   for funds and shares (a made-up date would misstate short- vs long-term
//   gains); FD and RD get one lot on their opening date.
// - Policies: Insurance, with the premium annualised.
import { D } from '@khazana/domain/money';
import { categoryIdFor } from '@khazana/domain/vaultWrites';
import { guessCategory } from '@khazana/domain/categoryGuess';
import {
  STORE,
  type Account, type AssetType, type Category, type Holding, type HoldingLot, type Insurance, type InsuranceType,
  type PendingCapture, type Txn,
} from '@khazana/domain/types';
import { own, utf8 } from '../crypto/bytes';
import type { FiBundle } from './api';

export type Entry = { type: string; value: { id: string } & Record<string, unknown> };

export interface MapContext {
  vaultId: string;
  profileId: string;
  categories: Pick<Category, 'id' | 'name'>[];
  accounts: Pick<Account, 'id' | 'name'>[];
  txns: Pick<Txn, 'id' | 'accountId' | 'amount' | 'type'>[];
  holdings: Pick<Holding, 'id'>[];
  insurances: Pick<Insurance, 'id' | 'name'>[];
  pendingCaptures: Pick<PendingCapture, 'utr' | 'status' | 'postedTxnId'>[];
  now: number;
}

export type ImportPlan = {
  entries: Entry[];
  /** Entities this consent owns, for "remove imported data" (txns are found by account). */
  owned: { type: string; id: string }[];
  counts: { accounts: number; txns: number; skippedDuplicates: number; holdings: number; policies: number };
};

async function h(...parts: string[]): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', own(utf8(parts.join('\0')))));
  return [...digest.slice(0, 10)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const aaAccountId = (linkRef: string) => h('aa-acct', linkRef).then((x) => `aa-acct-${x}`);
const txnId = (linkRef: string, bankTxnId: string) => h('aa-txn', linkRef, bankTxnId).then((x) => `aa-txn-${x}`);
const holdingId = (linkRef: string, key: string) => h('aa-hold', linkRef, key).then((x) => `aa-hold-${x}`);
const lotId = (holding: string) => h('aa-lot', holding).then((x) => `aa-lot-${x}`);
const policyId = (linkRef: string) => h('aa-ins', linkRef).then((x) => `aa-ins-${x}`);

const ms = (iso: string) => {
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isFinite(t) ? t : 0;
};
const last4 = (masked: string) => masked.replace(/[^0-9A-Za-z]/g, '').slice(-4);
const title = (s: string) => s.toLowerCase().replace(/(^|[\s_])([a-z])/g, (_m, p, c) => `${p === '_' ? ' ' : p}${c.toUpperCase()}`);
/** A valid money string, or '0' (AA amounts are already decimal strings; this guards against junk). */
const money = (s: string | null | undefined) => {
  try { return D(s ?? '0').toString(); } catch { return '0'; }
};

const INSURANCE_TYPE: Record<string, InsuranceType> = { TERM: 'term', HEALTH: 'health', ENDOWMENT: 'life', ULIP: 'life', LIFE: 'life', MOTOR: 'vehicle', HOME: 'home' };
const PER_YEAR: Record<string, number> = { MONTHLY: 12, QUARTERLY: 4, HALF_YEARLY: 2, YEARLY: 1, ANNUAL: 1 };

const DEBT_FUND = /liquid|debt|gilt|bond|money market|overnight|treasury|duration|credit risk|banking and psu|corporate/i;

/** Plans what one bundle writes. Pure apart from hashing; the caller writes `entries` with putMany. */
export async function planImport(bundle: FiBundle, ctx: MapContext): Promise<ImportPlan> {
  const { vaultId, profileId, now } = ctx;
  const entries: Entry[] = [];
  const owned: { type: string; id: string }[] = [];
  const counts = { accounts: 0, txns: 0, skippedDuplicates: 0, holdings: 0, policies: 0 };
  const base = { vaultId, profileId };
  const existingTxns = new Map(ctx.txns.map((t) => [t.id, t]));
  const existingAccounts = new Map(ctx.accounts.map((a) => [a.id, a]));
  const existingPolicies = new Map(ctx.insurances.map((p) => [p.id, p]));
  const approvedUtrs = new Set(
    ctx.pendingCaptures.filter((c) => c.status === 'approved' && c.postedTxnId && c.utr).map((c) => String(c.utr).trim()),
  );
  const byName = new Map(ctx.categories.map((c) => [c.name.toLowerCase(), c.id]));
  const categoryFor = (text: string, kind: 'income' | 'expense') => {
    const name = guessCategory(text, kind) || 'Other';
    return byName.get(name.toLowerCase()) ?? categoryIdFor(name);
  };

  // --- Bank accounts and their transactions ---------------------------------
  for (const d of bundle.deposits) {
    const accountId = await aaAccountId(d.link_ref);
    owned.push({ type: STORE.account, id: accountId });
    let net = D(0);
    // Transactions already on this account (imported before, or added by hand) count towards its balance.
    for (const t of ctx.txns) {
      if (t.accountId !== accountId) continue;
      net = t.type === 'income' ? net.plus(D(t.amount)) : net.minus(D(t.amount));
    }
    const fresh: Entry[] = [];
    for (const t of d.transactions) {
      const id = await txnId(d.link_ref, t.txn_id);
      if (existingTxns.has(id)) continue;
      if (t.reference && approvedUtrs.has(t.reference.trim())) {
        counts.skippedDuplicates++;
        continue;
      }
      const type = t.type === 'CREDIT' ? 'income' : 'expense';
      const amount = money(t.amount);
      net = type === 'income' ? net.plus(D(amount)) : net.minus(D(amount));
      const txn: Txn = {
        id, ...base, amount, type, categoryId: categoryFor(t.narration, type),
        merchant: t.narration.slice(0, 120) || null,
        note: [t.mode !== 'OTHERS' ? t.mode : '', t.reference ? `Ref ${t.reference}` : ''].filter(Boolean).join(' · ') || null,
        date: ms(t.at), createdAt: now, accountId,
      };
      fresh.push({ type: STORE.txn, value: txn as unknown as Entry['value'] });
      counts.txns++;
    }
    // Opening + what the vault records = the bank's balance today.
    const opening = D(money(d.current_balance)).minus(net);
    const account: Account = {
      id: accountId, ...base,
      name: existingAccounts.get(accountId)?.name ?? `${d.fip_name} ${title(d.account_type)} ··${last4(d.masked_account_number)}`,
      type: 'asset', subtype: 'bank', currency: d.currency || 'INR',
      openingBalance: opening.isNegative() ? '0' : opening.toString(),
    };
    // The account first, so its transactions land on a known account.
    entries.push({ type: STORE.account, value: account as unknown as Entry['value'] }, ...fresh);
    counts.accounts++;
  }

  const putHolding = async (holding: Holding, lot?: Omit<HoldingLot, 'id' | 'vaultId' | 'profileId' | 'holdingId'>) => {
    entries.push({ type: STORE.holding, value: holding as unknown as Entry['value'] });
    owned.push({ type: STORE.holding, id: holding.id });
    if (lot) {
      const l: HoldingLot = { id: await lotId(holding.id), ...base, holdingId: holding.id, ...lot };
      entries.push({ type: STORE.lot, value: l as unknown as Entry['value'] });
      owned.push({ type: STORE.lot, id: l.id });
    }
    counts.holdings++;
  };
  const priced = { priceSource: 'import' as const, priceAsOf: ms(bundle.fetched_at), country: 'IN' };

  // --- FD / RD ----------------------------------------------------------------
  for (const t of bundle.term_deposits) {
    const id = await holdingId(t.link_ref, t.kind);
    const principal = money(t.principal);
    await putHolding({
      id, ...base, ...priced, symbol: `${t.kind === 'RECURRING' ? 'RD' : 'FD'}-${last4(t.masked_account_number)}`, exchange: t.fip_name,
      name: `${t.fip_name} ${t.kind === 'RECURRING' ? 'recurring' : 'fixed'} deposit ··${last4(t.masked_account_number)}`,
      quantity: '1', avgCost: principal, lastPrice: money(t.current_value), assetType: 'fd',
      firstPurchaseDate: ms(t.opened_on) || null, couponRatePct: money(t.interest_rate), maturityDate: ms(t.matures_on) || null,
      payoutFrequency: 'cumulative',
    }, ms(t.opened_on) ? { quantity: '1', costPerUnit: principal, purchaseDate: ms(t.opened_on), note: 'From your bank (Account Aggregator)' } : undefined);
  }

  // --- Mutual funds -------------------------------------------------------------
  for (const f of bundle.mutual_funds) {
    for (const m of f.holdings) {
      const units = D(money(m.units));
      if (units.lte(0)) continue;
      const id = await holdingId(f.link_ref, m.isin || m.scheme_code);
      const assetType: AssetType = DEBT_FUND.test(m.scheme_name) ? 'debt_mf' : 'equity_mf';
      await putHolding({
        id, ...base, ...priced, priceAsOf: ms(m.nav_date) || priced.priceAsOf,
        symbol: m.scheme_code || m.isin, exchange: 'AMFI', name: m.scheme_name,
        quantity: units.toString(), avgCost: D(money(m.cost_value)).div(units).toDecimalPlaces(4).toString(),
        lastPrice: money(m.nav), assetType, firstPurchaseDate: null,
      });
    }
  }

  // --- Shares and ETFs ------------------------------------------------------------
  for (const dm of bundle.equities) {
    for (const e of dm.holdings) {
      const units = D(money(e.units));
      if (units.lte(0)) continue;
      const id = await holdingId(dm.link_ref, e.isin || e.symbol);
      // No cost basis in an AA demat summary: cost is the current price until the user records lots.
      await putHolding({
        id, ...base, ...priced, symbol: e.symbol || e.isin, exchange: e.exchange || 'NSE', name: e.issuer_name,
        quantity: units.toString(), avgCost: money(e.last_price), lastPrice: money(e.last_price),
        assetType: /gold/i.test(e.issuer_name) && e.kind === 'ETF' ? 'gold_etf' : 'equity_etf', firstPurchaseDate: null,
      });
    }
  }

  // --- NPS, EPF, PPF --------------------------------------------------------------
  for (const n of bundle.nps) {
    const id = await holdingId(n.link_ref, 'NPS');
    const value = money(n.total_value);
    await putHolding({
      id, ...base, ...priced, priceAsOf: ms(n.as_of) || priced.priceAsOf, symbol: `NPS-${last4(n.masked_pran)}`, exchange: 'NPS',
      name: `NPS ${title(n.tier)} ··${last4(n.masked_pran)}`, quantity: '1', avgCost: value, lastPrice: value, assetType: 'nps',
    });
  }
  for (const r of bundle.retirement) {
    const id = await holdingId(r.link_ref, r.kind);
    const value = money(r.total_balance);
    // EPF's own contributions are its cost; the employer's share and interest are the return.
    const cost = r.kind === 'EPF' && r.employee_share ? money(r.employee_share) : value;
    await putHolding({
      id, ...base, ...priced, priceAsOf: ms(r.as_of) || priced.priceAsOf, symbol: `${r.kind}-${last4(r.masked_number)}`, exchange: r.kind,
      name: r.kind === 'EPF' ? `EPF${r.establishment ? ` · ${r.establishment}` : ''} ··${last4(r.masked_number)}` : `PPF · ${r.fip_name} ··${last4(r.masked_number)}`,
      quantity: '1', avgCost: cost, lastPrice: value, assetType: 'ppf_epf',
    });
  }

  // --- Insurance ------------------------------------------------------------------
  for (const p of bundle.insurance) {
    const id = await policyId(p.link_ref);
    const perYear = PER_YEAR[p.premium_frequency] ?? 1;
    const policy: Insurance = {
      id, ...base, name: existingPolicies.get(id)?.name ?? p.plan_name, type: INSURANCE_TYPE[p.policy_type] ?? 'other',
      provider: p.fip_name, coverAmount: money(p.sum_assured), premium: D(money(p.premium)).times(perYear).toString(),
      renewalDate: p.next_premium_due ? ms(p.next_premium_due) : null,
    };
    entries.push({ type: STORE.insurance, value: policy as unknown as Entry['value'] });
    owned.push({ type: STORE.insurance, id });
    counts.policies++;
  }

  return { entries, owned, counts };
}
