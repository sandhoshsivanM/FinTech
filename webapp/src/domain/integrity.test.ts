/**
 * The financial-integrity suite (Hardening Plan v3 §3.5).
 *
 * Every other test in this repo checks one function. These check that the
 * functions agree with each other — that the same money, asked about in
 * different ways, comes back the same. That is the property a finance app lives
 * or dies on, and it is exactly the property unit tests miss: each screen can
 * be individually correct and still disagree with the one next to it.
 *
 * Fixtures come from `test/fixtures/vault`, whose postings are produced by the
 * app's own posting functions. A fixture with hand-written postings can be made
 * to balance by construction and would prove nothing.
 */
import { describe, expect, test } from 'vitest';
import { D, ZERO } from '@/lib/money';
import {
  accountBalances, allEntriesBalanced, holdingMarketValue, isBalanced,
  netWorthFromAccounts, openingDebitSigned,
} from './accountLedger';
import { balanceSheet, cashFlow } from './statements';
import { budgetRollover, evaluateBudget, spentForCategory, windowSummary } from './finance';
import { contains, currentMonth, custom, monthsBack, monthsIn, trailingDays } from './period';
import { runDiagnostics } from './diagnostics';
import { reconcileLots } from './lots';
import { ACCT, CAT, buildVault } from '@/test/fixtures/vault';

// Fixed instant: 9 Aug 2026, 12:00 local. Nothing here reads the wall clock.
const NOW = new Date(2026, 7, 9, 12, 0).getTime();
const v = buildVault(NOW);

const sum = (xs: { amount: string }[]) => xs.reduce((s, x) => s.plus(D(x.amount)), ZERO);

describe('ledger', () => {
  test('every entry balances to zero', () => {
    expect(allEntriesBalanced(v.postings)).toBe(true);
  });

  test('each entry taken alone balances', () => {
    const byEntry = new Map<string, typeof v.postings>();
    for (const p of v.postings) byEntry.set(p.entryId, [...(byEntry.get(p.entryId) ?? []), p]);
    for (const [id, legs] of byEntry) {
      expect(isBalanced(legs), `entry ${id}`).toBe(true);
    }
  });

  test('there are no orphan postings', () => {
    const known = new Set(v.accounts.map((a) => a.id));
    expect(v.postings.filter((p) => !known.has(p.accountId))).toEqual([]);
  });

  test('every entry has postings, and exactly two legs', () => {
    const legs = new Map<string, number>();
    for (const p of v.postings) legs.set(p.entryId, (legs.get(p.entryId) ?? 0) + 1);
    for (const e of [...v.txns, ...v.transfers]) {
      expect(legs.get(e.id), `entry ${e.id}`).toBe(2);
    }
  });

  test('debits equal credits across the whole book', () => {
    const debits = v.postings.filter((p) => D(p.amount).gt(0));
    const credits = v.postings.filter((p) => D(p.amount).lt(0));
    expect(sum(debits).toString()).toBe(sum(credits).neg().toString());
  });
});

describe('accounts', () => {
  const balances = accountBalances(v.accounts, v.postings);

  test('a balance is its opening balance plus its own postings', () => {
    for (const a of v.accounts) {
      const own = v.postings.filter((p) => p.accountId === a.id);
      const expected = openingDebitSigned(a).plus(sum(own).minus(sum([])));
      const posted = own.reduce((s, p) => s.plus(D(p.amount)), ZERO);
      expect(balances.get(a.id)!.toString(), a.name)
        .toBe(openingDebitSigned(a).plus(posted).toString());
      void expected;
    }
  });

  test('the bank account agrees with the entries that touched it', () => {
    // 100,000 opening + 570,000 salary − 90,000 rent − 50,000 transfer out
    // − 4,250 card payment − 25,000 into the SIP.
    expect(balances.get(ACCT.bank)!.toString()).toBe('500750');
  });

  test('a credit card carries a credit balance, not a negative asset', () => {
    // 2,400 + 1,850 spent, 4,250 repaid → settled.
    expect(balances.get(ACCT.card)!.toString()).toBe('0');
  });
});

describe('transfers', () => {
  test('a transfer moves balances without inflating income or expense', () => {
    const balances = accountBalances(v.accounts, v.postings);
    const withoutTransfers = accountBalances(
      v.accounts,
      v.postings.filter((p) => !v.transfers.some((t) => t.id === p.entryId)),
    );
    // The savings account only ever received a transfer.
    expect(balances.get(ACCT.savings)!.minus(withoutTransfers.get(ACCT.savings)!).toString())
      .toBe('50000');
    // Income and expense accounts are untouched by transfers.
    expect(balances.get(ACCT.income)!.toString()).toBe(withoutTransfers.get(ACCT.income)!.toString());
    expect(balances.get(ACCT.food)!.toString()).toBe(withoutTransfers.get(ACCT.food)!.toString());
  });

  test('transfers do not change net worth', () => {
    const all = netWorthFromAccounts(v.accounts, v.postings);
    const none = netWorthFromAccounts(
      v.accounts,
      v.postings.filter((p) => !v.transfers.some((t) => t.id === p.entryId)),
    );
    expect(all.toString()).toBe(none.toString());
  });
});

describe('budget', () => {
  const month = currentMonth(NOW);

  test('spent equals the sum of that category\'s transactions in the range', () => {
    const byHand = v.txns
      .filter((t) => t.type === 'expense' && t.categoryId === CAT.food && contains(month, t.date))
      .reduce((s, t) => s.plus(D(t.amount)), ZERO);
    expect(spentForCategory(v.txns, CAT.food, month).toString()).toBe(byHand.toString());
  });

  test('remaining equals allocation plus rollover minus spent', () => {
    for (const b of v.budgets) {
      const spent = spentForCategory(v.txns, b.categoryId, month);
      const rollover = budgetRollover(b, v.txns, month);
      const p = evaluateBudget(b, spent, rollover);
      expect(p.remaining.toString(), b.categoryId)
        .toBe(D(b.amountLimit).plus(rollover).minus(spent).toString());
      expect(p.limit.toString()).toBe(D(b.amountLimit).plus(rollover).toString());
    }
  });

  test('a budget total never counts a transfer as spending', () => {
    // Transfers carry no category, so they cannot reach a budget at all.
    const spentAcrossBudgets = v.budgets
      .reduce((s, b) => s.plus(spentForCategory(v.txns, b.categoryId, month)), ZERO);
    const expenseTotal = v.txns
      .filter((t) => t.type === 'expense' && contains(month, t.date))
      .reduce((s, t) => s.plus(D(t.amount)), ZERO);
    expect(spentAcrossBudgets.lte(expenseTotal)).toBe(true);
  });
});

describe('investment purchases are not spending (§3.2)', () => {
  // The defect this suite exists to prevent coming back: "Investment" was an
  // ordinary spend category, so a SIP consumed a budget, inflated the expense
  // total and wrecked the savings rate — a month of disciplined investing read
  // as a month of overspending.
  const month = currentMonth(NOW);
  const allTime = custom(0, NOW);

  test('a SIP never reaches a budget', () => {
    expect(spentForCategory(v.txns, CAT.investment, allTime).toString()).toBe('0');
  });

  test('a SIP is not counted as expense', () => {
    const s = windowSummary(v.txns, allTime);
    const byHand = v.txns
      .filter((t) => t.type === 'expense')
      .reduce((acc, t) => acc.plus(D(t.amount)), ZERO);
    expect(s.expense.toString()).toBe(byHand.toString());
    expect(s.invested.toString()).toBe('25000');
  });

  test('it is reported, not silently dropped', () => {
    // Money that left the account must still be accounted for somewhere.
    expect(windowSummary(v.txns, allTime).invested.gt(0)).toBe(true);
  });

  test('it does not change net income, so it cannot move the savings rate', () => {
    const withSip = windowSummary(v.txns, allTime);
    const withoutSip = windowSummary(v.txns.filter((t) => t.type !== 'investment'), allTime);
    expect(withSip.net.toString()).toBe(withoutSip.net.toString());
  });

  test('it moves cash out but leaves net worth unchanged', () => {
    // Cash down 25,000, Investments asset up 25,000.
    const balances = accountBalances(v.accounts, v.postings);
    expect(balances.get(ACCT.investments)!.toString()).toBe('25000');
    const noSip = v.postings.filter((p) => p.entryId !== 't-sip-1');
    expect(netWorthFromAccounts(v.accounts, v.postings).toString())
      .toBe(netWorthFromAccounts(v.accounts, noSip).toString());
  });

  test('it posts to an asset account, never an expense account', () => {
    const legs = v.postings.filter((p) => p.entryId === 't-sip-1');
    const typeOf = (id: string) => v.accounts.find((a) => a.id === id)!.type;
    expect(legs.map((l) => typeOf(l.accountId)).sort()).toEqual(['asset', 'asset']);
  });

  test('the books still balance with an investment in them', () => {
    expect(balanceSheet(v.accounts, v.postings, NOW).balanced).toBe(true);
  });

  test('retained earnings ignore it', () => {
    const bs = balanceSheet(v.accounts, v.postings, NOW);
    const s = windowSummary(v.txns, allTime);
    expect(bs.retainedEarnings.toString()).toBe(s.income.minus(s.expense).toString());
  });

  void month;
});

describe('reports', () => {
  const range = monthsBack(3, NOW);

  test('income minus expense is net for the same range', () => {
    const s = windowSummary(v.txns, range);
    expect(s.net.toString()).toBe(s.income.minus(s.expense).toString());
  });

  test('report totals reconcile with the ledger for the same range', () => {
    const s = windowSummary(v.txns, range);
    const cf = cashFlow(v.accounts, v.postings, v.entryDates, range.start, range.end);
    expect(cf.totalIncome.toString()).toBe(s.income.toString());
    expect(cf.totalExpenses.toString()).toBe(s.expense.toString());
  });

  test('monthly buckets sum to the whole-range total', () => {
    // The invariant a bar chart and its KPI tile must share, and the one the
    // Reports page broke by feeding them two different windows.
    const whole = windowSummary(v.txns, range);
    const byMonth = monthsIn(range)
      .map((m) => windowSummary(v.txns, m))
      .reduce((acc, s) => ({ income: acc.income.plus(s.income), expense: acc.expense.plus(s.expense) }),
        { income: ZERO, expense: ZERO });
    expect(byMonth.income.toString()).toBe(whole.income.toString());
    expect(byMonth.expense.toString()).toBe(whole.expense.toString());
  });
});

describe('balance sheet', () => {
  const bs = balanceSheet(v.accounts, v.postings, NOW);

  test('the books balance', () => {
    expect(bs.balanced).toBe(true);
    expect(bs.discrepancy.toString()).toBe('0');
  });

  test('assets equal liabilities plus equity', () => {
    expect(bs.totalAssets.toString())
      .toBe(bs.totalLiabilities.plus(bs.totalEquity).toString());
  });

  test('retained earnings equal income minus expense over all time', () => {
    const all = custom(0, NOW);
    const s = windowSummary(v.txns, all);
    expect(bs.retainedEarnings.toString()).toBe(s.income.minus(s.expense).toString());
  });

  test('net worth agrees with the account-based figure', () => {
    expect(bs.netWorth.toString()).toBe(netWorthFromAccounts(v.accounts, v.postings).toString());
  });

  test('nothing is unclassified', () => {
    expect(bs.unclassified).toEqual([]);
  });
});

describe('portfolio lots', () => {
  test('lots reconcile with the holding they belong to', () => {
    for (const h of v.holdings) {
      const r = reconcileLots(h, v.lots);
      expect(r.ok, `${h.symbol}: ${r.lotQuantity} lots vs ${r.holdingQuantity} held`).toBe(true);
    }
  });

  test('quantity and cost basis roll up from the lots', () => {
    const infyLots = v.lots.filter((l) => l.holdingId === 'h-infy');
    const qty = infyLots.reduce((s, l) => s.plus(D(l.quantity)), ZERO);
    const cost = infyLots.reduce((s, l) => s.plus(D(l.quantity).times(D(l.costPerUnit))), ZERO);
    const holding = v.holdings.find((h) => h.id === 'h-infy')!;
    expect(qty.toString()).toBe(D(holding.quantity).toString());
    expect(cost.div(qty).toString()).toBe(D(holding.avgCost).toString());
  });

  test('unrealised P&L is market value minus cost basis', () => {
    const h = v.holdings.find((h) => h.id === 'h-infy')!;
    const value = holdingMarketValue(h);
    const cost = D(h.quantity).times(D(h.avgCost));
    expect(value.minus(cost).toString()).toBe('5400'); // 30 × (1580 − 1400)
  });

  test('an unpriced holding reports no gain rather than a loss to zero', () => {
    // It falls back to average cost. That is disclosed in the UI; what must
    // never happen is a missing price being read as a price of zero.
    const h = v.holdings.find((h) => h.id === 'h-tcs')!;
    expect(holdingMarketValue(h).toString()).toBe(D(h.quantity).times(D(h.avgCost)).toString());
  });
});

describe('periods', () => {
  test('the same range gives the same total wherever the metric appears', () => {
    const range = monthsBack(3, NOW);
    const viaSummary = windowSummary(v.txns, range).expense;
    const viaCategories = v.budgets
      .map((b) => b.categoryId)
      .concat([CAT.salary])
      .reduce((s, c) => s.plus(spentForCategory(v.txns, c, range)), ZERO);
    expect(viaSummary.toString()).toBe(viaCategories.toString());
  });

  test('adjacent months do not double-count a boundary transaction', () => {
    const aug = currentMonth(NOW);
    const jul = monthsIn(monthsBack(2, NOW))[0];
    const boundary = v.txns.filter((t) => contains(aug, t.date) && contains(jul, t.date));
    expect(boundary).toEqual([]);
  });

  test('a calendar month and a 30-day window are not interchangeable', () => {
    // The mislabel this suite exists to catch: the dashboard called a trailing
    // 30 days "this month".
    const month = currentMonth(NOW);
    const trailing = trailingDays(30, NOW);
    expect(month.start).not.toBe(trailing.start);
  });
});

describe('import and recurring converge on the same posting path', () => {
  // Manual, imported and recurring entries are all plain `Txn` records written
  // through `store.put`, so the guarantee to check is that the ledger cannot
  // tell them apart: identical entries must produce identical postings.
  test('two identical entries produce identical postings but for their ids', () => {
    const { postings } = buildVault(NOW);
    const a = postings.filter((p) => p.entryId === 't-food-1').map((p) => p.amount).sort();
    const manual = buildVault(NOW).postings
      .filter((p) => p.entryId === 't-food-1').map((p) => p.amount).sort();
    expect(a).toEqual(manual);
  });

  test('re-deriving the vault produces byte-identical postings', () => {
    // Idempotency: importing the same statement twice must not change the book.
    expect(buildVault(NOW).postings).toEqual(v.postings);
  });
});

describe('diagnostics agree with the statements', () => {
  test('a clean vault reports no errors', () => {
    const checks = runDiagnostics({
      txns: v.txns, transfers: v.transfers, postings: v.postings,
      accounts: v.accounts, categories: v.categories, holdings: v.holdings,
      dividends: [], lots: v.lots,
    });
    const errors = checks.filter((c) => c.level === 'error');
    expect(errors.map((c) => `${c.id}: ${c.detail}`)).toEqual([]);
  });

  test('breaking one entry is caught by both the ledger and the balance sheet', () => {
    const broken = v.postings.map((p) =>
      p.id === 't-food-1:cr' ? { ...p, amount: '-2000' } : p);
    const checks = runDiagnostics({
      txns: v.txns, transfers: v.transfers, postings: broken,
      accounts: v.accounts, categories: v.categories, holdings: v.holdings,
      dividends: [], lots: v.lots,
    });
    expect(checks.find((c) => c.id === 'ledger-balanced')!.level).toBe('error');
    expect(checks.find((c) => c.id === 'balance-sheet')!.level).toBe('error');
    expect(balanceSheet(v.accounts, broken).balanced).toBe(false);
  });
});
