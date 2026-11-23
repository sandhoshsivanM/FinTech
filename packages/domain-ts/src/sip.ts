// SIP schedule maths. Mirrors packages/khazana_domain/lib/services/sip_schedule.dart;
// both suites assert against test/fixtures/sip_cases.json.
//
// Khazana never moves money. A SIP plan only produces reminders; units are
// recorded when the user taps Mark done, so a bounced or paused SIP never shows
// units the user does not own.
//
// Dates are plain calendar dates, `YYYY-MM-DD` strings. A SIP falls on a bank
// day, not an instant — stored as epoch ms, a 5th-of-month SIP becomes the 4th
// for anyone east of UTC.
import Decimal from 'decimal.js';
import { D, ZERO } from './money';
import { ASSET_GROUP_OF, ASSET_GROUP_ORDER, type AssetGroup } from './portfolio';
import type { AllocationTargets } from './allocation';
import type { AssetType } from './types';

export type IsoDate = string;

export interface SipPlan {
  id: string;
  vaultId: string;
  profileId?: string;
  /** The holding the units go into. */
  holdingId: string;
  name: string;
  assetType: AssetType;
  /** First-year instalment, a Decimal string. */
  amount: string;
  /** 1–31; clamps to the last day of shorter months, as AMCs do. */
  dayOfMonth: number;
  startDate: IsoDate;
  /** Yearly increase applied every April. 0 = none. */
  stepUpPct: number;
  remind: boolean;
  /** False while paused. */
  active: boolean;
  createdAt: number;
}

export type SipInstalmentStatus = 'done' | 'skipped';

export interface SipInstalment {
  id: string;
  vaultId: string;
  profileId?: string;
  sipId: string;
  dueDate: IsoDate;
  status: SipInstalmentStatus;
  /** What was invested. '0' for a skipped month. */
  amount: string;
  units?: string | null;
  nav?: string | null;
  /** The lot this created, so Undo removes exactly that buy. */
  lotId?: string | null;
  /**
   * The holding as it was before Mark done, so Undo can put it back exactly
   * rather than reverse an average (which divides, and so rounds).
   */
  holdingBefore?: { quantity: string; avgCost: string; firstPurchaseDate?: number | null } | null;
  decidedAt: number;
}

export const SIP_LOOKBACK_DAYS = 35;
export const STEP_UP_MONTH = 4;
/** See kSipMixWarnPoints in the Dart twin. */
export const SIP_MIX_WARN_POINTS = 10;

const HUNDRED = new Decimal(100);

interface Ymd { y: number; m: number; d: number }

export function parseIso(iso: IsoDate): Ymd {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

export function toIso({ y, m, d }: Ymd): IsoDate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** A local Date's calendar day. */
export function isoOf(date: Date): IsoDate {
  return toIso({ y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() });
}

export function addDays(iso: IsoDate, n: number): IsoDate {
  const { y, m, d } = parseIso(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return toIso({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// ISO date strings compare correctly as strings.
export function dueDateIn(plan: Pick<SipPlan, 'dayOfMonth'>, y: number, m: number): IsoDate {
  return toIso({ y, m, d: Math.min(Math.max(plan.dayOfMonth, 1), daysInMonth(y, m)) });
}

export function occurrences(plan: SipPlan, from: IsoDate, to: IsoDate): IsoDate[] {
  const start = from < plan.startDate ? plan.startDate : from;
  const out: IsoDate[] = [];
  let { y, m } = parseIso(start);
  for (;;) {
    const d = dueDateIn(plan, y, m);
    if (d > to) break;
    if (d >= start) out.push(d);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function stepUpsBy(plan: SipPlan, on: IsoDate): number {
  if (plan.stepUpPct <= 0) return 0;
  let n = 0;
  const startY = parseIso(plan.startDate).y;
  const onY = parseIso(on).y;
  for (let y = startY; y <= onY; y++) {
    const april = toIso({ y, m: STEP_UP_MONTH, d: 1 });
    if (april > plan.startDate && april <= on) n++;
  }
  return n;
}

export function amountOn(plan: SipPlan, on: IsoDate): Decimal {
  const steps = stepUpsBy(plan, on);
  const factor = HUNDRED.plus(plan.stepUpPct).div(HUNDRED);
  let a = D(plan.amount);
  for (let i = 0; i < steps; i++) a = a.times(factor);
  return a.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

export function pendingDue(plan: SipPlan, instalments: SipInstalment[], today: IsoDate): IsoDate[] {
  if (!plan.active) return [];
  const answered = new Set(instalments.filter((i) => i.sipId === plan.id).map((i) => i.dueDate));
  return occurrences(plan, addDays(today, -SIP_LOOKBACK_DAYS), today).filter((d) => !answered.has(d));
}

export function nextDue(plan: SipPlan, today: IsoDate): IsoDate | null {
  if (!plan.active) return null;
  const after = today < plan.startDate ? addDays(plan.startDate, -1) : today;
  return occurrences(plan, addDays(after, 1), addDays(after, 62))[0] ?? null;
}

const effective = (p: SipPlan, today: IsoDate) => (today < p.startDate ? p.startDate : today);

export function monthlyTotal(plans: SipPlan[], today: IsoDate): Decimal {
  return plans.filter((p) => p.active).reduce((t, p) => t.plus(amountOn(p, effective(p, today))), ZERO);
}

export function fyStart(iso: IsoDate): IsoDate {
  const { y, m } = parseIso(iso);
  return toIso({ y: m >= STEP_UP_MONTH ? y : y - 1, m: STEP_UP_MONTH, d: 1 });
}

export function investedThisFy(instalments: SipInstalment[], today: IsoDate): Decimal {
  const from = fyStart(today);
  return instalments
    .filter((i) => i.status === 'done' && i.dueDate >= from && i.dueDate <= today)
    .reduce((t, i) => t.plus(D(i.amount)), ZERO);
}

export function unitsFor(amount: Decimal.Value, nav: Decimal.Value): Decimal {
  const n = D(nav);
  if (n.lte(0)) throw new RangeError('NAV must be positive');
  return D(amount).div(n).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}

export function monthsToClose(gap: Decimal.Value, monthly: Decimal.Value): number | null {
  const g = D(gap), mo = D(monthly);
  if (g.lte(0) || mo.lte(0)) return null;
  return g.div(mo).ceil().toNumber();
}

export interface SipMixRow {
  group: AssetGroup;
  amount: Decimal;
  sipPct: number;
  targetPct: number;
}

export function sipMix(plans: SipPlan[], targets: AllocationTargets, today: IsoDate): SipMixRow[] {
  const total = monthlyTotal(plans, today);
  if (total.isZero()) return [];
  const by = new Map<AssetGroup, Decimal>();
  for (const p of plans) {
    if (!p.active) continue;
    const g = ASSET_GROUP_OF[p.assetType];
    by.set(g, (by.get(g) ?? ZERO).plus(amountOn(p, effective(p, today))));
  }
  return ASSET_GROUP_ORDER.filter((g) => by.has(g)).map((g) => ({
    group: g,
    amount: by.get(g)!,
    sipPct: by.get(g)!.times(HUNDRED).div(total).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
    targetPct: targets[g] ?? 0,
  }));
}

export function sipMixWarning(mix: SipMixRow[]): SipMixRow | null {
  let worst: SipMixRow | null = null;
  for (const r of mix) {
    const over = r.sipPct - r.targetPct;
    if (over > SIP_MIX_WARN_POINTS && (!worst || over > worst.sipPct - worst.targetPct)) worst = r;
  }
  return worst;
}
