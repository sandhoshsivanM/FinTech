/**
 * Twin of test/unit/notification_scheduler_test.dart. Both load
 * __fixtures__/notification_cases.json and must agree on every value.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFY_PREFS,
  inQuietHours,
  localDateKey,
  localEpochDay,
  localMinuteOfDay,
  localWallClock,
  planNotifications,
  shiftOutOfQuietHours,
  stableId,
  suppressed,
  type BudgetFact,
  type DueEvent,
  type NotificationPlanInput,
  type NotifyPrefs,
  type PlannedNotification,
} from './notificationScheduler';

const FIXTURE_PATH = resolve(__dirname, '__fixtures__/notification_cases.json');
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

const ms = (iso: string) => Date.parse(iso);

/** The subset of a PlannedNotification the fixture pins, with times as ISO. */
interface ExpectedShape {
  dedupeKey: string;
  fireAt: string;
  category: string;
  title: string;
  body: string;
  deepLink?: string;
}

const compare = (n: PlannedNotification) => ({
  dedupeKey: n.dedupeKey,
  fireAt: n.fireAt,
  category: n.category,
  title: n.title,
  body: n.body,
  deepLink: n.deepLink ?? undefined,
});

const expected = (e: ExpectedShape) => ({
  dedupeKey: e.dedupeKey,
  fireAt: ms(e.fireAt),
  category: e.category,
  title: e.title,
  body: e.body,
  deepLink: e.deepLink,
});

function inputFrom(c: Record<string, unknown>): NotificationPlanInput {
  const prefs: NotifyPrefs = {
    ...DEFAULT_NOTIFY_PREFS,
    ...(fixture.basePrefs as Partial<NotifyPrefs>),
    ...((c.prefs as Partial<NotifyPrefs>) ?? {}),
  };
  const deliveries: Record<string, number> = {};
  for (const [k, v] of Object.entries((c.deliveries as Record<string, string>) ?? {})) {
    deliveries[k] = ms(v);
  }
  return {
    now: ms(c.now as string),
    tzOffsetMinutes: c.tzOffsetMinutes as number,
    routes: fixture.routes,
    prefs,
    dueEvents: ((c.dueEvents as Record<string, unknown>[]) ?? []).map((e): DueEvent => ({
      id: e.id as string,
      category: e.category as DueEvent['category'],
      label: e.label as string,
      dueAt: ms(e.dueAt as string),
      deepLink: e.deepLink as string,
      amountText: (e.amountText as string) ?? null,
    })),
    budgets: ((c.budgets as Record<string, unknown>[]) ?? []) as unknown as BudgetFact[],
    marketAlerts: ((c.marketAlerts as ExpectedShape[]) ?? []).map((m): PlannedNotification => ({
      dedupeKey: m.dedupeKey,
      fireAt: ms(m.fireAt),
      category: m.category as PlannedNotification['category'],
      title: m.title,
      body: m.body,
      deepLink: m.deepLink,
    })),
    deliveries,
    maxPending: (c.maxPending as number) ?? 200,
  };
}

describe('stableId', () => {
  it('matches the values pinned in the fixture', () => {
    // Pinned as literals rather than recomputed: the point is that these
    // numbers are identical in Dart and unchanged next year. An alarm the OS
    // holds under one id cannot be cancelled under another.
    for (const [key, id] of Object.entries(fixture.stableIds)) {
      if (key === '_comment') continue;
      expect(stableId(key), `stableId(${JSON.stringify(key)})`).toBe(id);
    }
  });

  it('always lands in the positive-int range', () => {
    for (let i = 0; i < 2000; i++) {
      const id = stableId(`bill:rule-${i}:${20000 + i}`);
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThanOrEqual(0x7fffffff);
      expect(Number.isInteger(id)).toBe(true);
    }
  });

  it('separates keys that differ only in their tail', () => {
    expect(stableId('bill:r1:20686')).not.toBe(stableId('bill:r1:20687'));
    expect(stableId('renewal:i1:20711:14')).not.toBe(stableId('renewal:i1:20711:30'));
  });
});

describe('local time helpers', () => {
  it('round-trips a wall clock through the epoch', () => {
    for (const tz of [330, 0, -300, -720, 840]) {
      const at = localWallClock(20683, 9 * 60, tz);
      expect(localEpochDay(at, tz)).toBe(20683);
      expect(localMinuteOfDay(at, tz)).toBe(9 * 60);
    }
  });

  it('floors rather than truncates west of UTC', () => {
    // The bug this guards: -1 / 86400000 truncates toward zero, so an instant
    // just before the epoch lands on day 0 instead of day -1, and every date
    // computed west of UTC in the 1970s drifts by one.
    expect(localEpochDay(-1, 0)).toBe(-1);
    expect(localMinuteOfDay(-1, 0)).toBe(1439);
  });

  it('names the local date, not the UTC one', () => {
    // 2026-08-18T23:30+05:30 is still the 18th locally and the 18th in UTC…
    expect(localDateKey(ms('2026-08-18T23:30:00+05:30'), 330)).toBe('2026-08-18');
    // …but 2026-08-19T02:00+05:30 is the 18th in UTC and must not be reported so.
    expect(localDateKey(ms('2026-08-19T02:00:00+05:30'), 330)).toBe('2026-08-19');
  });
});

describe('quiet hours', () => {
  const prefs = { ...DEFAULT_NOTIFY_PREFS, quietStartMin: 22 * 60, quietEndMin: 8 * 60 };

  it('wraps midnight', () => {
    expect(inQuietHours(23 * 60 + 30, prefs)).toBe(true);
    expect(inQuietHours(2 * 60, prefs)).toBe(true);
    expect(inQuietHours(22 * 60, prefs)).toBe(true);   // inclusive start
    expect(inQuietHours(8 * 60, prefs)).toBe(false);   // exclusive end
    expect(inQuietHours(12 * 60, prefs)).toBe(false);
  });

  it('handles a non-wrapping window', () => {
    const day = { ...prefs, quietStartMin: 9 * 60, quietEndMin: 17 * 60 };
    expect(inQuietHours(12 * 60, day)).toBe(true);
    expect(inQuietHours(2 * 60, day)).toBe(false);
  });

  it('only ever moves a fire time forward', () => {
    for (const hour of [0, 3, 7, 8, 12, 21, 22, 23]) {
      const at = localWallClock(20683, hour * 60, 330);
      expect(shiftOutOfQuietHours(at, prefs, 330)).toBeGreaterThanOrEqual(at);
    }
  });

  it('lands outside the window wherever it started', () => {
    for (const hour of [0, 3, 7, 22, 23]) {
      const at = localWallClock(20683, hour * 60, 330);
      const moved = shiftOutOfQuietHours(at, prefs, 330);
      expect(inQuietHours(localMinuteOfDay(moved, 330), prefs)).toBe(false);
    }
  });
});

describe('suppressed', () => {
  const now = ms('2026-08-18T10:00:00+05:30');

  it('is false for a key that has never fired', () => {
    expect(suppressed('k', {}, 24, now)).toBe(false);
  });

  it('is true inside the cooldown and false outside it', () => {
    expect(suppressed('k', { k: now - 23 * 3600_000 }, 24, now)).toBe(true);
    expect(suppressed('k', { k: now - 25 * 3600_000 }, 24, now)).toBe(false);
  });

  it('treats a zero cooldown as no cooldown', () => {
    expect(suppressed('k', { k: now }, 0, now)).toBe(false);
  });
});

describe('planNotifications — shared fixture', () => {
  it('the two copies of the fixture are byte-identical', () => {
    // Vitest cannot import from outside webapp/, so the file is duplicated
    // rather than symlinked. Duplicated files drift; this is what stops it.
    // If this fails, copy test/fixtures/notification_cases.json over
    // webapp/src/domain/__fixtures__/notification_cases.json.
    const dart = readFileSync(resolve(__dirname, '../../../test/fixtures/notification_cases.json'));
    const web = readFileSync(FIXTURE_PATH);
    expect(web.equals(dart)).toBe(true);
  });

  for (const c of fixture.cases as Record<string, unknown>[]) {
    it(c.name as string, () => {
      const plan = planNotifications(inputFrom(c));
      const e = c.expect as Record<string, unknown>;

      expect(plan.immediate.map(compare))
        .toEqual((e.immediate as ExpectedShape[]).map(expected));
      expect(plan.scheduled.map(compare))
        .toEqual((e.scheduled as ExpectedShape[]).map(expected));
      expect(plan.missed.map(compare))
        .toEqual((e.missed as ExpectedShape[]).map(expected));
      expect(plan.truncated).toBe(e.truncated as number);
    });
  }

  it('every case is deterministic', () => {
    // A planner whose output depends on map iteration order or an ambient clock
    // would pass once and fail in CI.
    for (const c of fixture.cases as Record<string, unknown>[]) {
      const a = planNotifications(inputFrom(c));
      const b = planNotifications(inputFrom(c));
      expect(a).toEqual(b);
    }
  });

  it('no planned notification ever carries a duplicate id', () => {
    for (const c of fixture.cases as Record<string, unknown>[]) {
      const plan = planNotifications(inputFrom(c));
      const all = [...plan.immediate, ...plan.scheduled, ...plan.missed];
      const ids = all.map((n) => stableId(n.dedupeKey));
      expect(new Set(ids).size, `${c.name}: two notifications share an OS id`)
        .toBe(ids.length);
    }
  });
});
