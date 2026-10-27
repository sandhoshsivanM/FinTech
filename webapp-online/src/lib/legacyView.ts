// The first online screens (home, account, cards) were written against a small
// ledger shape: accounts {name, subtype, openingBalance}, transactions with an
// ISO day and a free-text category. This presents the shared store in that
// shape and turns those screens' writes into shared-store writes, so they keep
// working unchanged on top of it. Pure apart from the writer's calls.
import { categoryIdFor, DEFAULT_CATEGORIES, cashAcctId } from '@khazana/domain/vaultWrites';
import type { Account as Entity, Category } from '@khazana/domain/types';
import type { AppStore } from './appStore';
import type { Account, AccountKind, AccountValue, CardValue, CreditCard, Ledger, Txn, TxnValue } from './ledger';
import { dayToMs, msToDay, type OnlineTxn } from './migrate';

const KINDS: readonly string[] = ['bank', 'cash', 'credit_card'];
const isViewAccount = (a: Entity) =>
  !a.archived && KINDS.includes(a.subtype) && (a.type === 'asset' || a.type === 'liability') && a.id !== cashAcctId(a.profileId ?? '');

export function ledgerView(s: { accounts: Entity[]; txns: OnlineTxn[]; categories: Category[]; cards: CreditCard[] }): Ledger {
  const accounts: Account[] = s.accounts.filter(isViewAccount)
    .map((a) => ({ id: a.id, name: a.name, subtype: a.subtype as AccountKind, openingBalance: a.openingBalance, updatedAt: '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const ids = new Set(accounts.map((a) => a.id));
  const names = new Map(s.categories.map((c) => [c.id, c.name]));
  const transactions: Txn[] = s.txns
    .filter((t) => t.accountId && ids.has(t.accountId) && (t.type === 'expense' || t.type === 'income'))
    .map((t) => ({
      id: t.id, accountId: t.accountId!, type: t.type as 'expense' | 'income', amount: t.amount, date: msToDay(t.date),
      note: t.note ?? '', category: names.get(t.categoryId) ?? 'Other', ...(t.last4 ? { last4: t.last4 } : {}),
      updatedAt: new Date(t.updatedAt ?? t.createdAt).toISOString(),
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  return { accounts, transactions, cards: s.cards };
}

/** The old `LedgerWriter` surface, over the shared store. */
export function legacyWriter(app: AppStore, uid: () => string = () => crypto.randomUUID()) {
  const st = () => app.getState();
  const accountEntity = (id: string, v: AccountValue): Entity => ({
    id, vaultId: st().vaultId, profileId: st().activeProfileId || undefined, name: v.name,
    type: v.subtype === 'credit_card' ? 'liability' : 'asset', subtype: v.subtype, openingBalance: v.openingBalance,
  });

  /** The category id for a free-text name: matched by name, else created (default names keep their default id). */
  function categoryFor(name: string): { id: string; create?: Category } {
    const clean = name.trim() || 'Other';
    const hit = st().categories.find((c) => c.name.toLowerCase() === clean.toLowerCase());
    if (hit) return { id: hit.id };
    const def = DEFAULT_CATEGORIES.find((c) => c.name.toLowerCase() === clean.toLowerCase());
    const cat: Category = { id: categoryIdFor(def?.name ?? clean), vaultId: st().vaultId, name: def?.name ?? clean, icon: def?.icon ?? null };
    return { id: cat.id, create: cat };
  }

  async function saveTxn(entity: OnlineTxn, category: string) {
    const c = categoryFor(category);
    await st().putMany([
      ...(c.create ? [{ type: 'category', value: c.create as unknown as { id: string } & Record<string, unknown> }] : []),
      { type: 'txn', value: { ...entity, categoryId: c.id } as unknown as { id: string } & Record<string, unknown> },
    ]);
  }

  const writer = {
    addAccount: (v: AccountValue) => st().put('account', accountEntity(uid(), v) as unknown as { id: string } & Record<string, unknown>),
    updateAccount: (a: Account, v: Partial<AccountValue>) =>
      st().put('account', accountEntity(a.id, { name: a.name, subtype: a.subtype, openingBalance: a.openingBalance, ...v }) as unknown as { id: string } & Record<string, unknown>),
    addTxn: (v: TxnValue) => {
      const t = Date.now();
      return saveTxn({
        id: uid(), vaultId: st().vaultId, profileId: st().activeProfileId || undefined, amount: v.amount, type: v.type,
        categoryId: '', merchant: null, note: v.note, date: dayToMs(v.date, t), createdAt: t, accountId: v.accountId,
        ...(v.last4 ? { last4: v.last4 } : {}),
      }, v.category);
    },
    updateTxn: (t: Txn, v: Partial<TxnValue>) => {
      const current = st().txns.find((x) => x.id === t.id);
      if (!current) return Promise.resolve();
      const next = { ...t, ...v };
      const { last4: _old, ...base } = current;
      return saveTxn({
        ...base, accountId: next.accountId, type: next.type, amount: next.amount, note: next.note,
        date: v.date !== undefined ? dayToMs(v.date, current.date) : current.date, updatedAt: Date.now(),
        ...(next.last4 ? { last4: next.last4 } : {}),
      }, next.category);
    },
    deleteTxn: (t: Txn) => st().del('txn', t.id),
    /** Deletes the account and its transactions. */
    deleteAccount: (a: Account, ledger: Ledger) =>
      st().delMany([...ledger.transactions.filter((t) => t.accountId === a.id).map((t) => ({ type: 'txn', id: t.id })), { type: 'account', id: a.id }]),
    addCard: (v: CardValue) => st().putCard(v),
    updateCard: (c: CreditCard, v: CardValue) => st().putCard({ ...v, id: c.id }),
    deleteCard: (c: CreditCard) => st().deleteCard(c.id),
  };
  return writer;
}
