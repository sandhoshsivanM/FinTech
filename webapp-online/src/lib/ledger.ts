// Khazana Online's accounts and transactions, as synced records. Every value
// is encrypted with the account's data key before it is stored or sent
// (record format in crypto/e2e.ts); this module is the only place that sees
// them decrypted.
import { D, ZERO } from '@khazana/domain/money';
import type { TxnType } from '@khazana/domain/types';
import type Decimal from 'decimal.js';
import { decryptRecord, encryptRecord, KEY_VERSION } from './crypto/e2e';
import type { SyncEngine } from './sync/engine';
import type { LocalRecord, RecordStore } from './vault';

export const ACCOUNTS = 'accounts';
export const TRANSACTIONS = 'transactions';

/** The offline app's subtypes, so a later import from a backup maps one to one. */
export type AccountKind = 'bank' | 'cash' | 'credit_card';
export type AccountValue = { name: string; subtype: AccountKind; openingBalance: string };
export type TxnValue = { accountId: string; type: Extract<TxnType, 'expense' | 'income'>; amount: string; date: string; note: string; category: string };

export type Account = AccountValue & { id: string; updatedAt: string };
export type Txn = TxnValue & { id: string; updatedAt: string };
export type Ledger = { accounts: Account[]; transactions: Txn[] };

export const EMPTY: Ledger = { accounts: [], transactions: [] };

/** Decrypts every live record. A record this key can't open is skipped, not fatal. */
export async function readLedger(dek: Uint8Array, records: LocalRecord[]): Promise<Ledger> {
  const ledger: Ledger = { accounts: [], transactions: [] };
  for (const r of records) {
    if (r.deleted || !r.ciphertext) continue;
    const id = { recordId: r.recordId, collection: r.collection, keyVersion: r.keyVersion };
    try {
      if (r.collection === ACCOUNTS) ledger.accounts.push({ ...(await decryptRecord<AccountValue>(dek, id, r.ciphertext)), id: r.recordId, updatedAt: r.updatedAt });
      if (r.collection === TRANSACTIONS) ledger.transactions.push({ ...(await decryptRecord<TxnValue>(dek, id, r.ciphertext)), id: r.recordId, updatedAt: r.updatedAt });
    } catch {
      // Written under another key version, or damaged: leave it out.
    }
  }
  ledger.accounts.sort((a, b) => a.name.localeCompare(b.name));
  ledger.transactions.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  return ledger;
}

/**
 * Bank and cash: what's there (opening + income − expense). Credit card: what's
 * owed (opening + spending − payments), shown as a positive amount owed.
 */
export function balance(account: Account, transactions: Txn[]): Decimal {
  const flow = transactions
    .filter((t) => t.accountId === account.id)
    .reduce((sum, t) => (t.type === 'income' ? sum.plus(D(t.amount)) : sum.minus(D(t.amount))), ZERO);
  return account.subtype === 'credit_card' ? D(account.openingBalance).minus(flow) : D(account.openingBalance).plus(flow);
}

/** Bank and cash minus card dues. */
export function netWorth(ledger: Ledger): Decimal {
  return ledger.accounts.reduce((sum, a) => {
    const b = balance(a, ledger.transactions);
    return a.subtype === 'credit_card' ? sum.minus(b) : sum.plus(b);
  }, ZERO);
}

/** Writes: encrypt, store locally (shown at once), queue for the server. */
export class LedgerWriter {
  constructor(
    private readonly dek: () => Uint8Array,
    private readonly engine: Pick<SyncEngine, 'save'>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async write(collection: string, recordId: string, value: unknown | null): Promise<void> {
    const id = { recordId, collection, keyVersion: KEY_VERSION };
    await this.engine.save({
      collection,
      recordId,
      updatedAt: this.now().toISOString(),
      deleted: value === null,
      ciphertext: value === null ? null : await encryptRecord(this.dek(), id, value),
      keyVersion: KEY_VERSION,
    });
  }

  addAccount = (v: AccountValue) => this.write(ACCOUNTS, crypto.randomUUID(), v);
  updateAccount = (a: Account, v: Partial<AccountValue>) => this.write(ACCOUNTS, a.id, { name: a.name, subtype: a.subtype, openingBalance: a.openingBalance, ...v });
  addTxn = (v: TxnValue) => this.write(TRANSACTIONS, crypto.randomUUID(), v);
  updateTxn = (t: Txn, v: Partial<TxnValue>) => {
    const { id: _id, updatedAt: _at, ...current } = t;
    return this.write(TRANSACTIONS, t.id, { ...current, ...v });
  };
  deleteTxn = (t: Txn) => this.write(TRANSACTIONS, t.id, null);

  /** Deletes the account and its transactions (each a tombstone). */
  async deleteAccount(a: Account, ledger: Ledger): Promise<void> {
    for (const t of ledger.transactions.filter((t) => t.accountId === a.id)) await this.deleteTxn(t);
    await this.write(ACCOUNTS, a.id, null);
  }
}

export type { RecordStore };
