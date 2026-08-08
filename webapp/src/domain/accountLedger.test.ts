import { describe, test, expect } from 'vitest';
import {
  accountBalances, allEntriesBalanced, isBalanced, netWorth,
  netWorthFromAccounts, postingsForEntry, postingsForTransfer,
  liquidBalance, moneyAccounts,
} from './accountLedger';
import type { Account, AccountType, Holding, Posting, Transfer, TxnType } from '@/lib/types';

// Parity fixtures shared with test/unit/account_ledger_test.dart — same inputs,
// same expected numbers on both engines.
const acct = (
  id: string, type: AccountType, subtype = 'x', openingBalance = '0',
): Account => ({ id, vaultId: 'v', name: id, type, subtype, openingBalance });

const entry = (
  id: string, amount: string, type: TxnType, money: string, cat: string,
): Posting[] => postingsForEntry({
  entryId: id, vaultId: 'v', amount, type, moneyAccountId: money, categoryAccountId: cat,
});

const cash = acct('cash', 'asset', 'cash');
const cc = acct('cc', 'liability', 'credit_card');
const groceries = acct('groceries', 'expense', 'expense');
const salary = acct('salary', 'income', 'income');
const fd = acct('fd', 'asset', 'investment');

describe('accountLedger', () => {
  test('a simple entry produces two balanced postings', () => {
    const p = entry('e1', '100', 'expense', 'cash', 'groceries');
    expect(p).toHaveLength(2);
    expect(isBalanced(p)).toBe(true);
  });

  test('expense reduces cash and raises the expense account', () => {
    const p = entry('e1', '100', 'expense', 'cash', 'groceries');
    const b = accountBalances([cash, groceries], p);
    expect(b.get('cash')!.toString()).toBe('-100');
    expect(b.get('groceries')!.toString()).toBe('100');
    expect(netWorthFromAccounts([cash, groceries], p).toString()).toBe('-100');
  });

  test('income raises cash and credits the income account', () => {
    const p = entry('e2', '100', 'income', 'cash', 'salary');
    const b = accountBalances([cash, salary], p);
    expect(b.get('cash')!.toString()).toBe('100');
    expect(b.get('salary')!.toString()).toBe('-100');
    expect(netWorthFromAccounts([cash, salary], p).toString()).toBe('100');
  });

  test('credit-card spend raises the liability without touching cash', () => {
    const p = entry('e3', '100', 'expense', 'cc', 'groceries');
    const b = accountBalances([cash, cc, groceries], p);
    expect(b.get('cash')!.toString()).toBe('0');
    expect(b.get('cc')!.toString()).toBe('-100'); // credit-normal: −100 ⇒ ₹100 owed
    expect(netWorthFromAccounts([cash, cc, groceries], p).toString()).toBe('-100');
  });

  test('moving cash into an investment asset leaves net worth unchanged', () => {
    const p = entry('e4', '1000', 'expense', 'cash', 'fd');
    const b = accountBalances([cash, fd], p);
    expect(b.get('cash')!.toString()).toBe('-1000');
    expect(b.get('fd')!.toString()).toBe('1000');
    expect(netWorthFromAccounts([cash, fd], p).toString()).toBe('0');
  });

  test('opening balances seed net worth (assets up, liabilities down)', () => {
    const cashOpen = acct('cash', 'asset', 'cash', '5000');
    const ccOpen = acct('cc', 'liability', 'credit_card', '2000');
    expect(netWorthFromAccounts([cashOpen, ccOpen], []).toString()).toBe('3000');
  });

  test('net worth adds market-priced holdings without double-counting', () => {
    const h: Holding = {
      id: 'h', vaultId: 'v', symbol: 'X', exchange: 'NSE',
      quantity: '2', avgCost: '100', lastPrice: '250', assetType: 'equity_etf',
    };
    const cashOpen = acct('cash', 'asset', 'cash', '1000');
    expect(netWorth([cashOpen], [], [h]).toString()).toBe('1500');
  });

  test('net worth from accounts equals the legacy signed-sum for a cash vault', () => {
    const p = [
      ...entry('a', '500', 'income', 'cash', 'salary'),
      ...entry('b', '200', 'expense', 'cash', 'groceries'),
    ];
    expect(netWorthFromAccounts([cash, salary, groceries], p).toString()).toBe('300');
  });

  test('allEntriesBalanced flags a tampered ledger', () => {
    const good = entry('a', '500', 'income', 'cash', 'salary');
    expect(allEntriesBalanced(good)).toBe(true);
    const bad: Posting[] = [
      good[0],
      { id: 'a:cr', vaultId: 'v', entryId: 'a', accountId: 'salary', amount: '-400' },
    ];
    expect(allEntriesBalanced(bad)).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('transfers between accounts', () => {
  const from = acct('salary-ac', 'asset', 'bank', '100000');
  const to = acct('fund-ac', 'asset', 'bank', '20000');
  const move = (amount: string): Transfer => ({
    id: 'tr1', vaultId: 'v', amount, fromAccountId: 'salary-ac', toAccountId: 'fund-ac',
    date: 0, createdAt: 0,
  });

  test('debits the destination and credits the source', () => {
    const p = postingsForTransfer(move('25000'));
    expect(isBalanced(p)).toBe(true);
    const b = accountBalances([from, to], p);
    expect(b.get('salary-ac')!.toString()).toBe('75000');
    expect(b.get('fund-ac')!.toString()).toBe('45000');
  });

  test('leaves net worth untouched — moving money is not earning it', () => {
    const before = netWorthFromAccounts([from, to], []);
    const after = netWorthFromAccounts([from, to], postingsForTransfer(move('25000')));
    expect(after.toString()).toBe(before.toString());
    expect(after.toString()).toBe('120000');
  });

  test('never lands in an income or expense account', () => {
    // The whole reason a transfer is not a TxnType: nothing here can be read as
    // spending by code that sums expense accounts.
    const touched = postingsForTransfer(move('25000')).map((p) => p.accountId);
    expect(touched).not.toContain('groceries');
    expect(touched).not.toContain('salary');
  });
});

describe('liquidBalance', () => {
  const bank = acct('b1', 'asset', 'bank', '50000');
  const wallet = acct('w1', 'asset', 'cash', '2000');
  const gold = acct('g1', 'asset', 'manual_asset', '900000');
  const archived: Account = { ...acct('b2', 'asset', 'bank', '7000'), archived: true };

  test('counts bank and cash, and nothing else', () => {
    // A manual asset is real net worth but it is not spendable, and an archived
    // account is not in play at all.
    expect(moneyAccounts([bank, wallet, gold, archived]).map((a) => a.id)).toEqual(['b1', 'w1']);
    expect(liquidBalance([bank, wallet, gold, archived], []).toString()).toBe('52000');
  });

  test('includes opening balances, which summing transactions cannot', () => {
    // The reason the dashboard's cash figure moved to the ledger: money already
    // in the bank was invisible to a sum over transactions.
    const p = entry('e', '3000', 'expense', 'b1', 'groceries');
    expect(liquidBalance([bank, groceries], p).toString()).toBe('47000');
  });
});
