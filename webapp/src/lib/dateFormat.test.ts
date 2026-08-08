import { describe, expect, test } from 'vitest';
import {
  formatDate, formatDayMonth, formatLongDate, formatMonthShort, formatMonthYear,
  fromInputValue, toInputValue,
} from './dateFormat';
import { parseDateCell } from './dateParse';

const AUG_8 = new Date(2026, 7, 8, 14, 30); // 8 Aug 2026, afternoon
const MAR_1 = new Date(2026, 2, 1);

describe('formatDate — dd/MM/yyyy everywhere', () => {
  test('pads both day and month', () => {
    expect(formatDate(MAR_1)).toBe('01/03/2026');
  });

  test('day comes first', () => {
    // The whole point: 08/12 is 8 December, never 12 August.
    expect(formatDate(new Date(2026, 11, 8))).toBe('08/12/2026');
  });

  test('accepts epoch ms as well as Date', () => {
    expect(formatDate(AUG_8.getTime())).toBe(formatDate(AUG_8));
  });

  test('an invalid date renders as empty, not "Invalid Date"', () => {
    expect(formatDate(NaN)).toBe('');
  });
});

describe('other formats', () => {
  test('formatDayMonth is dd/MM', () => {
    expect(formatDayMonth(MAR_1)).toBe('01/03');
  });

  test('month buckets stay named to avoid ambiguity beside dd/MM labels', () => {
    expect(formatMonthShort(MAR_1)).toBe('Mar 26');
    expect(formatMonthYear(MAR_1)).toBe('Mar 2026');
  });

  test('formatLongDate keeps the weekday and the dd/MM/yyyy body', () => {
    expect(formatLongDate(new Date(2026, 7, 8))).toBe('Saturday, 08/08/2026');
  });
});

describe('input value plumbing', () => {
  test('toInputValue is yyyy-MM-dd', () => {
    expect(toInputValue(MAR_1)).toBe('2026-03-01');
  });

  test('uses local parts, not UTC', () => {
    // toISOString() would shift a late-in-the-day date back one for anyone
    // east of Greenwich. This is the bug that guard prevents.
    const lateEvening = new Date(2026, 7, 8, 23, 45);
    expect(toInputValue(lateEvening)).toBe('2026-08-08');
  });

  test('round-trips through fromInputValue', () => {
    const ms = fromInputValue('2026-08-08')!;
    expect(toInputValue(ms)).toBe('2026-08-08');
    expect(formatDate(ms)).toBe('08/08/2026');
  });

  test('rejects malformed input rather than guessing', () => {
    expect(fromInputValue('08/08/2026')).toBeNull();
    expect(fromInputValue('')).toBeNull();
  });
});

describe('typed dd/MM/yyyy agrees with the file importer', () => {
  // DateInput commits through parseDateCell, so a date typed by hand and the
  // same date read from a statement must land on the identical day.
  test('what a user types formats back to what they typed', () => {
    for (const typed of ['08/08/2026', '8/8/2026', '08-08-2026', '8 Aug 2026']) {
      const ms = parseDateCell(typed, true)!;
      expect(formatDate(ms)).toBe('08/08/2026');
    }
  });

  test('day-first is honoured for ambiguous input', () => {
    expect(formatDate(parseDateCell('01/02/2026', true)!)).toBe('01/02/2026');
  });
});
