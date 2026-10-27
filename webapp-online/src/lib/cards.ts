// Credit-card maths, all on this device. Pure functions: no clock, no storage.
// Owed and the recent list come from transactions whose `last4` matches the card.
import { D, ZERO } from '@khazana/domain/money';
import type Decimal from 'decimal.js';
import type { CardValue, CreditCard, Txn } from './ledger';

export type Tone = 'ok' | 'warn' | 'bad';

export const NETWORKS = ['Visa', 'Mastercard', 'RuPay', 'Amex'] as const;
export const GOOD_UTILISATION = 30;

/** ok up to 30%, warn up to 60%, bad above. */
export const utilisationTone = (pct: number): Tone => (pct <= 30 ? 'ok' : pct <= 60 ? 'warn' : 'bad');

export const utilisationPct = (owed: Decimal.Value, limit: Decimal.Value): number =>
  D(limit).lte(0) ? 0 : Math.round(D(owed).div(D(limit)).times(100).toNumber());

/** Under 30%: a line of reassurance; above: how much to pay before the bill date. */
export function advice(owed: Decimal.Value, limit: Decimal.Value): string {
  if (utilisationPct(owed, limit) <= GOOD_UTILISATION) return 'Under 30% of the limit. This is the range that helps a credit score.';
  const pay = D(owed).minus(D(limit).times(0.3)).toDecimalPlaces(0);
  return `Above the 30% mark (the line). Paying ₹${pay.toNumber().toLocaleString('en-IN')} before the bill date brings it under.`;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** The given day of a month; the 31st in a 30-day month is that month's last day. */
function dayOf(year: number, month: number, day: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last));
}
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);

export type Cycle = { statement: Date; due: Date; daysToDue: number; cyclePct: number };

/**
 * The latest statement date on or before today, and the first due date after it.
 * A statement day still ahead in this month belongs to last month's cycle.
 */
export function cycleFor(statementDay: number, dueDay: number, now: Date): Cycle {
  const today = startOfDay(now);
  let statement = dayOf(today.getFullYear(), today.getMonth(), statementDay);
  if (statement > today) statement = dayOf(today.getFullYear(), today.getMonth() - 1, statementDay);
  let due = dayOf(statement.getFullYear(), statement.getMonth(), dueDay);
  if (due <= statement) due = dayOf(statement.getFullYear(), statement.getMonth() + 1, dueDay);
  const span = daysBetween(statement, due);
  const cyclePct = Math.max(0, Math.min(100, Math.round((daysBetween(statement, today) / span) * 100)));
  return { statement, due, daysToDue: daysBetween(today, due), cyclePct };
}

export const dueText = (days: number) =>
  days < 0 ? 'Overdue' : days === 0 ? 'Due today' : `Due in ${days} ${days === 1 ? 'day' : 'days'}`;
/** bad within 3 days (or overdue), warn within 7, otherwise quiet. */
export const dueTone = (days: number): Tone | 'quiet' => (days <= 3 ? 'bad' : days <= 7 ? 'warn' : 'quiet');

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const cardTxns = (card: Pick<CardValue, 'last4'>, txns: Txn[]): Txn[] => txns.filter((t) => t.last4 === card.last4);
const net = (ts: Txn[]) => ts.reduce((s, t) => (t.type === 'expense' ? s.plus(D(t.amount)) : s.minus(D(t.amount))), ZERO);

/** Spending minus payments and refunds on the card, never below zero. */
export function owedOn(card: Pick<CardValue, 'last4'>, txns: Txn[]): Decimal {
  const v = net(cardTxns(card, txns));
  return v.isNegative() ? ZERO : v;
}

/** What the last statement billed: the net of transactions after the previous statement date, up to the statement date. */
export function billedOn(card: CardValue, txns: Txn[], cycle: Cycle): Decimal {
  const to = isoDay(cycle.statement);
  const from = isoDay(dayOf(cycle.statement.getFullYear(), cycle.statement.getMonth() - 1, card.statementDay));
  const v = net(cardTxns(card, txns).filter((t) => t.date > from && t.date <= to));
  return v.isNegative() ? ZERO : v;
}

export type CardView = {
  card: CreditCard; owed: Decimal; limit: Decimal; available: Decimal; pct: number; tone: Tone;
  cycle: Cycle; billed: Decimal; txns: Txn[];
};

export function viewOf(card: CreditCard, txns: Txn[], now: Date): CardView {
  const owed = owedOn(card, txns);
  const limit = D(card.limit);
  const pct = utilisationPct(owed, limit);
  const cycle = cycleFor(card.statementDay, card.dueDay, now);
  return { card, owed, limit, available: limit.minus(owed), pct, tone: utilisationTone(pct), cycle, billed: billedOn(card, txns, cycle),
    txns: cardTxns(card, txns).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8) };
}

export function totals(views: CardView[]): { owed: Decimal; limit: Decimal; pct: number } {
  const owed = views.reduce((s, v) => s.plus(v.owed), ZERO);
  const limit = views.reduce((s, v) => s.plus(v.limit), ZERO);
  return { owed, limit, pct: utilisationPct(owed, limit) };
}

export type CardForm = { name: string; network: string; last4: string; limit: string; statementDay: string; dueDay: string };

/** Errors by field, or the clean value. Last 4 is exactly four digits; days 1 to 31; limit above zero. */
export function validateCard(f: CardForm): { value: CardValue } | { errors: Partial<Record<keyof CardForm, string>> } {
  const errors: Partial<Record<keyof CardForm, string>> = {};
  const name = f.name.trim();
  if (!name) errors.name = 'Give the card a name.';
  if (!(NETWORKS as readonly string[]).includes(f.network)) errors.network = 'Pick a network.';
  if (!/^\d{4}$/.test(f.last4)) errors.last4 = 'Enter exactly 4 digits.';
  const limitText = f.limit.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(limitText) || D(limitText).lte(0)) errors.limit = 'Enter a limit above zero.';
  const day = (s: string) => (/^\d{1,2}$/.test(s.trim()) && +s >= 1 && +s <= 31 ? +s : undefined);
  const statementDay = day(f.statementDay);
  const dueDay = day(f.dueDay);
  if (statementDay === undefined) errors.statementDay = 'A day from 1 to 31.';
  if (dueDay === undefined) errors.dueDay = 'A day from 1 to 31.';
  if (Object.keys(errors).length) return { errors };
  return { value: { name, network: f.network as CardValue['network'], last4: f.last4, limit: D(limitText).toString(), statementDay: statementDay!, dueDay: dueDay! } };
}
