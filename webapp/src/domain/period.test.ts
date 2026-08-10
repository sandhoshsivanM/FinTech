// The boundary contract is the whole point of this module: if `end` is not the
// last millisecond of the last day, a transaction recorded at 6pm on the 31st
// silently falls outside the month it belongs to.
import { describe, expect, test } from 'vitest';
import {
  contains, currentMonth, custom, daysIn, endOfDay, financialYearToDate, forMonth,
  monthsBack, monthsIn, nextMonth, previousMonth, startOfDay, trailingDays,
} from './period';

// 9 Aug 2026, 14:30 local.
const AUG = new Date(2026, 7, 9, 14, 30).getTime();

describe('boundaries', () => {
  test('a month starts at local midnight on the 1st', () => {
    const r = forMonth(AUG);
    const d = new Date(r.start);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 7, 1, 0]);
  });

  test('a month ends at the last millisecond of the last day', () => {
    const r = forMonth(AUG);
    const d = new Date(r.end);
    expect([d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()])
      .toEqual([7, 31, 23, 59, 59]);
    expect(d.getMilliseconds()).toBe(999);
  });

  test('both ends are inclusive', () => {
    const r = forMonth(AUG);
    expect(contains(r, r.start)).toBe(true);
    expect(contains(r, r.end)).toBe(true);
    expect(contains(r, r.start - 1)).toBe(false);
    expect(contains(r, r.end + 1)).toBe(false);
  });

  test('an evening transaction on the last day is inside the month', () => {
    // The exact failure an exclusive end produces.
    const r = forMonth(AUG);
    expect(contains(r, new Date(2026, 7, 31, 18, 0).getTime())).toBe(true);
  });

  test('startOfDay and endOfDay bracket exactly one day', () => {
    expect(endOfDay(AUG) - startOfDay(AUG)).toBe(86_400_000 - 1);
  });

  test('a month knows how many days it has', () => {
    expect(daysIn(forMonth(AUG))).toBe(31);
    expect(daysIn(forMonth(new Date(2026, 1, 15).getTime()))).toBe(28);
    expect(daysIn(forMonth(new Date(2024, 1, 15).getTime()))).toBe(29);
  });
});

describe('month navigation', () => {
  test('previous and next cross a year boundary', () => {
    const jan = new Date(2026, 0, 15).getTime();
    expect(new Date(previousMonth(jan).start).getFullYear()).toBe(2025);
    expect(new Date(previousMonth(jan).start).getMonth()).toBe(11);
    const dec = new Date(2026, 11, 15).getTime();
    expect(new Date(nextMonth(dec).start).getFullYear()).toBe(2027);
  });

  test('stepping back from the 31st does not skip a short month', () => {
    // Naive date arithmetic turns 31 March minus one month into 3 March.
    const mar31 = new Date(2026, 2, 31).getTime();
    expect(new Date(previousMonth(mar31).start).getMonth()).toBe(1);
  });

  test('the current month is the month containing now', () => {
    expect(currentMonth(AUG).start).toBe(forMonth(AUG).start);
    expect(currentMonth(AUG).label).toBe('August 2026 · 1–31 Aug');
  });
});

describe('monthsBack', () => {
  test('3 months ending in August is June through August, whole', () => {
    const r = monthsBack(3, AUG);
    expect(new Date(r.start).getMonth()).toBe(5);
    expect(new Date(r.start).getDate()).toBe(1);
    expect(new Date(r.end).getMonth()).toBe(7);
    expect(new Date(r.end).getDate()).toBe(31);
  });

  test('it counts whole calendar months, not 30-day blocks', () => {
    // A trailing 90 days from 9 Aug starts 11 May: it would drop the first ten
    // days of June while including part of May, under a "3 months" caption.
    const r = monthsBack(3, AUG);
    expect(contains(r, new Date(2026, 5, 1).getTime())).toBe(true);
    expect(contains(r, new Date(2026, 4, 31).getTime())).toBe(false);
  });

  test('the label names the resolved dates, never a relative token', () => {
    expect(monthsBack(3, AUG).label).toBe('Jun 1 – Aug 31, 2026');
  });

  test('a 12-month window spans two calendar years in its label', () => {
    expect(monthsBack(12, AUG).label).toBe('Sep 1, 2025 – Aug 31, 2026');
  });
});

describe('financial year', () => {
  test('August falls in the FY that began that April', () => {
    const r = financialYearToDate(AUG);
    expect(new Date(r.start).getFullYear()).toBe(2026);
    expect(new Date(r.start).getMonth()).toBe(3);
    expect(r.label).toContain('FY 26–27');
  });

  test('February falls in the FY that began the previous April', () => {
    const feb = new Date(2026, 1, 10).getTime();
    const r = financialYearToDate(feb);
    expect(new Date(r.start).getFullYear()).toBe(2025);
    expect(r.label).toContain('FY 25–26');
  });

  test('it stops at today rather than claiming future months', () => {
    expect(financialYearToDate(AUG).end).toBe(endOfDay(AUG));
  });
});

describe('custom and trailing', () => {
  test('a reversed custom range is ordered, not empty', () => {
    const r = custom(new Date(2026, 7, 20).getTime(), new Date(2026, 7, 1).getTime());
    expect(r.start).toBeLessThan(r.end);
    expect(daysIn(r)).toBe(20);
  });

  test('custom ends snap outward to whole days', () => {
    const r = custom(new Date(2026, 7, 1, 9, 0).getTime(), new Date(2026, 7, 5, 9, 0).getTime());
    expect(contains(r, new Date(2026, 7, 1, 0, 0).getTime())).toBe(true);
    expect(contains(r, new Date(2026, 7, 5, 23, 59, 59, 999).getTime())).toBe(true);
  });

  test('a trailing window counts today as one of its days', () => {
    expect(daysIn(trailingDays(30, AUG))).toBe(30);
  });

  test('a trailing window is labelled with dates, so it cannot read as a month', () => {
    expect(trailingDays(30, AUG).label).toBe('Jul 11 – Aug 9, 2026');
  });
});

describe('monthsIn', () => {
  test('buckets a span into whole months, oldest first', () => {
    const ms = monthsIn(monthsBack(3, AUG));
    expect(ms).toHaveLength(3);
    expect(ms.map((m) => new Date(m.start).getMonth())).toEqual([5, 6, 7]);
  });

  test('a single month buckets to itself', () => {
    expect(monthsIn(forMonth(AUG))).toHaveLength(1);
  });

  test('buckets tile the range with no gap and no overlap', () => {
    const r = monthsBack(6, AUG);
    const ms = monthsIn(r);
    expect(ms[0].start).toBe(r.start);
    expect(ms[ms.length - 1].end).toBe(r.end);
    for (let i = 1; i < ms.length; i++) expect(ms[i].start).toBe(ms[i - 1].end + 1);
  });
});
