'use client';
import { putRecord, clearVault } from './repo';
import { STORE, type Category } from './types';
import { useApp, uid } from './store';

const now = Date.now();
const daysAgo = (n: number) => now - n * 86400000;

export async function loadSampleData() {
  const s = useApp.getState();
  const { key, vaultId } = s;
  if (!key) return;
  // Idempotent: wipe any existing records (incl. previous sample loads) so
  // repeated clicks don't stack duplicates. Categories are re-seeded by reload().
  await clearVault(vaultId);
  await s.reload();
  const cats = useApp.getState().categories;
  const cat = (name: string): string =>
    (cats.find((c) => c.name === name) ?? cats[0]).id as string;

  const put = (type: string, value: { id: string } & Record<string, unknown>) =>
    putRecord(key, type, vaultId, value.id, value);

  const txn = (amount: string, type: 'expense' | 'income', category: string, dAgo: number, merchant?: string) =>
    put(STORE.txn, { id: uid(), vaultId, amount, type, categoryId: cat(category), merchant, note: 'Sample', date: daysAgo(dAgo), createdAt: now });

  const tasks: Promise<unknown>[] = [];

  // Income.
  tasks.push(txn('2400000', 'income', 'Salary', 95, 'Opening balance'));
  for (const d of [60, 30, 1]) tasks.push(txn('90000', 'income', 'Salary', d, 'Employer'));
  // Recurring-style expenses.
  for (const d of [62, 32, 2]) {
    tasks.push(txn('25000', 'expense', 'Rent', d, 'Landlord'));
    tasks.push(txn('1240', 'expense', 'Utilities', d, 'Electricity'));
    tasks.push(txn('649', 'expense', 'Entertainment', d, 'Netflix'));
  }
  const spends: [string, string, number, string][] = [
    ['120', 'Food', 0, 'Coffee'], ['450', 'Food', 0, 'Swiggy'], ['280', 'Transport', 1, 'Uber'],
    ['1899', 'Shopping', 3, 'Amazon'], ['650', 'Food', 4, 'BigBasket'], ['320', 'Transport', 6, 'Ola'],
    ['1200', 'Health', 9, 'Pharmacy'], ['540', 'Entertainment', 12, 'BookMyShow'], ['2300', 'Shopping', 18, 'Myntra'],
    ['760', 'Food', 22, 'Zomato'], ['430', 'Transport', 27, 'Fuel'], ['980', 'Food', 40, 'Restaurant'],
    ['1500', 'Shopping', 52, 'Decathlon'], ['600', 'Health', 70, 'Clinic'],
  ];
  for (const [a, c, d, m] of spends) tasks.push(txn(a, 'expense', c, d, m));

  // Holdings.
  const hold = (symbol: string, qty: string, avg: string, last: string, assetType: string, dAgo: number) =>
    put(STORE.holding, { id: uid(), vaultId, symbol, exchange: 'NSE', quantity: qty, avgCost: avg, lastPrice: last, assetType, firstPurchaseDate: daysAgo(dAgo) });
  tasks.push(hold('NIFTYBEES', '800', '235.10', '286.40', 'equity_etf', 400));
  tasks.push(hold('GOLDBEES', '500', '53.20', '62.80', 'gold_etf', 300));
  tasks.push(hold('RELIANCE', '60', '2250.00', '2645.00', 'equity_etf', 250));
  tasks.push(hold('INFY', '120', '1480.00', '1695.00', 'equity_etf', 500));
  tasks.push(hold('SBIN', '200', '560.00', '612.00', 'equity_etf', 180));

  // Liabilities.
  tasks.push(put(STORE.liability, { id: uid(), vaultId, name: 'HDFC Credit Card', kind: 'credit_card', principal: '45000', aprPct: '42', creditLimit: '120000' }));
  tasks.push(put(STORE.liability, { id: uid(), vaultId, name: 'Personal Loan', kind: 'loan', principal: '230000', aprPct: '11.5', termMonths: 36 }));

  // Budgets.
  const budget = (category: string, limit: string) =>
    put(STORE.budget, { id: uid(), vaultId, categoryId: cat(category), amountLimit: limit, rolloverEnabled: false, alertThresholdPct: 90 });
  tasks.push(budget('Food', '8000'));
  tasks.push(budget('Transport', '3000'));
  tasks.push(budget('Shopping', '5000'));
  tasks.push(budget('Entertainment', '2000'));

  // Goals.
  tasks.push(put(STORE.goal, { id: uid(), vaultId, name: 'Emergency Fund', goalType: 'emergency_fund', targetAmount: '300000', currentAmount: '120000' }));
  tasks.push(put(STORE.goal, { id: uid(), vaultId, name: 'Goa Vacation', goalType: 'vacation', targetAmount: '150000', currentAmount: '45000', targetDate: now + 200 * 86400000 }));

  // Recurring bills.
  const bill = (amount: string, category: string, merchant: string, inDays: number) =>
    put(STORE.recurring, { id: uid(), vaultId, amount, type: 'expense', categoryId: cat(category), merchant, frequency: 'monthly', nextRun: now + inDays * 86400000 });
  tasks.push(bill('45000', 'EMI', 'HDFC Credit Card', 3));
  tasks.push(bill('649', 'Entertainment', 'Netflix', 5));
  tasks.push(bill('1240', 'Utilities', 'Electricity Bill', 9));

  await Promise.all(tasks);
  await useApp.getState().reload();
}
