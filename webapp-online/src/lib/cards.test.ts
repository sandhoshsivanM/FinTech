import { describe, expect, test } from 'vitest';
import { advice, billedOn, cycleFor, dueText, dueTone, owedOn, totals, utilisationPct, utilisationTone, validateCard, viewOf } from './cards';
import type { CreditCard, Txn } from './ledger';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const ymd = (x: Date) => `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
const txn = (o: Partial<Txn>): Txn => ({ id: 'x', updatedAt: '', accountId: 'a', type: 'expense', amount: '100', date: '2026-10-10', note: 'n', category: 'c', last4: '1234', ...o });
const card: CreditCard = { id: 'c', updatedAt: '', name: 'HDFC', network: 'Visa', last4: '1234', limit: '100000', statementDay: 15, dueDay: 4 };

describe('utilisation', () => {
  test('tones: ok to 30, warn to 60, bad above', () => {
    expect([0, 30, 31, 60, 61, 100].map(utilisationTone)).toEqual(['ok', 'ok', 'warn', 'warn', 'bad', 'bad']);
  });
  test('percent, and zero limit does not divide by zero', () => {
    expect(utilisationPct(42300, 150000)).toBe(28);
    expect(utilisationPct(10, 0)).toBe(0);
  });
  test('advice: reassurance under 30, otherwise the amount to pay', () => {
    expect(advice(30000, 100000)).toMatch(/^Under 30%/);
    expect(advice(61900, 80000)).toBe('Above the 30% mark (the line). Paying ₹37,900 before the bill date brings it under.');
  });
});

describe('cycle', () => {
  test('statement day still ahead belongs to last month; due rolls into the next month', () => {
    const c = cycleFor(15, 4, d(2026, 10, 27));
    expect(ymd(c.statement)).toBe('2026-10-15');
    expect(ymd(c.due)).toBe('2026-11-4');
    expect(c.daysToDue).toBe(8);
    const ahead = cycleFor(28, 15, d(2026, 10, 27));
    expect(ymd(ahead.statement)).toBe('2026-9-28');
    expect(ymd(ahead.due)).toBe('2026-10-15');
    expect(ahead.daysToDue).toBe(-12);
  });
  test('year rollover', () => {
    const c = cycleFor(20, 5, d(2026, 12, 25));
    expect(ymd(c.statement)).toBe('2026-12-20');
    expect(ymd(c.due)).toBe('2027-1-5');
    expect(ymd(cycleFor(20, 5, d(2027, 1, 2)).statement)).toBe('2026-12-20');
  });
  test('due day later in the same month as the statement', () => {
    expect(ymd(cycleFor(6, 26, d(2026, 10, 27)).due)).toBe('2026-10-26');
  });
  test('day 31 clamps to the month end', () => {
    const c = cycleFor(31, 31, d(2026, 11, 30));
    expect(ymd(c.statement)).toBe('2026-11-30');
    expect(ymd(c.due)).toBe('2026-12-31');
  });
  test('due text and tone', () => {
    expect([-1, 0, 1, 5].map(dueText)).toEqual(['Overdue', 'Due today', 'Due in 1 day', 'Due in 5 days']);
    expect([-2, 3, 4, 7, 8].map(dueTone)).toEqual(['bad', 'bad', 'warn', 'warn', 'quiet']);
  });
  test('cycle progress is clamped to 0..100', () => {
    expect(cycleFor(15, 4, d(2026, 10, 15)).cyclePct).toBe(0);
    expect(cycleFor(15, 4, d(2026, 10, 27)).cyclePct).toBeGreaterThan(0);
  });
});

describe('owed, bill and transactions from last4', () => {
  const txns = [
    txn({ amount: '500', date: '2026-10-20' }),
    txn({ amount: '200', date: '2026-10-21' }),
    txn({ type: 'income', amount: '100', date: '2026-10-22' }),
    txn({ amount: '999', last4: '9999' }),
    txn({ amount: '50', last4: undefined }),
  ];
  test('only transactions with this last4; payments reduce, never below zero', () => {
    expect(owedOn(card, txns).toString()).toBe('600');
    expect(owedOn(card, [txn({ type: 'income', amount: '10' })]).toString()).toBe('0');
  });
  test('billed counts the previous statement to this one', () => {
    const cycle = cycleFor(15, 4, d(2026, 10, 27));
    const t = [txn({ amount: '300', date: '2026-09-16' }), txn({ amount: '700', date: '2026-10-15' }), txn({ amount: '5', date: '2026-09-15' }), txn({ amount: '9', date: '2026-10-16' })];
    expect(billedOn(card, t, cycle).toString()).toBe('1000');
  });
  test('view and totals', () => {
    const v = viewOf(card, txns, d(2026, 10, 27));
    expect(v.pct).toBe(1);
    expect(v.txns).toHaveLength(3);
    expect(totals([v, v]).owed.toString()).toBe('1200');
  });
});

describe('validateCard', () => {
  const ok = { name: ' Axis Ace ', network: 'Visa', last4: '4417', limit: '₹1,00,000', statementDay: '12', dueDay: '2' };
  test('accepts a good form and cleans it', () => {
    expect(validateCard(ok)).toEqual({ value: { name: 'Axis Ace', network: 'Visa', last4: '4417', limit: '100000', statementDay: 12, dueDay: 2 } });
  });
  test('last4 must be exactly four digits', () => {
    for (const bad of ['', '123', '12345', '12a4', '4417 ']) expect('errors' in validateCard({ ...ok, last4: bad })).toBe(true);
  });
  test('days 1 to 31 and limit above zero', () => {
    for (const bad of ['0', '32', '', 'x', '1.5']) expect('errors' in validateCard({ ...ok, dueDay: bad })).toBe(true);
    expect('errors' in validateCard({ ...ok, statementDay: '31' })).toBe(false);
    for (const bad of ['0', '-5', '', 'abc']) expect('errors' in validateCard({ ...ok, limit: bad })).toBe(true);
  });
  test('name and network required', () => {
    const r = validateCard({ ...ok, name: ' ', network: 'Diners' });
    expect('errors' in r && Object.keys(r.errors)).toEqual(['name', 'network']);
  });
});
