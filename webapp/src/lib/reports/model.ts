/**
 * The report model — what a Khazana report contains, independent of how it is
 * rendered.
 *
 * One structure feeds both renderers: `xlsx.ts` turns it into a workbook and the
 * print view turns it into pages. Adding a column means editing this file once
 * rather than editing a spreadsheet writer and a print stylesheet and hoping
 * they still agree.
 *
 * It is deliberately framework-free and free of SheetJS, like everything in
 * `src/domain/`, so it can be unit-tested without a spreadsheet library and
 * ported to Dart the way the rest of the engine was.
 *
 * Nothing here computes financial figures. Balance sheet and cash flow come
 * from `domain/statements.ts`, the period from `domain/period.ts`. A report is a
 * presentation of the ledger, and a second implementation of the same sums is
 * exactly how two numbers for one portfolio appear.
 *
 * ── On money and spreadsheets ──────────────────────────────────────────────
 * The vault stores money as `Decimal` precisely so no total ever drifts. A
 * spreadsheet cell cannot hold a Decimal: Excel stores every number as an IEEE
 * 754 double, so exporting *necessarily* crosses from exact to floating point.
 * The crossing is therefore done here, once, explicitly, rounded to 2 decimal
 * places at the boundary — rather than left to happen implicitly somewhere in a
 * renderer. Amounts are emitted as real numbers, never strings, because a
 * column of text that looks like money makes `SUM()` return zero and makes the
 * whole report look broken to the accountant reading it.
 */
import type Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type {
  Account, Category, Holding, Posting, Transfer, Txn,
} from '@/lib/types';
import { balanceSheet, cashFlow } from '@/domain/statements';
import { type DateRange, contains, monthsIn } from '@/domain/period';

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

export type CellValue = string | number | Date | null;

/**
 * How a column is displayed. The renderers map these to number formats; the
 * model never contains a pre-formatted string, so a currency or a date format
 * can change in one place without rewriting the data.
 */
export type ColumnFormat = 'text' | 'money' | 'number' | 'date' | 'integer' | 'percent';

/**
 * One date format for the whole report.
 *
 * `toLocaleDateString()` with no options renders 31 March as "3/31/2026" for a
 * US locale and "31/3/2026" elsewhere — so the same report read in two places
 * disagrees about which number is the month. Naming the month removes the
 * ambiguity entirely, and matches the `dd-mmm-yyyy` the spreadsheet uses.
 */
export const formatReportDate = (d: Date | number): string =>
  new Date(d).toLocaleDateString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
  });

export interface ReportColumn {
  key: string;
  header: string;
  format: ColumnFormat;
  /** Approximate character width, for the spreadsheet's column sizing. */
  width?: number;
}

/**
 * One sheet of tidy data: one row per record, no merged cells, no blank spacer
 * rows, header in row 1.
 *
 * That constraint is the whole difference between a spreadsheet somebody can
 * pivot and one they have to retype. Presentation lives on the summary sheet;
 * these stay machine-readable.
 */
/**
 * A chart the print renderer draws above a sheet's table.
 *
 * Declared on the model rather than hardcoded in the renderer, so the renderer
 * stays generic and a new charted sheet needs no renderer change. The
 * spreadsheet writer ignores it — Excel readers pivot the tidy rows themselves.
 */
export interface SheetChart {
  kind: 'bar' | 'groupedBar';
  /** Row key holding the category/period name. */
  labelKey: string;
  /** Row keys to plot. One series for `bar`, several for `groupedBar`. */
  series: { key: string; label: string; color: 'income' | 'expense' | 'accent' }[];
}

export interface ReportSheet {
  /** Excel sheet name: ≤31 chars and none of : \ / ? * [ ]. Enforced below. */
  name: string;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, CellValue>[];
  /**
   * Totals, rendered one blank row below the data so it never sits inside the
   * filter range — a totals row caught by an autofilter is the classic way a
   * report double-counts itself when someone sorts it.
   */
  totals?: Record<string, CellValue>;
  /** Shown under the title. Use it to state what the sheet excludes. */
  note?: string;
  /** Optional visual, drawn only in the print/PDF output. */
  chart?: SheetChart;
}

export interface SummaryStat {
  label: string;
  value: CellValue;
  format: ColumnFormat;
  /** Optional one-line explanation, printed under the figure. */
  hint?: string;
}

export interface SummaryGroup {
  heading: string;
  stats: SummaryStat[];
}

export interface ReportMeta {
  appName: string;
  appVersion: string;
  /** The period, exactly as the user chose it and as the UI labelled it. */
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  generatedAt: Date;
  currencyCode: string;
  profileName: string;
  /**
   * True when the ledger does not balance. Surfaced on the summary rather than
   * hidden, because a report that quietly presents damaged books as sound is
   * worse than one that says so.
   */
  ledgerBalanced: boolean;
  discrepancy: number;
}

export interface ReportWorkbook {
  meta: ReportMeta;
  summary: SummaryGroup[];
  sheets: ReportSheet[];
}

export interface ReportInput {
  accounts: Account[];
  postings: Posting[];
  txns: Txn[];
  transfers: Transfer[];
  categories: Category[];
  holdings: Holding[];
  currencyCode: string;
  profileName: string;
  appVersion: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Decimal → spreadsheet number. The one place exactness is given up. */
export const money = (d: Decimal.Value): number =>
  D(d).toDecimalPlaces(2).toNumber();

/**
 * Excel rejects a sheet name over 31 characters or containing : \ / ? * [ ],
 * and silently *renames* a duplicate — so two sheets that collide after
 * truncation lose their identity. Sanitising here keeps the failure at the
 * model rather than inside the renderer.
 */
export function safeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, ' ').trim();
  return (cleaned.length > 31 ? cleaned.slice(0, 31).trim() : cleaned) || 'Sheet';
}

const sum = (xs: number[]): number =>
  Number(xs.reduce((s, x) => s + x, 0).toFixed(2));

/* -------------------------------------------------------------------------- */
/* Build                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Assemble the full report for a period.
 *
 * `range` is applied with the inclusive-both-ends contract from
 * `domain/period.ts` via `contains`, so the report counts exactly the days its
 * own label claims.
 */
export function buildReport(
  input: ReportInput,
  range: DateRange,
  now: number = Date.now(),
): ReportWorkbook {
  const {
    accounts, postings, txns, transfers, categories, holdings,
    currencyCode, profileName, appVersion,
  } = input;

  const acctName = new Map(accounts.map((a) => [a.id, a.name]));
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const nameOf = (m: Map<string, string>, id?: string | null) =>
    (id && m.get(id)) || '';

  const inRange = txns.filter((t) => contains(range, t.date));
  const transfersInRange = transfers.filter((t) => contains(range, t.date));

  // The balance sheet is point-in-time and is drawn at the END of the period,
  // not at `now` — a report for March must show March's position, not today's.
  const sheet = balanceSheet(accounts, postings, range.end);

  const entryDates = new Map<string, number>([
    ...txns.map((t) => [t.id, t.date] as const),
    ...transfers.map((t) => [t.id, t.date] as const),
  ]);
  const flow = cashFlow(accounts, postings, entryDates, range.start, range.end);

  /* ---- Transactions ---------------------------------------------------- */

  const txnSheet: ReportSheet = {
    name: 'Transactions',
    title: 'Transactions',
    note: 'Every entry in the period, one row each. Transfers are listed separately — they move money between your own accounts and are not income or expense.',
    columns: [
      { key: 'date', header: 'Date', format: 'date', width: 12 },
      { key: 'type', header: 'Type', format: 'text', width: 10 },
      { key: 'account', header: 'Account', format: 'text', width: 20 },
      { key: 'category', header: 'Category', format: 'text', width: 20 },
      { key: 'merchant', header: 'Merchant', format: 'text', width: 22 },
      { key: 'note', header: 'Note', format: 'text', width: 30 },
      { key: 'receipt', header: 'Receipt', format: 'text', width: 9 },
      { key: 'income', header: `Income (${currencyCode})`, format: 'money', width: 14 },
      { key: 'expense', header: `Expense (${currencyCode})`, format: 'money', width: 14 },
    ],
    rows: [...inRange]
      .sort((a, b) => a.date - b.date)
      .map((t) => {
        const amt = money(t.amount);
        return {
          date: new Date(t.date),
          type: t.type,
          account: nameOf(acctName, t.accountId),
          category: nameOf(catName, t.categoryId),
          merchant: t.merchant ?? '',
          note: t.note ?? '',
          receipt: t.attachmentRef ? 'Yes' : '',
          income: t.type === 'income' ? amt : null,
          expense: t.type === 'expense' ? amt : null,
        };
      }),
  };
  txnSheet.totals = {
    date: 'Total',
    income: sum(txnSheet.rows.map((r) => (r.income as number) ?? 0)),
    expense: sum(txnSheet.rows.map((r) => (r.expense as number) ?? 0)),
  };

  /* ---- Expenses by category -------------------------------------------- */

  const spendByCat = new Map<string, Decimal>();
  for (const t of inRange) {
    if (t.type !== 'expense') continue;
    spendByCat.set(t.categoryId, (spendByCat.get(t.categoryId) ?? ZERO).plus(D(t.amount)));
  }
  const countByCat = new Map<string, number>();
  for (const t of inRange) {
    if (t.type !== 'expense') continue;
    countByCat.set(t.categoryId, (countByCat.get(t.categoryId) ?? 0) + 1);
  }

  const totalSpend = money(
    [...spendByCat.values()].reduce((s, d) => s.plus(d), ZERO),
  );

  const categorySheet: ReportSheet = {
    name: 'Expenses by category',
    title: 'Expenses by category',
    note: 'Share is of total expense in the period.',
    chart: {
      kind: 'bar',
      labelKey: 'category',
      series: [{ key: 'amount', label: 'Spent', color: 'expense' }],
    },
    columns: [
      { key: 'category', header: 'Category', format: 'text', width: 24 },
      { key: 'entries', header: 'Entries', format: 'integer', width: 9 },
      { key: 'amount', header: `Amount (${currencyCode})`, format: 'money', width: 16 },
      { key: 'share', header: 'Share', format: 'percent', width: 10 },
    ],
    rows: [...spendByCat.entries()]
      .map(([id, amount]) => ({
        category: nameOf(catName, id) || '(uncategorised)',
        entries: countByCat.get(id) ?? 0,
        amount: money(amount),
        share: totalSpend === 0 ? 0 : Number(((money(amount) / totalSpend) * 100).toFixed(1)),
      }))
      .sort((a, b) => (b.amount as number) - (a.amount as number)),
  };
  categorySheet.totals = {
    category: 'Total',
    entries: sum(categorySheet.rows.map((r) => r.entries as number)),
    amount: totalSpend,
    share: totalSpend === 0 ? 0 : 100,
  };

  /* ---- Month by month --------------------------------------------------- */

  const monthlySheet: ReportSheet = {
    name: 'Month by month',
    title: 'Income and expense by month',
    chart: {
      kind: 'groupedBar',
      labelKey: 'month',
      series: [
        { key: 'income', label: 'Income', color: 'income' },
        { key: 'expense', label: 'Expense', color: 'expense' },
      ],
    },
    columns: [
      { key: 'month', header: 'Month', format: 'text', width: 22 },
      { key: 'income', header: `Income (${currencyCode})`, format: 'money', width: 14 },
      { key: 'expense', header: `Expense (${currencyCode})`, format: 'money', width: 14 },
      { key: 'net', header: `Net (${currencyCode})`, format: 'money', width: 14 },
    ],
    rows: monthsIn(range).map((m) => {
      const bucket = txns.filter((t) => contains(m, t.date) && contains(range, t.date));
      const income = sum(bucket.filter((t) => t.type === 'income').map((t) => money(t.amount)));
      const expense = sum(bucket.filter((t) => t.type === 'expense').map((t) => money(t.amount)));
      return {
        month: m.label,
        income,
        expense,
        net: Number((income - expense).toFixed(2)),
      };
    }),
  };
  monthlySheet.totals = {
    month: 'Total',
    income: sum(monthlySheet.rows.map((r) => r.income as number)),
    expense: sum(monthlySheet.rows.map((r) => r.expense as number)),
    net: sum(monthlySheet.rows.map((r) => r.net as number)),
  };

  /* ---- Balance sheet ---------------------------------------------------- */

  const bsRows: Record<string, CellValue>[] = [];
  const pushSection = (section: string, lines: { label: string; amount: Decimal }[]) => {
    for (const l of lines) {
      bsRows.push({ section, line: l.label, amount: money(l.amount) });
    }
  };
  pushSection('Assets', sheet.assets);
  pushSection('Liabilities', sheet.liabilities);
  pushSection('Equity', sheet.equity);
  if (sheet.unclassified.length) pushSection('Unclassified', sheet.unclassified);

  const balanceSheetSheet: ReportSheet = {
    name: 'Balance sheet',
    title: `Balance sheet as at ${formatReportDate(range.end)}`,
    note: sheet.balanced
      ? 'Assets − liabilities = net worth. The books balance.'
      : 'WARNING: the books do not balance. A non-zero discrepancy means an entry whose postings do not sum to zero, or a posting against an account not in the chart. See the Unclassified rows.',
    columns: [
      { key: 'section', header: 'Section', format: 'text', width: 16 },
      { key: 'line', header: 'Account', format: 'text', width: 30 },
      { key: 'amount', header: `Amount (${currencyCode})`, format: 'money', width: 16 },
    ],
    rows: bsRows,
    totals: { section: 'Net worth', line: 'Assets − liabilities', amount: money(sheet.netWorth) },
  };

  /* ---- Cash flow -------------------------------------------------------- */

  const cashFlowSheet: ReportSheet = {
    name: 'Cash flow',
    title: 'Cash flow for the period',
    note: 'Where money came from and where it went, from the double-entry postings. Transfers between your own accounts are excluded — they are not income or expense.',
    columns: [
      { key: 'direction', header: 'Direction', format: 'text', width: 12 },
      { key: 'line', header: 'Account', format: 'text', width: 30 },
      { key: 'amount', header: `Amount (${currencyCode})`, format: 'money', width: 16 },
    ],
    rows: [
      ...flow.income.map((l) => ({ direction: 'Income', line: l.label, amount: money(l.amount) })),
      ...flow.expenses.map((l) => ({ direction: 'Expense', line: l.label, amount: money(l.amount) })),
    ],
    totals: { direction: 'Net', line: 'Income − expense', amount: money(flow.net) },
  };

  /* ---- Holdings --------------------------------------------------------- */

  const holdingRows = holdings.map((h) => {
    const qty = D(h.quantity);
    const cost = qty.times(D(h.avgCost));
    const value = h.lastPrice != null ? qty.times(D(h.lastPrice)) : null;
    const gain = value ? value.minus(cost) : null;
    return {
      symbol: h.symbol,
      exchange: h.exchange,
      assetType: h.assetType,
      quantity: qty.toNumber(),
      avgCost: money(h.avgCost),
      lastPrice: h.lastPrice != null ? money(h.lastPrice) : null,
      cost: money(cost),
      value: value ? money(value) : null,
      gain: gain ? money(gain) : null,
      gainPct: gain && !cost.isZero()
        ? Number(gain.div(cost).times(100).toFixed(2))
        : null,
    };
  });

  const unpriced = holdingRows.filter((r) => r.value == null).length;
  const holdingsSheet: ReportSheet = {
    name: 'Holdings',
    title: 'Holdings',
    note: unpriced > 0
      ? `${unpriced} holding(s) have no recorded price. Their market value and gain are blank rather than assumed, so the value total below understates the portfolio.`
      : 'Valued at the last recorded price for each holding.',
    columns: [
      { key: 'symbol', header: 'Symbol', format: 'text', width: 14 },
      { key: 'exchange', header: 'Exchange', format: 'text', width: 10 },
      { key: 'assetType', header: 'Asset type', format: 'text', width: 14 },
      { key: 'quantity', header: 'Quantity', format: 'number', width: 12 },
      { key: 'avgCost', header: `Avg cost (${currencyCode})`, format: 'money', width: 14 },
      { key: 'lastPrice', header: `Last price (${currencyCode})`, format: 'money', width: 14 },
      { key: 'cost', header: `Cost (${currencyCode})`, format: 'money', width: 15 },
      { key: 'value', header: `Value (${currencyCode})`, format: 'money', width: 15 },
      { key: 'gain', header: `Unrealised (${currencyCode})`, format: 'money', width: 15 },
      { key: 'gainPct', header: 'Unrealised %', format: 'percent', width: 13 },
    ],
    rows: holdingRows,
    totals: {
      symbol: 'Total',
      cost: sum(holdingRows.map((r) => r.cost)),
      value: sum(holdingRows.map((r) => r.value ?? 0)),
      gain: sum(holdingRows.map((r) => r.gain ?? 0)),
    },
  };

  /* ---- Transfers -------------------------------------------------------- */

  const transferSheet: ReportSheet = {
    name: 'Transfers',
    title: 'Transfers between your own accounts',
    note: 'Listed for completeness. A transfer is not income or expense and is excluded from every total elsewhere in this report.',
    columns: [
      { key: 'date', header: 'Date', format: 'date', width: 12 },
      { key: 'from', header: 'From', format: 'text', width: 22 },
      { key: 'to', header: 'To', format: 'text', width: 22 },
      { key: 'note', header: 'Note', format: 'text', width: 30 },
      { key: 'amount', header: `Amount (${currencyCode})`, format: 'money', width: 16 },
    ],
    rows: [...transfersInRange]
      .sort((a, b) => a.date - b.date)
      .map((t) => ({
        date: new Date(t.date),
        from: nameOf(acctName, t.fromAccountId),
        to: nameOf(acctName, t.toAccountId),
        note: t.note ?? '',
        amount: money(t.amount),
      })),
  };
  transferSheet.totals = {
    date: 'Total',
    amount: sum(transferSheet.rows.map((r) => r.amount as number)),
  };

  /* ---- Summary ---------------------------------------------------------- */

  const totalIncome = money(flow.totalIncome);
  const totalExpense = money(flow.totalExpenses);
  const net = money(flow.net);

  const summary: SummaryGroup[] = [
    {
      heading: 'This period',
      stats: [
        { label: 'Income', value: totalIncome, format: 'money' },
        { label: 'Expenses', value: totalExpense, format: 'money' },
        {
          label: 'Net',
          value: net,
          format: 'money',
          hint: net >= 0 ? 'Income exceeded expenses.' : 'Expenses exceeded income.',
        },
        {
          label: 'Savings rate',
          value: totalIncome === 0 ? 0 : Number(((net / totalIncome) * 100).toFixed(1)),
          format: 'percent',
          hint: totalIncome === 0 ? 'No income recorded in this period.' : 'Net as a share of income.',
        },
        { label: 'Transactions', value: inRange.length, format: 'integer' },
      ],
    },
    {
      heading: `Position as at ${formatReportDate(range.end)}`,
      stats: [
        { label: 'Total assets', value: money(sheet.totalAssets), format: 'money' },
        { label: 'Total liabilities', value: money(sheet.totalLiabilities), format: 'money' },
        { label: 'Net worth', value: money(sheet.netWorth), format: 'money', hint: 'Assets − liabilities.' },
        {
          label: 'Portfolio value',
          value: sum(holdingRows.map((r) => r.value ?? 0)),
          format: 'money',
          hint: unpriced > 0 ? `Understated — ${unpriced} holding(s) have no recorded price.` : undefined,
        },
        {
          label: 'Unrealised gain',
          value: sum(holdingRows.map((r) => r.gain ?? 0)),
          format: 'money',
        },
      ],
    },
  ];

  /* ---- Assemble --------------------------------------------------------- */

  const sheets = [
    txnSheet,
    categorySheet,
    monthlySheet,
    cashFlowSheet,
    balanceSheetSheet,
    holdingsSheet,
    transferSheet,
  ]
    // A sheet with no rows is noise in a workbook; drop it rather than ship an
    // empty grid the reader has to interpret. Transactions always stays, since
    // its absence is itself the answer to "what happened this period".
    .filter((s) => s.rows.length > 0 || s.name === 'Transactions')
    .map((s) => ({ ...s, name: safeSheetName(s.name) }));

  return {
    meta: {
      appName: 'Khazana',
      appVersion,
      periodLabel: range.label,
      periodStart: new Date(range.start),
      periodEnd: new Date(range.end),
      generatedAt: new Date(now),
      currencyCode,
      profileName,
      ledgerBalanced: sheet.balanced,
      discrepancy: money(sheet.discrepancy),
    },
    summary,
    sheets,
  };
}
