// The offline store's pure write logic (webapp/src/lib/store.ts), ported so any
// store can run it over any storage: which records a `put` must write, how the
// double-entry postings are derived, how a recurring rule posts, how a snapshot
// is built. No storage, no network, no clock (callers pass `now` and `uid`).
//
// Postings are DERIVED. `derivePostings` recomputes them from transactions and
// transfers; a store that syncs records should sync everything except postings.
import Decimal from 'decimal.js';
import { D, ZERO } from './money';
import {
  PROFILE_SCOPED, STORE, isSpending,
  type Account, type Budget, type Category, type Goal, type Holding, type ImportBatch, type Insurance,
  type Liability, type NetWorthSnapshot, type Posting, type Profile, type RecurringRule, type Transfer, type Txn,
} from './types';
import { advance, materialize } from './recurrence';
import { liquidBalance, postingsForEntry, postingsForTransfer } from './accountLedger';
import { healthScore } from './health';
import { investmentTotals } from './investmentTotals';

export type Mutation =
  | { op: 'put'; type: string; id: string; value: unknown }
  | { op: 'delete'; type: string; id: string };

export type EntityValue = { id: string } & Record<string, unknown>;

export const DEFAULT_VAULT_ID = 'default';
export const DEFAULT_PROFILE_ID = 'default';

export const DEFAULT_CATEGORIES: { name: string; icon: string }[] = [
  { name: 'Food', icon: 'Utensils' },
  { name: 'Transport', icon: 'Bus' },
  { name: 'Rent', icon: 'Home' },
  { name: 'Utilities', icon: 'Zap' },
  { name: 'Shopping', icon: 'ShoppingBag' },
  { name: 'Health', icon: 'HeartPulse' },
  { name: 'Entertainment', icon: 'Clapperboard' },
  { name: 'EMI', icon: 'Landmark' },
  { name: 'Salary', icon: 'Wallet' },
  { name: 'Investment', icon: 'TrendingUp' },
  { name: 'Other', icon: 'Shapes' },
];

/**
 * A category id derived from its name. The offline app mints random ids for its
 * defaults; devices that sync must agree on them or every new device would seed
 * a second "Food".
 */
export const categoryIdFor = (name: string) =>
  `cat-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x'}`;

export function defaultCategories(vaultId = DEFAULT_VAULT_ID): Category[] {
  return DEFAULT_CATEGORIES.map((c) => ({ id: categoryIdFor(c.name), vaultId, name: c.name, icon: c.icon }));
}

export function defaultProfile(now: number, vaultId = DEFAULT_VAULT_ID): Profile {
  return { id: DEFAULT_PROFILE_ID, vaultId, name: 'Personal', kind: 'self', createdAt: now };
}

// Deterministic account ids, as the offline app and the Flutter migration use.
export const cashAcctId = (profileId: string) => `acct-cash-${profileId}`;
export const openingAcctId = (profileId: string) => `acct-opening-${profileId}`;
export const incomeAcctId = (profileId: string) => `acct-income-${profileId}`;
export const investAcctId = (profileId: string) => `acct-investments-${profileId}`;
export const expenseAcctId = (profileId: string, categoryId: string) => `acct-exp-${profileId}-${categoryId}`;

/** The accounts every profile has before it has recorded anything. */
export function structuralAccounts(vaultId: string, profileId: string): Account[] {
  const base = { vaultId, profileId, openingBalance: '0' };
  return [
    { ...base, id: cashAcctId(profileId), name: 'Cash', type: 'asset', subtype: 'cash' },
    { ...base, id: openingAcctId(profileId), name: 'Opening Balances', type: 'equity', subtype: 'equity' },
    { ...base, id: incomeAcctId(profileId), name: 'Income', type: 'income', subtype: 'income' },
    { ...base, id: investAcctId(profileId), name: 'Investments', type: 'asset', subtype: 'investment' },
  ];
}

export const expenseAccount = (vaultId: string, profileId: string, categoryId: string, name: string): Account => ({
  id: expenseAcctId(profileId, categoryId), vaultId, profileId, name, type: 'expense', subtype: 'expense', openingBalance: '0',
});

/** The non-money side of an entry (§3.2). */
export function contraAccountFor(profileId: string, t: Pick<Txn, 'type' | 'categoryId'>): string {
  if (t.type === 'income') return incomeAcctId(profileId);
  if (t.type === 'investment') return investAcctId(profileId);
  return expenseAcctId(profileId, t.categoryId);
}

/** Account puts an entry needs that `existing` doesn't hold yet. Mutates `existing`. */
export function entryAccountMutations(
  vaultId: string, profileId: string, t: Pick<Txn, 'type' | 'categoryId'>,
  categoryNames: Map<string, string>, existing: Set<string>,
): Mutation[] {
  const out: Mutation[] = [];
  for (const a of structuralAccounts(vaultId, profileId)) {
    if (existing.has(a.id)) continue;
    existing.add(a.id);
    out.push({ op: 'put', type: STORE.account, id: a.id, value: a });
  }
  const exp = expenseAcctId(profileId, t.categoryId);
  if (isSpending(t.type) && !existing.has(exp)) {
    existing.add(exp);
    out.push({ op: 'put', type: STORE.account, id: exp, value: expenseAccount(vaultId, profileId, t.categoryId, categoryNames.get(t.categoryId) ?? 'Expense') });
  }
  return out;
}

export const inProfile = <T extends { profileId?: string }>(r: T, active: string, defaultId: string) =>
  (r.profileId ?? defaultId) === active;

/** Postings for one transaction (ids `<id>:dr` / `<id>:cr`), tagged with its profile. */
export function postingsForTxn(vaultId: string, profileId: string, t: Txn): Posting[] {
  return postingsForEntry({
    entryId: t.id, vaultId, amount: t.amount, type: t.type,
    moneyAccountId: t.accountId ?? cashAcctId(profileId),
    categoryAccountId: contraAccountFor(profileId, t),
  }).map((leg) => ({ ...leg, profileId }));
}

export const postingsForTransferIn = (profileId: string, t: Transfer): Posting[] =>
  postingsForTransfer(t).map((leg) => ({ ...leg, profileId }));

/**
 * Every posting the ledger should hold, recomputed from transactions and
 * transfers. An id used by both a Txn and a Transfer belongs to the Transfer's
 * kind only if the Txn is absent (the later write supersedes; see
 * `supersedeMutations`), so a leftover pair never doubles the legs.
 */
export function derivePostings(input: {
  vaultId: string; txns: Txn[]; transfers: Transfer[]; defaultProfileId: string;
}): Posting[] {
  const out: Posting[] = [];
  const txnIds = new Set(input.txns.map((t) => t.id));
  for (const t of input.txns) out.push(...postingsForTxn(input.vaultId, t.profileId ?? input.defaultProfileId, t));
  for (const t of input.transfers) {
    if (txnIds.has(t.id)) continue;
    out.push(...postingsForTransferIn(t.profileId ?? input.defaultProfileId, t));
  }
  return out;
}

/** Accounts the given entries need that don't exist yet (chart-of-accounts repair after a merge). */
export function missingAccountMutations(input: {
  vaultId: string; txns: Txn[]; profiles: Profile[]; categories: Category[]; accounts: Account[];
}): Mutation[] {
  const existing = new Set(input.accounts.map((a) => a.id));
  const names = new Map(input.categories.map((c) => [c.id, c.name]));
  const fallback = input.profiles[0]?.id ?? DEFAULT_PROFILE_ID;
  const out: Mutation[] = [];
  for (const t of input.txns) out.push(...entryAccountMutations(input.vaultId, t.profileId ?? fallback, t, names, existing));
  for (const p of input.profiles) {
    for (const a of structuralAccounts(input.vaultId, p.id)) {
      if (existing.has(a.id)) continue;
      existing.add(a.id);
      out.push({ op: 'put', type: STORE.account, id: a.id, value: a });
    }
  }
  return out;
}

/**
 * Removes a record of the *other* entry kind that already holds this id, so
 * switching a transaction to a transfer retires the old record.
 */
export function supersedeMutations(
  state: { txns: Txn[]; transfers: Transfer[] }, writing: string, id: string,
): Mutation[] {
  const other = writing === STORE.txn ? STORE.transfer : STORE.txn;
  const exists = other === STORE.transfer
    ? state.transfers.some((t) => t.id === id)
    : state.txns.some((t) => t.id === id);
  return exists ? [{ op: 'delete', type: other, id }] : [];
}

export interface WriteState {
  vaultId: string;
  activeProfileId: string;
  txns: Txn[];
  transfers: Transfer[];
  categories: Category[];
}

/**
 * Everything one `put` must write (records only; postings are derived).
 * Mirrors the offline `entryMutations`: profile default, `accountId ?? cash`,
 * supersede, and the accounts a transaction needs.
 */
export function entryMutations(
  state: WriteState, type: string, value: EntityValue, existing: Set<string>,
): Mutation[] {
  const { vaultId, activeProfileId } = state;
  const needsProfile = PROFILE_SCOPED.includes(type) && !value.profileId;
  const profileId = (value.profileId as string | undefined) ?? activeProfileId;
  const record = needsProfile ? { ...value, profileId } : value;

  if (type === STORE.txn) {
    const withAccount = { ...record, accountId: (value.accountId as string | undefined) ?? cashAcctId(profileId) };
    return [
      ...supersedeMutations(state, STORE.txn, value.id),
      { op: 'put', type, id: value.id, value: withAccount },
      ...entryAccountMutations(vaultId, profileId, withAccount as unknown as Txn,
        new Map(state.categories.map((c) => [c.id, c.name])), existing),
    ];
  }
  if (type === STORE.transfer) {
    return [
      ...supersedeMutations(state, STORE.transfer, value.id),
      { op: 'put', type, id: value.id, value: record },
    ];
  }
  return [{ op: 'put', type, id: value.id, value: record }];
}

/** Deleting a transaction also drops the receipt it points at. */
export function deleteMutations(state: { txns: Txn[] }, type: string, id: string): Mutation[] {
  const out: Mutation[] = [{ op: 'delete', type, id }];
  if (type === STORE.txn) {
    const ref = state.txns.find((t) => t.id === id)?.attachmentRef;
    if (ref) out.push({ op: 'delete', type: STORE.attachment, id: ref });
  }
  return out;
}

/** Moves every transaction on one account to another. */
export function reassignMutations(
  state: { vaultId: string; activeProfileId: string; txns: Txn[]; categories: Category[]; accounts: Account[] },
  fromAccountId: string, toAccountId: string,
): { mutations: Mutation[]; moved: number } {
  if (fromAccountId === toAccountId) return { mutations: [], moved: 0 };
  const moving = state.txns.filter((t) => (t.accountId ?? fromAccountId) === fromAccountId);
  const names = new Map(state.categories.map((c) => [c.id, c.name]));
  const existing = new Set(state.accounts.map((a) => a.id));
  const mutations: Mutation[] = [];
  for (const t of moving) {
    const next = { ...t, accountId: toAccountId };
    mutations.push({ op: 'put', type: STORE.txn, id: t.id, value: next });
    mutations.push(...entryAccountMutations(state.vaultId, t.profileId ?? state.activeProfileId, next, names, existing));
  }
  return { mutations, moved: moving.length };
}

function recurringTxn(
  rule: RecurringRule, when: number, amount: string,
  ctx: { vaultId: string; profileId: string; now: number; uid: () => string },
): Txn {
  return {
    id: ctx.uid(), vaultId: ctx.vaultId, profileId: ctx.profileId, amount, type: rule.type,
    categoryId: rule.categoryId, merchant: rule.merchant ?? null,
    note: 'Recurring', date: when, createdAt: ctx.now,
    accountId: rule.accountId ?? cashAcctId(ctx.profileId),
  };
}

/** Every due occurrence of every rule, and the rules advanced. */
export function processRecurringPlan(
  state: { vaultId: string; activeProfileId: string; recurring: RecurringRule[]; categories: Category[]; accounts: Account[] },
  ctx: { now: number; uid: () => string },
): { mutations: Mutation[]; created: number } {
  const names = new Map(state.categories.map((c) => [c.id, c.name]));
  const existing = new Set(state.accounts.map((a) => a.id));
  const mutations: Mutation[] = [];
  let created = 0;
  for (const rule of state.recurring) {
    const { runs, nextRun } = materialize(rule);
    for (const when of runs) {
      const t = recurringTxn(rule, when, rule.amount, { ...ctx, vaultId: state.vaultId, profileId: state.activeProfileId });
      mutations.push({ op: 'put', type: STORE.txn, id: t.id, value: t });
      mutations.push(...entryAccountMutations(state.vaultId, state.activeProfileId, t, names, existing));
      created++;
    }
    if (runs.length > 0) mutations.push({ op: 'put', type: STORE.recurring, id: rule.id, value: { ...rule, nextRun } });
  }
  return { mutations, created };
}

/**
 * ONE occurrence of ONE rule. Advances from the SCHEDULED date, never the date
 * it was posted on, so a late salary doesn't drag every future one with it.
 */
export function postRecurringOncePlan(
  state: { vaultId: string; activeProfileId: string; recurring: RecurringRule[]; categories: Category[]; accounts: Account[] },
  ruleId: string, opts: { date?: number; amount?: string } | undefined, ctx: { now: number; uid: () => string },
): Mutation[] | null {
  const rule = state.recurring.find((r) => r.id === ruleId);
  if (!rule) return null;
  const names = new Map(state.categories.map((c) => [c.id, c.name]));
  const existing = new Set(state.accounts.map((a) => a.id));
  const t = recurringTxn(rule, opts?.date ?? rule.nextRun, opts?.amount ?? rule.amount,
    { ...ctx, vaultId: state.vaultId, profileId: state.activeProfileId });
  return [
    { op: 'put', type: STORE.txn, id: t.id, value: t },
    ...entryAccountMutations(state.vaultId, state.activeProfileId, t, names, existing),
    { op: 'put', type: STORE.recurring, id: rule.id, value: { ...rule, nextRun: advance(rule.nextRun, rule.frequency) } },
  ];
}

/** Reversing an import: delete what the run created, keep the batch marked undone. */
export function undoImportBatchPlan(
  batch: ImportBatch, postings: Posting[],
): { mutations: Mutation[]; removed: number } | null {
  if (batch.undone) return null;
  const mutations: Mutation[] = batch.created.map((r) => ({ op: 'delete', type: r.type, id: r.id }));
  const gone = new Set(batch.created.map((r) => r.id));
  const removed = batch.created.length + postings.filter((p) => gone.has(p.entryId)).length;
  mutations.push({ op: 'put', type: STORE.importBatch, id: batch.id, value: { ...batch, undone: true } });
  return { mutations, removed };
}

/** Today's net-worth snapshot for a profile, from the ledger (opening balances included). */
export function buildSnapshot(input: {
  vaultId: string; profileId: string; now: number;
  txns: Txn[]; holdings: Holding[]; liabilities: Liability[]; goals: Goal[]; insurances: Insurance[];
  budgets: Budget[]; snapshots: NetWorthSnapshot[]; accounts: Account[]; postings: Posting[];
}): NetWorthSnapshot {
  const day = new Date(input.now).toISOString().slice(0, 10);
  const investments = investmentTotals(input.holdings);
  const cash = liquidBalance(input.accounts, input.postings);
  const liab = input.liabilities.reduce((s, l) => s.plus(D(l.principal)), ZERO);
  const health = healthScore({
    txns: input.txns, investments, liabilities: input.liabilities, goals: input.goals,
    insurances: input.insurances, budgets: input.budgets, snapshots: input.snapshots, cash,
  });
  return {
    id: `snap-${input.profileId}-${day}`, vaultId: input.vaultId, profileId: input.profileId, date: input.now,
    netWorth: cash.plus(investments.marketValue).minus(liab).toString(),
    cash: cash.toString(), investments: investments.marketValue.toString(), liabilities: liab.toString(),
    healthScore: health.score,
    healthTrackedWeight: health.score === null ? null : Math.round(health.trackedWeight),
  };
}

/** A goal linked to an account reports that account's balance. */
export function linkGoalBalances(goals: Goal[], balances: Map<string, Decimal>): Goal[] {
  return goals.map((g) => (
    g.accountId && balances.has(g.accountId)
      ? { ...g, currentAmount: Decimal.max(ZERO, balances.get(g.accountId)!).toString() }
      : g
  ));
}
