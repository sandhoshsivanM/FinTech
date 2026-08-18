'use client';
/**
 * Runs the notification scheduler against the unlocked vault and dispatches
 * whatever it says should be said now.
 *
 * The web's whole background story lives in one field of the plan: `missed`.
 * There is no OS scheduler here and no push, so a reminder whose moment passed
 * while Khazana was closed has no way to have been delivered — the best this
 * platform can do is notice on the next visit and say so. `scheduled` is
 * therefore *not* dispatched; it is what the mobile apps hand to AlarmManager,
 * and it is surfaced here only so the UI can be honest about what is pending.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { D } from '@/lib/money';
import { useApp } from '@/lib/store';
import { useNow } from '@/lib/useNow';
import {
  planNotifications,
  type DueEvent,
  type NotificationPlan,
  type PlannedNotification,
} from '@/domain/notificationScheduler';
import { evaluateAlerts, triggered } from '@/domain/alerts';
import { spentForCategory } from '@/domain/finance';
import { currentMonth } from '@/domain/period';
import { showLocal } from './notify';
import {
  getNotifyPrefsServerSnapshot,
  getNotifyPrefsSnapshot,
  loadDeliveryLog,
  recordDeliveries,
  subscribeNotifyPrefs,
} from './notifyPrefs';

const ROUTES = { budget: '/budget', dashboard: '/dashboard' } as const;

/** `YYYY-MM`, matching the period half of a budget dedupe key. */
const periodKey = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const EMPTY_PLAN: NotificationPlan = {
  immediate: [], scheduled: [], missed: [], truncated: 0,
};

/** Which hook instance currently owns dispatch. See the effect that claims it. */
let dispatchOwner: number | null = null;
let nextInstanceId = 0;

export function useNotificationDriver() {
  const [instanceId] = useState(() => (nextInstanceId += 1));
  const now = useNow(60_000);
  const prefs = useSyncExternalStore(
    subscribeNotifyPrefs, getNotifyPrefsSnapshot, getNotifyPrefsServerSnapshot,
  );
  const [log, setLog] = useState<Record<string, number>>(() => loadDeliveryLog());

  const txns = useApp((s) => s.txns);
  const categories = useApp((s) => s.categories);
  const budgets = useApp((s) => s.budgets);
  const recurring = useApp((s) => s.recurring);
  const insurances = useApp((s) => s.insurances);
  const goals = useApp((s) => s.goals);
  const holdings = useApp((s) => s.holdings);
  const alerts = useApp((s) => s.alerts);

  const dueEvents = useMemo<DueEvent[]>(() => {
    const out: DueEvent[] = [];
    for (const r of recurring) {
      out.push({
        id: r.id,
        category: 'bills',
        label: r.merchant?.trim() || 'Recurring transaction',
        dueAt: r.nextRun,
        deepLink: '/recurring',
        amountText: r.amount,
      });
    }
    for (const i of insurances) {
      if (i.renewalDate == null) continue;
      out.push({
        id: i.id,
        category: 'renewals',
        label: i.name,
        dueAt: i.renewalDate,
        deepLink: '/insurance',
        amountText: i.premium,
      });
    }
    for (const g of goals) {
      if (g.targetDate == null) continue;
      // A goal already met is not a deadline any more.
      if (D(g.currentAmount).gte(D(g.targetAmount))) continue;
      out.push({
        id: g.id,
        category: 'goals',
        label: g.name,
        dueAt: g.targetDate,
        deepLink: '/goals',
        amountText: g.targetAmount,
      });
    }
    return out;
  }, [recurring, insurances, goals]);

  const plan = useMemo<NotificationPlan>(() => {
    if (!prefs.enabled) return EMPTY_PLAN;

    const month = currentMonth(now);
    const period = periodKey(now);

    const budgetFacts = budgets.map((b) => {
      const limit = D(b.amountLimit);
      const spent = spentForCategory(txns, b.categoryId, month);
      // Floored whole percent, in Decimal — the same arithmetic the Dart side
      // does, because this number goes into the dedupe key as well as the text.
      const spentPct = limit.lte(0)
        ? 0
        : spent.times(100).div(limit).floor().toNumber();
      return {
        categoryId: b.categoryId,
        categoryName: categories.find((c) => c.id === b.categoryId)?.name ?? 'Category',
        thresholdPct: b.alertThresholdPct,
        spentPct,
        period,
        amountText: `${spent.toString()} of ${limit.toString()}`,
      };
    });

    // Market rules can only ever be immediate: a price crossing is not knowable
    // in advance, and on the web the price is whatever the user last typed in.
    const run = evaluateAlerts({
      alerts, holdings, budgets, categories, txns, insurances, now,
    });
    const marketAlerts: PlannedNotification[] = triggered(run)
      .filter((e) => e.type === 'MARKET')
      .map((e) => ({
        dedupeKey: `rule:${e.alert.id}:${e.alert.lastTriggeredAt ?? now}`,
        fireAt: now,
        category: 'market' as const,
        title: e.alert.label,
        body: e.message,
        deepLink: '/alerts',
      }));

    return planNotifications({
      now,
      tzOffsetMinutes: -new Date(now).getTimezoneOffset(),
      routes: ROUTES,
      prefs,
      dueEvents,
      budgets: budgetFacts,
      marketAlerts,
      deliveries: log,
    });
  }, [prefs, now, budgets, txns, categories, alerts, holdings, insurances, dueEvents, log]);

  // Only the first mounted instance dispatches. The hook is used in more than
  // one place — the frame, to actually post notifications, and the bell, to
  // render what is pending — and each has its own copy of the delivery log in
  // state, so two dispatchers would each see an unfired key and post it. The
  // claim is module-level rather than a ref because that is the only scope in
  // which two separate component instances can agree.
  const owner = useRef(false);
  useEffect(() => {
    if (dispatchOwner === null) {
      dispatchOwner = instanceId;
      owner.current = true;
    }
    return () => {
      if (owner.current) {
        dispatchOwner = null;
        owner.current = false;
      }
    };
  }, [instanceId]);

  // Guards a re-render landing between the dispatch and the log write.
  const dispatching = useRef(false);

  useEffect(() => {
    if (!owner.current) return;
    if (!prefs.enabled || plan.immediate.length === 0) return;
    if (dispatching.current) return;
    dispatching.current = true;

    const fired = plan.immediate;
    void (async () => {
      try {
        for (const n of fired) await showLocal(n);
        setLog(recordDeliveries(fired.map((n) => n.dedupeKey), Date.now()));
      } finally {
        dispatching.current = false;
      }
    })();
  }, [plan, prefs.enabled]);

  /**
   * Acknowledges the "while you were away" items, so they stop being offered.
   * Called by the bell when the user opens it — seeing the list is the delivery.
   */
  const acknowledgeMissed = useCallback(() => {
    if (plan.missed.length === 0) return;
    setLog(recordDeliveries(plan.missed.map((n) => n.dedupeKey), Date.now()));
  }, [plan.missed]);

  return { plan, prefs, acknowledgeMissed };
}
