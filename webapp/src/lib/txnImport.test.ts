import { describe, expect, test } from 'vitest';
import { parseDelimited, sniffDelimiter, num, findHeaderRow } from './sheet';
import { detectDayFirst, parseDateCell } from './dateParse';
import {
  dividendKindOf, guessCategory, matchHolding, parseTxnRows, planTxnImport, txnFingerprint,
} from './txnImport';
import type { Txn } from './types';

const grid = (text: string) => parseDelimited(text);

describe('sniffDelimiter', () => {
  test('picks tab over commas inside a narration', () => {
    // The narration is full of commas; only the tab splits consistently.
    const text = 'Date\tNarration\tAmount\n01/02/2026\tPAYMENT TO ACME, LTD, MUMBAI\t100';
    expect(sniffDelimiter(text)).toBe('\t');
  });

  test('picks semicolon for European-style exports', () => {
    expect(sniffDelimiter('Date;Narration;Amount\n01/02/2026;Shop;100')).toBe(';');
  });

  test('defaults to comma for plain CSV', () => {
    expect(sniffDelimiter('Date,Narration,Amount\n01/02/2026,Shop,100')).toBe(',');
  });
});

describe('num', () => {
  test('strips currency symbols and separators', () => {
    expect(num('₹1,23,456.78')).toBeCloseTo(123456.78);
  });
  test('reads accounting negatives', () => {
    expect(num('(1,234.00)')).toBeCloseTo(-1234);
  });
  test('reads trailing-sign negatives', () => {
    expect(num('1234.00-')).toBeCloseTo(-1234);
  });
  test('blank is NaN, not zero', () => {
    // A zero here would import an empty cell as a real ₹0 transaction.
    expect(num('')).toBeNaN();
    expect(num(undefined)).toBeNaN();
  });
});

describe('parseDateCell', () => {
  test('day-first by default for ambiguous slash dates', () => {
    const d = new Date(parseDateCell('01/02/2026')!);
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(1); // February
  });

  test('honours unambiguous order regardless of the flag', () => {
    const d = new Date(parseDateCell('17/03/2026', false)!);
    expect(d.getDate()).toBe(17);
    expect(d.getMonth()).toBe(2);
  });

  test('ISO is always year-first', () => {
    const d = new Date(parseDateCell('2026-02-15')!);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(15);
  });

  test('named months in both orders', () => {
    expect(new Date(parseDateCell('15-Feb-2026')!).getMonth()).toBe(1);
    expect(new Date(parseDateCell('Feb 15, 2026')!).getMonth()).toBe(1);
  });

  test('two-digit years pivot at 70', () => {
    expect(new Date(parseDateCell('01/01/26')!).getFullYear()).toBe(2026);
    expect(new Date(parseDateCell('01/01/85')!).getFullYear()).toBe(1985);
  });

  test('rejects impossible dates instead of rolling them over', () => {
    expect(parseDateCell('31/02/2026')).toBeNull();
    expect(parseDateCell('')).toBeNull();
    expect(parseDateCell('not a date')).toBeNull();
  });
});

describe('detectDayFirst', () => {
  test('one unambiguous row settles the whole column', () => {
    expect(detectDayFirst(['01/02/2026', '17/03/2026', '05/04/2026'])).toBe(true);
  });
  test('detects month-first columns', () => {
    expect(detectDayFirst(['02/01/2026', '03/17/2026'])).toBe(false);
  });
  test('defaults to day-first with no evidence', () => {
    expect(detectDayFirst(['01/02/2026'])).toBe(true);
  });
});

describe('findHeaderRow', () => {
  test('skips a bank preamble to find the real header', () => {
    const rows = grid(
      'Account Number,XXXXXX1234\nAccount Holder,SANDHOSH\n\nDate,Narration,Withdrawal Amt.,Deposit Amt.\n01/02/2026,Shop,100,',
    );
    // parseDelimited drops the blank line, so the header is row 2 of the grid.
    expect(findHeaderRow(rows, [['date'], ['withdrawal', 'deposit']])).toBe(2);
  });
});

describe('parseTxnRows — separate debit/credit columns (HDFC shape)', () => {
  const csv = [
    'Account Number,XXXXXXXX1234',
    'Statement From,01/05/2026 To,31/05/2026',
    '',
    'Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance',
    '02/05/2026,SALARY CREDIT ACME LTD,,85000.00,125000.00',
    '03/05/2026,UPI-SWIGGY ORDER,450.50,,124549.50',
    '04/05/2026,ATM WDL,2000.00,,122549.50',
  ].join('\n');

  test('finds the header past the preamble and reads both directions', () => {
    const res = parseTxnRows(grid(csv));
    expect(res.error).toBeUndefined();
    expect(res.rows).toHaveLength(3);
    expect(res.rows[0].kind).toBe('income');
    expect(res.rows[0].amount).toBe('85000.00');
    expect(res.rows[1].kind).toBe('expense');
    expect(res.rows[1].amount).toBe('450.50');
  });

  test('reads the date day-first', () => {
    const d = new Date(parseTxnRows(grid(csv)).rows[0].date);
    expect(d.getDate()).toBe(2);
    expect(d.getMonth()).toBe(4); // May
  });

  test('carries the narration through for category detection', () => {
    const res = parseTxnRows(grid(csv));
    expect(res.rows[1].description).toContain('SWIGGY');
  });
});

describe('parseTxnRows — single signed amount column', () => {
  test('sign decides direction', () => {
    const res = parseTxnRows(grid('Date,Description,Amount\n01/02/2026,Refund,500\n02/02/2026,Coffee,-120'));
    expect(res.rows[0].kind).toBe('income');
    expect(res.rows[1].kind).toBe('expense');
    expect(res.rows[1].amount).toBe('120.00');
  });

  test('an explicit Dr/Cr flag beats the sign', () => {
    const res = parseTxnRows(grid('Date,Description,Amount,Dr / Cr\n01/02/2026,Fee,300,DR'));
    expect(res.rows[0].kind).toBe('expense');
  });

  test('unsigned with no flag falls back to the caller default, not a guess', () => {
    expect(parseTxnRows(grid('Date,Description,Amount\n01/02/2026,Thing,300'), 'income').rows[0].kind).toBe('income');
    expect(parseTxnRows(grid('Date,Description,Amount\n01/02/2026,Thing,300'), 'expense').rows[0].kind).toBe('expense');
  });

  test('one negative anywhere makes the whole column signed', () => {
    // Regression: the positive row here used to fall through to defaultKind
    // and import a salary credit as a spend.
    const res = parseTxnRows(
      grid('Date,Description,Amount\n01/02/2026,Salary,85000\n02/02/2026,Coffee,-120'),
      'expense',
    );
    expect(res.rows[0].kind).toBe('income');
    expect(res.rows[1].kind).toBe('expense');
  });

  test('an all-positive column stays unsigned and honours the default', () => {
    const res = parseTxnRows(
      grid('Date,Description,Amount\n01/02/2026,A,100\n02/02/2026,B,200'),
      'expense',
    );
    expect(res.rows.map((r) => r.kind)).toEqual(['expense', 'expense']);
  });
});

describe('parseTxnRows — standard template', () => {
  const csv = [
    'date,description,amount,currency,type,category,from_account,to_account,notes',
    '2026-02-15,Salary credit,85000,INR,IN,Salary,,,payroll',
    '2026-02-16,Groceries,1240.50,INR,OUT,Food,,,',
    '2026-02-17,Move to savings,20000,INR,TRANSFER,,HDFC Current,HDFC Savings,',
  ].join('\n');

  test('maps IN/OUT/TRANSFER', () => {
    const res = parseTxnRows(grid(csv));
    expect(res.rows.map((r) => r.kind)).toEqual(['income', 'expense', 'transfer']);
  });

  test('a row naming both endpoints is a transfer', () => {
    const res = parseTxnRows(grid(csv));
    expect(res.rows[2].fromAccount).toBe('HDFC Current');
    expect(res.rows[2].toAccount).toBe('HDFC Savings');
  });

  test('explicit categories survive', () => {
    expect(parseTxnRows(grid(csv)).rows[0].category).toBe('Salary');
  });
});

describe('parseTxnRows — failure reporting', () => {
  test('counts unreadable rows instead of dropping them silently', () => {
    const res = parseTxnRows(grid('Date,Description,Amount\n01/02/2026,Good,100\nnot-a-date,Bad,200\n03/02/2026,Zero,0'));
    expect(res.rows).toHaveLength(1);
    expect(res.skipped).toBe(2);
  });

  test('names the missing column rather than failing blankly', () => {
    const res = parseTxnRows(grid('Foo,Bar\n1,2'));
    expect(res.error).toBeTruthy();
    expect(res.rows).toHaveLength(0);
  });

  test('empty file is an error, not an empty success', () => {
    expect(parseTxnRows([]).error).toBeTruthy();
  });
});

describe('guessCategory', () => {
  test('maps well-known merchants', () => {
    expect(guessCategory('UPI-SWIGGY ORDER', 'expense')).toBe('Food');
    expect(guessCategory('UBER TRIP', 'expense')).toBe('Transport');
    expect(guessCategory('AMAZON PAY', 'expense')).toBe('Shopping');
  });

  test('salary only matches an incoming amount', () => {
    expect(guessCategory('SALARY CREDIT', 'income')).toBe('Salary');
    // An outgoing payment mentioning salary must not be labelled income.
    expect(guessCategory('SALARY ADVANCE REPAYMENT', 'expense')).not.toBe('Salary');
  });

  test('returns empty rather than forcing a wrong category', () => {
    expect(guessCategory('SOME RANDOM NARRATION', 'expense')).toBe('');
    expect(guessCategory('anything', 'transfer')).toBe('');
  });
});

describe('planTxnImport — re-importing an overlapping range', () => {
  const row = (over: Partial<Parameters<typeof planTxnImport>[0][number]> = {}) => ({
    date: new Date(2026, 1, 15).getTime(),
    description: 'Blinkit groceries',
    amount: '1240.50',
    kind: 'expense' as const,
    category: '', fromAccount: '', toAccount: '', notes: '', balance: '',
    ...over,
  });

  const existing = (over: Partial<Txn> = {}): Txn => ({
    id: 't1', vaultId: 'v', amount: '1240.50', type: 'expense',
    categoryId: 'c', merchant: 'Blinkit groceries', note: null,
    date: new Date(2026, 1, 15).getTime(), createdAt: 0,
    ...over,
  });

  test('an already-imported row is flagged, not duplicated', () => {
    const plan = planTxnImport([row()], [existing()]);
    expect(plan.fresh).toHaveLength(0);
    expect(plan.duplicates).toHaveLength(1);
  });

  test('a genuinely new row still imports', () => {
    const plan = planTxnImport([row({ amount: '99.00' })], [existing()]);
    expect(plan.fresh).toHaveLength(1);
  });

  test('repeats within the same file are collapsed', () => {
    const plan = planTxnImport([row(), row()], []);
    expect(plan.fresh).toHaveLength(1);
    expect(plan.duplicates).toHaveLength(1);
  });

  test('same amount and day but different merchant are both kept', () => {
    // Two ₹200 coffees on one day are two transactions, not one.
    const plan = planTxnImport(
      [row({ amount: '200.00', description: 'Cafe A' }), row({ amount: '200.00', description: 'Cafe B' })],
      [],
    );
    expect(plan.fresh).toHaveLength(2);
  });

  test('direction is part of identity', () => {
    const plan = planTxnImport([row({ kind: 'income' })], [existing()]);
    expect(plan.fresh).toHaveLength(1);
  });

  test('fingerprint ignores time-of-day within the same date', () => {
    const morning = new Date(2026, 1, 15, 9, 0).getTime();
    const evening = new Date(2026, 1, 15, 21, 0).getTime();
    expect(txnFingerprint(morning, '100', 'expense', 'x'))
      .toBe(txnFingerprint(evening, '100', 'expense', 'x'));
  });
});

describe('dividendKindOf', () => {
  test('classifies the payout kinds', () => {
    expect(dividendKindOf('ACH C/ RELIANCE INDUSTRIES DIV', 'income')).toBe('dividend');
    expect(dividendKindOf('INT.CR 30/06/2026', 'income')).toBe('interest');
    expect(dividendKindOf('TCS BUYBACK PROCEEDS', 'income')).toBe('buyback');
    expect(dividendKindOf('INFY BONUS CREDIT', 'income')).toBe('bonus');
  });

  test('an ordinary credit is not a dividend', () => {
    expect(dividendKindOf('SALARY CREDIT ACME', 'income')).toBeNull();
    expect(dividendKindOf('UPI FROM FRIEND', 'income')).toBeNull();
  });

  test('outgoing money is never investment income', () => {
    // "DIVIDEND MANDATE DEBIT" is a payment, not a payout.
    expect(dividendKindOf('DIVIDEND MANDATE DEBIT', 'expense')).toBeNull();
    expect(dividendKindOf('anything div', 'transfer')).toBeNull();
  });

  test('dividend credits are categorised as investment income, not Other', () => {
    expect(guessCategory('ACH C/ RELIANCE INDUSTRIES DIV', 'income')).toBe('Investment');
  });
});

describe('matchHolding — only ever matches what the user owns', () => {
  const held = [
    { symbol: 'RELIANCE', name: 'Reliance Industries' },
    { symbol: 'TCS', name: 'Tata Consultancy Services' },
    { symbol: 'ITC', name: null },
  ];

  test('matches on company name in a narration', () => {
    expect(matchHolding('ACH C/ RELIANCE INDUSTRIES LTD DIV', held)).toBe('RELIANCE');
  });

  test('matches on the ticker', () => {
    expect(matchHolding('DIV CREDIT TCS', held)).toBe('TCS');
  });

  test('an unheld company matches nothing', () => {
    // The whole safeguard: never attach a payout to a position that does not exist.
    expect(matchHolding('WIPRO LTD DIVIDEND', held)).toBeNull();
  });

  test('short tickers do not fire inside longer words', () => {
    expect(matchHolding('SWITCH GEAR PAYMENT', held)).toBeNull();
  });

  test('the longer name wins over a shorter overlapping one', () => {
    const both = [{ symbol: 'TATA', name: 'Tata' }, { symbol: 'TCS', name: 'Tata Consultancy Services' }];
    expect(matchHolding('TATA CONSULTANCY SERVICES DIV', both)).toBe('TCS');
  });

  test('no holdings means no match, not a crash', () => {
    expect(matchHolding('RELIANCE DIV', [])).toBeNull();
  });
});
