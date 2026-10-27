// One-time migration of the first online data model into the shared entity
// model (the one the offline app's screens read).
//
//   accounts/{AccountValue}      -> account (type asset, or liability for a card)
//   transactions/{TxnValue}      -> txn (categoryId matched or created by name,
//                                   date as epoch ms, `last4` kept as an extension)
//
// Entity ids are the old record ids, so references (accountId) hold and every
// device that migrates produces the same records. Pure: the store writes the
// result and tombstones the old records so other devices converge.
import { categoryIdFor, DEFAULT_CATEGORIES } from '@khazana/domain/vaultWrites';
import type { Account, Category, Txn } from '@khazana/domain/types';
import type { Account as LegacyAccount, Txn as LegacyTxn } from './ledger';

/** A transaction as the online app stores it: the shared Txn plus the bank-alert card digits. */
export type OnlineTxn = Txn & { last4?: string };

export type Migration = {
  accounts: Account[];
  txns: OnlineTxn[];
  /** Categories to create: names used by old transactions that no existing category has. */
  categories: Category[];
};

/** 'YYYY-MM-DD' as local noon (midnight slips a day in some timezones); anything else as written. */
export function dayToMs(day: string, fallback: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12).getTime();
  const t = Date.parse(day);
  return Number.isNaN(t) ? fallback : t;
}

export const msToDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function migrateLegacy(
  legacy: { accounts: LegacyAccount[]; transactions: LegacyTxn[] },
  ctx: { vaultId: string; profileId: string; categories: Category[]; existingAccountIds: Set<string>; existingTxnIds: Set<string> },
): Migration {
  const byName = new Map(ctx.categories.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const created: Category[] = [];
  const categoryFor = (raw: string): string => {
    const name = raw.trim() || 'Other';
    const key = name.toLowerCase();
    const known = byName.get(key);
    if (known) return known;
    // A default name that isn't present yet keeps its default id and icon.
    const def = DEFAULT_CATEGORIES.find((c) => c.name.toLowerCase() === key);
    const cat: Category = { id: categoryIdFor(def?.name ?? name), vaultId: ctx.vaultId, name: def?.name ?? name, icon: def?.icon ?? null };
    byName.set(key, cat.id);
    created.push(cat);
    return cat.id;
  };

  const accounts: Account[] = legacy.accounts
    .filter((a) => !ctx.existingAccountIds.has(a.id))
    .map((a) => ({
      id: a.id, vaultId: ctx.vaultId, profileId: ctx.profileId, name: a.name,
      type: a.subtype === 'credit_card' ? 'liability' : 'asset', subtype: a.subtype, openingBalance: a.openingBalance,
    }));

  const txns: OnlineTxn[] = legacy.transactions
    .filter((t) => !ctx.existingTxnIds.has(t.id))
    .map((t) => {
      const created = Date.parse(t.updatedAt);
      return {
        id: t.id, vaultId: ctx.vaultId, profileId: ctx.profileId, amount: t.amount, type: t.type,
        categoryId: categoryFor(t.category), merchant: null, note: t.note,
        date: dayToMs(t.date, Number.isNaN(created) ? Date.now() : created),
        createdAt: Number.isNaN(created) ? Date.now() : created, accountId: t.accountId,
        ...(t.last4 ? { last4: t.last4 } : {}),
      };
    });

  return { accounts, txns, categories: created };
}
