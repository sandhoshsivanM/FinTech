/**
 * The report is a presentation of the ledger, so these tests mostly pin the
 * ways a presentation can lie: counting days outside the period, showing text
 * where a number belongs, or quietly presenting an unbalanced ledger as sound.
 */
import { describe, expect, it } from 'vitest';
import type { Account, Category, Holding, Posting, Transfer, Txn } from '@/lib/types';
import { custom } from '@/domain/period';
import { buildReport, safeSheetName, type ReportInput } from './model';
import { buildXlsx, reportFilename } from './xlsx';

const VAULT = 'v1';
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

const acct = (id: string, name: string, type: Account['type'], subtype: string): Account =>
  ({ id, vaultId: VAULT, name, type, subtype, openingBalance: '0' });

const txn = (id: string, date: number, type: Txn['type'], amount: string, categoryId = 'c1'): Txn =>
  ({ id, vaultId: VAULT, amount, type, categoryId, date, createdAt: date, accountId: 'a-cash' });

const posting = (id: string, entryId: string, accountId: string, amount: string): Posting =>
  ({ id, vaultId: VAULT, entryId, accountId, amount });

function input(over: Partial<ReportInput> = {}): ReportInput {
  const accounts: Account[] = [
    acct('a-cash', 'Cash', 'asset', 'cash'),
    acct('a-inc', 'Salary', 'income', 'income'),
    acct('a-exp', 'Groceries', 'expense', 'expense'),
  ];
  const categories: Category[] = [
    { id: 'c1', vaultId: VAULT, name: 'Food' },
    { id: 'c2', vaultId: VAULT, name: 'Travel' },
  ];
  return {
    accounts,
    categories,
    postings: [],
    txns: [],
    transfers: [],
    holdings: [],
    currencyCode: 'INR',
    profileName: 'Self',
    appVersion: '1.0.0',
    ...over,
  };
}

const sheetNamed = (r: ReturnType<typeof buildReport>, name: string) =>
  r.sheets.find((s) => s.name === name);

describe('buildReport — the period is the period', () => {
  const range = custom(day(2026, 3, 1), day(2026, 3, 31));

  it('counts only entries inside the range, both ends inclusive', () => {
    const r = buildReport(input({
      txns: [
        txn('before', day(2026, 2, 28), 'expense', '100'),
        txn('first', day(2026, 3, 1), 'expense', '10'),
        txn('last', day(2026, 3, 31), 'expense', '20'),
        txn('after', day(2026, 4, 1), 'expense', '400'),
      ],
    }), range);

    const rows = sheetNamed(r, 'Transactions')!.rows;
    expect(rows.map((x) => x.expense)).toEqual([10, 20]);
    expect(sheetNamed(r, 'Transactions')!.totals!.expense).toBe(30);
  });

  it('carries the range label the UI showed, so the file cannot claim a different period', () => {
    const r = buildReport(input(), range);
    expect(r.meta.periodLabel).toBe(range.label);
    expect(r.meta.periodStart.getTime()).toBe(range.start);
    expect(r.meta.periodEnd.getTime()).toBe(range.end);
  });
});

describe('buildReport — figures', () => {
  const range = custom(day(2026, 3, 1), day(2026, 3, 31));

  it('splits income and expense into separate columns and totals each', () => {
    const r = buildReport(input({
      txns: [
        txn('t1', day(2026, 3, 5), 'income', '5000'),
        txn('t2', day(2026, 3, 6), 'expense', '1200.50'),
        txn('t3', day(2026, 3, 7), 'expense', '300.25'),
      ],
    }), range);

    const t = sheetNamed(r, 'Transactions')!;
    expect(t.totals).toMatchObject({ income: 5000, expense: 1500.75 });
  });

  it('ranks expense categories by amount and shares sum to 100', () => {
    const r = buildReport(input({
      txns: [
        txn('t1', day(2026, 3, 5), 'expense', '100', 'c1'),
        txn('t2', day(2026, 3, 6), 'expense', '300', 'c2'),
      ],
    }), range);

    const cat = sheetNamed(r, 'Expenses by category')!;
    expect(cat.rows.map((x) => x.category)).toEqual(['Travel', 'Food']);
    expect(cat.rows.map((x) => x.share)).toEqual([75, 25]);
    expect(cat.totals!.amount).toBe(400);
  });

  it('leaves market value blank for an unpriced holding rather than assuming cost', () => {
    const holdings: Holding[] = [
      {
        id: 'h1', vaultId: VAULT, symbol: 'INFY', exchange: 'NSE',
        quantity: '10', avgCost: '100', lastPrice: '150', assetType: 'equity_etf',
      },
      {
        id: 'h2', vaultId: VAULT, symbol: 'XYZ', exchange: 'NSE',
        quantity: '5', avgCost: '200', lastPrice: null, assetType: 'equity_etf',
      },
    ];
    const r = buildReport(input({ holdings }), range);
    const h = sheetNamed(r, 'Holdings')!;

    expect(h.rows[0]).toMatchObject({ cost: 1000, value: 1500, gain: 500, gainPct: 50 });
    expect(h.rows[1]).toMatchObject({ cost: 1000, value: null, gain: null });
    // Cost counts both; value counts only what is priced — and the note says so.
    expect(h.totals).toMatchObject({ cost: 2000, value: 1500 });
    expect(h.note).toMatch(/understates/);
  });

  it('excludes transfers from income and expense but still lists them', () => {
    const transfers: Transfer[] = [{
      id: 'tr1', vaultId: VAULT, amount: '900',
      fromAccountId: 'a-cash', toAccountId: 'a-cash',
      date: day(2026, 3, 10), createdAt: day(2026, 3, 10),
    }];
    const r = buildReport(input({ transfers }), range);

    expect(sheetNamed(r, 'Transactions')!.totals).toMatchObject({ income: 0, expense: 0 });
    expect(sheetNamed(r, 'Transfers')!.totals!.amount).toBe(900);
  });
});

describe('buildReport — honesty about damage', () => {
  it('reports an unbalanced ledger instead of presenting it as sound', () => {
    // The realistic damage: an entry whose two legs sum to zero, but one leg
    // points at an account the chart no longer contains — a deleted account
    // leaving orphaned postings. The surviving leg then has nothing to cancel
    // against, so the sheet must refuse to call the books sound.
    const r = buildReport(input({
      txns: [txn('t1', day(2026, 3, 5), 'expense', '100')],
      postings: [
        posting('p1', 't1', 'a-cash', '-100'),
        posting('p2', 't1', 'ghost-account', '100'),
      ],
    }), custom(day(2026, 3, 1), day(2026, 3, 31)));

    expect(r.meta.ledgerBalanced).toBe(false);
    expect(r.meta.discrepancy).not.toBe(0);
    expect(sheetNamed(r, 'Balance sheet')!.note).toMatch(/WARNING/);
  });
});

describe('safeSheetName', () => {
  it('strips the characters Excel refuses and truncates to 31', () => {
    expect(safeSheetName('Profit/Loss [2026]')).toBe('Profit Loss  2026');
    expect(safeSheetName('x'.repeat(40))).toHaveLength(31);
  });

  it('never returns an empty name', () => {
    expect(safeSheetName('///')).toBe('Sheet');
  });
});

describe('xlsx rendering', () => {
  const range = custom(day(2026, 3, 1), day(2026, 3, 31));
  // A properly posted ledger, so the workbook exercises the balance sheet too:
  // salary in, groceries out, every entry's legs summing to zero.
  const report = buildReport(input({
    txns: [
      txn('t1', day(2026, 3, 5), 'income', '5000'),
      txn('t2', day(2026, 3, 6), 'expense', '1200.50'),
    ],
    postings: [
      posting('p1', 't1', 'a-cash', '5000'),
      posting('p2', 't1', 'a-inc', '-5000'),
      posting('p3', 't2', 'a-exp', '1200.50'),
      posting('p4', 't2', 'a-cash', '-1200.50'),
    ],
  }), range, day(2026, 4, 1));

  /** Round-trips through real .xlsx bytes — styles that are set in memory but
   *  dropped on write are exactly the class of bug this guards. */
  async function written() {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildXlsx(report)).buffer as ArrayBuffer);
    return wb;
  }

  it('balances a correctly posted ledger', () => {
    expect(report.meta.ledgerBalanced).toBe(true);
    expect(report.meta.discrepancy).toBe(0);
  });

  it('opens with Summary, then the data sheets', async () => {
    const wb = await written();
    const names = wb.worksheets.map((w) => w.name);
    expect(names[0]).toBe('Summary');
    expect(names).toContain('Transactions');
    expect(names).toContain('Balance sheet');
  });

  it('writes amounts as numbers, so SUM() works', async () => {
    const wb = await written();
    const ws = wb.getWorksheet('Transactions')!;
    // Income column is H; row 1 is the header, so the first record is row 2.
    const v = ws.getCell('H2').value ?? ws.getCell('I2').value;
    expect(typeof v).toBe('number');
  });

  it('writes dates as dates, not strings', async () => {
    const wb = await written();
    expect(wb.getWorksheet('Transactions')!.getCell('A2').value).toBeInstanceOf(Date);
  });

  it('keeps number formats through a real write/read cycle', async () => {
    const wb = await written();
    const ws = wb.getWorksheet('Transactions')!;
    expect(ws.getCell('A2').numFmt).toBe('dd-mmm-yyyy');
    expect(ws.getCell('H2').numFmt).toContain('#,##0.00');
  });

  it('actually freezes the header row', async () => {
    // The SheetJS build this replaced accepted the setting and dropped it on
    // write, so the assertion is against bytes that have been through a save.
    const wb = await written();
    const view = wb.getWorksheet('Transactions')!.views[0] as { state?: string; ySplit?: number };
    expect(view.state).toBe('frozen');
    expect(view.ySplit).toBe(1);
  });

  it('styles the header rather than leaving it bare text', async () => {
    const wb = await written();
    const cell = wb.getWorksheet('Transactions')!.getCell('A1');
    expect(cell.font?.bold).toBe(true);
    expect(cell.fill?.type).toBe('pattern');
    expect(cell.border?.bottom?.style).toBe('medium');
  });

  it('keeps the totals row outside the autofilter range', async () => {
    const wb = await written();
    const ws = wb.getWorksheet('Transactions')!;
    // ExcelJS reads the filter back as a range string. Two data rows, so it
    // covers the header and those and stops at row 3 — the totals at row 5 are
    // outside it, which is the point.
    expect(ws.autoFilter).toBe('A1:I3');
  });

  it('leaves a blank row between the data and the totals', async () => {
    const wb = await written();
    const ws = wb.getWorksheet('Transactions')!;
    // Header 1, data 2-3, gap 4, totals 5.
    expect(ws.getCell('A4').value).toBeFalsy();
    expect(ws.getCell('A5').value).toBe('Total');
  });

  it('names the file so it sorts chronologically', () => {
    expect(reportFilename(report, 'xlsx'))
      .toBe('khazana-report_2026-03-01_2026-03-31.xlsx');
  });
});
