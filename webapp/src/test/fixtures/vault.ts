/**
 * A realistic vault, built the way the app builds one.
 *
 * The integrity suite is only worth anything if its fixtures go through the
 * same posting rules the running app uses — a hand-written posting list can be
 * made to balance by construction and proves nothing. So entries here are
 * turned into postings by `postingsForEntry` / `postingsForTransfer`, the same
 * functions `store.put` calls.
 */
import {
  postingsForEntry, postingsForTransfer,
} from '@/domain/accountLedger';
import type {
  Account, Budget, Holding, HoldingLot, Posting, Transfer, Txn, Category,
} from '@/lib/types';

const VAULT = 'v';
const PROFILE = 'p1';

export const ACCT = {
  bank: 'acct-bank',
  cash: 'acct-cash',
  savings: 'acct-savings',
  card: 'acct-card',
  income: 'acct-income',
  food: 'acct-exp-food',
  rent: 'acct-exp-rent',
  opening: 'acct-opening',
} as const;

export const CAT = { food: 'c-food', rent: 'c-rent', salary: 'c-salary' } as const;

export interface Vault {
  accounts: Account[];
  categories: Category[];
  txns: Txn[];
  transfers: Transfer[];
  postings: Posting[];
  budgets: Budget[];
  holdings: Holding[];
  lots: HoldingLot[];
  /** Entry id → date, for the cash-flow statement. */
  entryDates: Map<string, number>;
}

const account = (
  id: string, name: string, type: Account['type'], opening = '0', subtype?: string,
): Account => ({
  id, vaultId: VAULT, profileId: PROFILE, name, type,
  subtype: subtype ?? (type === 'asset' ? 'bank' : type),
  openingBalance: opening,
});

/**
 * Builds the vault. Dates are supplied by the caller so no test depends on the
 * wall clock — a fixture that says "10 days ago" changes meaning at a month
 * boundary and starts failing on its own.
 */
export function buildVault(now: number): Vault {
  const day = 86_400_000;
  const at = (daysAgo: number) => now - daysAgo * day;

  const accounts: Account[] = [
    account(ACCT.bank, 'HDFC Salary', 'asset', '100000'),
    account(ACCT.cash, 'Cash', 'asset', '2000', 'cash'),
    account(ACCT.savings, 'Emergency Fund', 'asset', '250000'),
    account(ACCT.card, 'HDFC Credit Card', 'liability', '0', 'credit_card'),
    account(ACCT.income, 'Income', 'income'),
    account(ACCT.food, 'Food', 'expense'),
    account(ACCT.rent, 'Rent', 'expense'),
    account(ACCT.opening, 'Opening Balances', 'equity', '0', 'equity'),
  ];

  const categories: Category[] = [
    { id: CAT.food, vaultId: VAULT, name: 'Food' },
    { id: CAT.rent, vaultId: VAULT, name: 'Rent' },
    { id: CAT.salary, vaultId: VAULT, name: 'Salary' },
  ];

  const txn = (
    id: string, amount: string, type: Txn['type'], categoryId: string,
    daysAgo: number, accountId: string,
  ): Txn => ({
    id, vaultId: VAULT, profileId: PROFILE, amount, type, categoryId,
    date: at(daysAgo), createdAt: at(daysAgo), accountId,
  });

  const txns: Txn[] = [
    txn('t-salary-1', '285000', 'income', CAT.salary, 40, ACCT.bank),
    txn('t-salary-2', '285000', 'income', CAT.salary, 10, ACCT.bank),
    txn('t-rent-1', '45000', 'expense', CAT.rent, 38, ACCT.bank),
    txn('t-rent-2', '45000', 'expense', CAT.rent, 8, ACCT.bank),
    txn('t-food-1', '2400', 'expense', CAT.food, 35, ACCT.card),
    txn('t-food-2', '1850', 'expense', CAT.food, 6, ACCT.card),
    txn('t-food-3', '640', 'expense', CAT.food, 2, ACCT.cash),
  ];

  const transfers: Transfer[] = [
    {
      id: 'tr-1', vaultId: VAULT, profileId: PROFILE, amount: '50000',
      fromAccountId: ACCT.bank, toAccountId: ACCT.savings,
      date: at(37), note: 'Emergency top-up', createdAt: at(37),
    },
    {
      id: 'tr-2', vaultId: VAULT, profileId: PROFILE, amount: '4250',
      fromAccountId: ACCT.bank, toAccountId: ACCT.card,
      date: at(5), note: 'Card payment', createdAt: at(5),
    },
  ];

  // The point of the fixture: postings come from the real posting functions.
  const categoryAccount = (t: Txn) =>
    t.type === 'income' ? ACCT.income : t.categoryId === CAT.food ? ACCT.food : ACCT.rent;

  const postings: Posting[] = [
    ...txns.flatMap((t) => postingsForEntry({
      entryId: t.id, vaultId: VAULT, amount: t.amount, type: t.type,
      moneyAccountId: t.accountId!, categoryAccountId: categoryAccount(t),
    })),
    ...transfers.flatMap((t) => postingsForTransfer(t)),
  ];

  const budgets: Budget[] = [
    { id: 'b-food', vaultId: VAULT, profileId: PROFILE, categoryId: CAT.food, amountLimit: '6000', rolloverEnabled: false, alertThresholdPct: 90 },
    { id: 'b-rent', vaultId: VAULT, profileId: PROFILE, categoryId: CAT.rent, amountLimit: '45000', rolloverEnabled: true, alertThresholdPct: 80 },
  ];

  const holdings: Holding[] = [
    {
      id: 'h-infy', vaultId: VAULT, profileId: PROFILE, symbol: 'INFY', exchange: 'NSE',
      quantity: '30', avgCost: '1400', lastPrice: '1580', assetType: 'equity_etf',
      firstPurchaseDate: at(400),
    },
    {
      id: 'h-tcs', vaultId: VAULT, profileId: PROFILE, symbol: 'TCS', exchange: 'NSE',
      quantity: '10', avgCost: '3200', lastPrice: null, assetType: 'equity_etf',
      firstPurchaseDate: at(200),
    },
  ];

  // Two lots make up the INFY position; they must reconcile to the holding.
  const lots: HoldingLot[] = [
    { id: 'l-infy-1', vaultId: VAULT, profileId: PROFILE, holdingId: 'h-infy', quantity: '20', costPerUnit: '1350', purchaseDate: at(400) },
    { id: 'l-infy-2', vaultId: VAULT, profileId: PROFILE, holdingId: 'h-infy', quantity: '10', costPerUnit: '1500', purchaseDate: at(120) },
  ];

  const entryDates = new Map<string, number>([
    ...txns.map((t) => [t.id, t.date] as [string, number]),
    ...transfers.map((t) => [t.id, t.date] as [string, number]),
  ]);

  return { accounts, categories, txns, transfers, postings, budgets, holdings, lots, entryDates };
}
