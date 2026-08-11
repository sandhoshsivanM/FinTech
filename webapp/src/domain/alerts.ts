/**
 * The alert engine (Hardening Plan §5).
 *
 * Khazana has no backend, no push service and no continuous worker, so an alert
 * is a local rule evaluated when the app opens or the relevant screen refreshes.
 * Everything here is built around admitting that rather than hiding it: an
 * alert records *when it was last checked*, and a market alert records *how old
 * the price behind that check was*. A surface that cannot say those two things
 * is implying cloud monitoring it does not do.
 *
 * This is also the only evaluator. There used to be two — one in the Alerts
 * page and a second, subtly different one in the notification bell — so the
 * same alert could be "met" in one place and not the other. Both now call
 * `evaluateAlerts`.
 *
 * Nothing here writes. `evaluateAlerts` returns the alerts as they should now
 * be, and the caller persists them; a rule engine that saves as a side effect
 * cannot be tested without a database.
 */
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import {
  ALERT_TYPE_OF,
  type Alert, type AlertState, type AlertType,
  type Budget, type Category, type Holding, type Insurance, type Txn,
} from '@/lib/types';
import { spentForCategory } from './finance';
import { currentMonth } from './period';

/** Everything the rules can see. Pure input — no store, no clock of its own. */
export interface AlertInputs {
  alerts: Alert[];
  holdings: Holding[];
  budgets: Budget[];
  categories: Category[];
  txns: Txn[];
  insurances: Insurance[];
  now: number;
}

export interface AlertEvaluation {
  alert: Alert;
  type: AlertType;
  /** Whether the condition holds right now. */
  met: boolean;
  /** Human-readable rendering of the typed condition (§5.4). */
  message: string;
  /**
   * How old the data behind this verdict is, for MARKET alerts.
   * Null when the rule reads only local records, which are never stale.
   */
  dataAsOf: number | null;
  /** True when a MARKET rule had no price to compare against. */
  unevaluable: boolean;
}

const pct = (n: Decimal) => `${n.toDecimalPlaces(1).toString()}%`;

/**
 * The next state, given the old one and whether the condition now holds.
 *
 * A dismissed alert re-arms once its condition stops holding — otherwise
 * dismissing "Food is over budget" in August would silence it forever, and the
 * user would never hear about September.
 */
export function nextState(previous: AlertState, met: boolean): AlertState {
  if (!met) return 'ARMED';
  return previous === 'DISMISSED' ? 'DISMISSED' : 'TRIGGERED';
}

/** Where an alert stands today, defaulting records written before §5. */
export const stateOf = (a: Alert): AlertState => a.state ?? 'ARMED';

/**
 * Evaluates one rule.
 *
 * Comparisons stay in Decimal. The previous implementation dropped to
 * `.toNumber()` on both sides, which is a float comparison against a threshold
 * the user typed as money — the one place rounding is least forgivable.
 */
function evaluateOne(a: Alert, input: AlertInputs): AlertEvaluation {
  const type = ALERT_TYPE_OF[a.kind];
  const threshold = D(a.threshold);

  switch (a.kind) {
    case 'price_above':
    case 'price_below': {
      const h = input.holdings.find((x) => x.symbol === a.symbol);
      // A holding with no recorded price cannot be compared. It used to fall
      // back to average cost, so a "price below" alert could fire against a
      // number that was never a market price at all (§7.1).
      if (!h || h.lastPrice == null || h.lastPrice === '') {
        return {
          alert: a, type, met: false, dataAsOf: null, unevaluable: true,
          message: `${a.symbol ?? 'This holding'} has no recorded price, so this rule cannot be checked.`,
        };
      }
      const price = D(h.lastPrice);
      const met = a.kind === 'price_above' ? price.gt(threshold) : price.lt(threshold);
      const dataAsOf = h.priceAsOf ?? null;
      return {
        alert: a, type, met, dataAsOf, unevaluable: false,
        message: `${a.symbol} is ${price.toString()}, ${a.kind === 'price_above' ? 'above' : 'below'} ${threshold.toString()}.`,
      };
    }

    case 'weight_above': {
      const total = input.holdings.reduce(
        (s, h) => s.plus(D(h.quantity).times(D(h.lastPrice ?? h.avgCost))), ZERO,
      );
      const h = input.holdings.find((x) => x.symbol === a.symbol);
      if (!h || total.lte(0)) {
        return {
          alert: a, type, met: false, dataAsOf: null, unevaluable: true,
          message: `${a.symbol ?? 'This holding'} is not in the portfolio, so its weight cannot be checked.`,
        };
      }
      const value = D(h.quantity).times(D(h.lastPrice ?? h.avgCost));
      const weight = value.div(total).times(100);
      // Weight is computed from whatever prices exist, so it is only as fresh
      // as the oldest of them. Reported rather than assumed current.
      const stamps = input.holdings.map((x) => x.priceAsOf).filter((t): t is number => t != null);
      const dataAsOf = stamps.length ? stamps.reduce((m, t) => (t < m ? t : m), stamps[0]) : null;
      return {
        alert: a, type, met: weight.gt(threshold), dataAsOf, unevaluable: false,
        message: `${a.symbol} is ${pct(weight)} of the portfolio, above ${pct(threshold)}.`,
      };
    }

    case 'budget_over': {
      // Creatable since the beginning and evaluated by nothing: the old handler
      // fell through to `return false`, so this alert could never fire.
      const month = currentMonth(input.now);
      const budget = input.budgets.find((b) => b.categoryId === a.symbol);
      if (!budget) {
        return {
          alert: a, type, met: false, dataAsOf: null, unevaluable: true,
          message: 'No budget is set for that category, so this rule cannot be checked.',
        };
      }
      const name = input.categories.find((c) => c.id === budget.categoryId)?.name ?? 'That category';
      const spent = spentForCategory(input.txns, budget.categoryId, month);
      const limit = D(budget.amountLimit);
      // The threshold is a percentage of the limit, so one rule covers both
      // "warn me at 90%" and "tell me when I go over" (§5.2).
      const target = limit.times(threshold).div(100);
      const share = limit.isZero() ? ZERO : spent.div(limit).times(100);
      return {
        alert: a, type, met: spent.gte(target) && limit.gt(0), dataAsOf: null, unevaluable: false,
        message: `${name} spending is ${pct(share)} of the ${month.label.split(' · ')[0]} budget (${spent.toString()} of ${limit.toString()}).`,
      };
    }

    case 'renewal_due': {
      // Also never evaluated before. The threshold is a number of days.
      const days = threshold.toNumber();
      const horizon = input.now + days * 86_400_000;
      const due = input.insurances
        .filter((i) => i.renewalDate != null && i.renewalDate >= input.now && i.renewalDate <= horizon)
        .sort((x, y) => (x.renewalDate ?? 0) - (y.renewalDate ?? 0));
      if (due.length === 0) {
        return {
          alert: a, type, met: false, dataAsOf: null, unevaluable: false,
          message: `No policy renews in the next ${days} day${days === 1 ? '' : 's'}.`,
        };
      }
      const first = due[0];
      const inDays = Math.ceil(((first.renewalDate ?? input.now) - input.now) / 86_400_000);
      return {
        alert: a, type, met: true, dataAsOf: null, unevaluable: false,
        message: `${first.name} renews in ${inDays} day${inDays === 1 ? '' : 's'}${due.length > 1 ? `, and ${due.length - 1} more` : ''}.`,
      };
    }
  }
}

export interface AlertRun {
  evaluations: AlertEvaluation[];
  /** The alerts as they should now be persisted. */
  updated: Alert[];
  /** How many changed, so a caller can skip a pointless write. */
  changed: number;
  evaluatedAt: number;
}

/**
 * Evaluates every active rule and returns both the verdicts and the records to
 * save. Inactive alerts are passed through untouched — paused means paused, and
 * stamping `lastEvaluatedAt` on one would claim a check that did not happen.
 */
export function evaluateAlerts(input: AlertInputs): AlertRun {
  const evaluations: AlertEvaluation[] = [];
  const updated: Alert[] = [];
  let changed = 0;

  for (const a of input.alerts) {
    if (!a.active) {
      updated.push(a);
      continue;
    }

    const e = evaluateOne(a, input);
    evaluations.push(e);

    const previous = stateOf(a);
    const state = e.unevaluable ? previous : nextState(previous, e.met);
    const next: Alert = {
      ...a,
      state,
      lastEvaluatedAt: input.now,
      lastTriggeredAt: e.met ? input.now : (a.lastTriggeredAt ?? null),
      dataAsOf: e.dataAsOf,
    };
    if (
      state !== previous
      || next.lastTriggeredAt !== (a.lastTriggeredAt ?? null)
      || next.dataAsOf !== (a.dataAsOf ?? null)
      || a.lastEvaluatedAt == null
    ) changed += 1;
    updated.push(next);
  }

  return { evaluations, updated, changed, evaluatedAt: input.now };
}

/** Alerts currently firing and not yet acknowledged — what the bell shows. */
export const triggered = (run: AlertRun): AlertEvaluation[] =>
  run.evaluations.filter((e) => e.met && stateOf(e.alert) !== 'DISMISSED');
