import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sanitizeErrorText, recordError, recentErrors, clearErrorLog, installErrorLog,
  MAX_ENTRIES, STORAGE_KEY, __resetErrorLogForTests,
} from './errorLog';

const ctx = { route: '/settings', version: '1.0.0' };

beforeEach(() => {
  localStorage.clear();
  clearErrorLog();
  __resetErrorLogForTests();
});
afterEach(() => vi.restoreAllMocks());

describe('sanitizeErrorText', () => {
  test('strips email addresses', () => {
    expect(sanitizeErrorText('Failed for someone.name+x@example.co.in today'))
      .toBe('Failed for [email] today');
  });

  test('strips query strings and fragments but keeps the path and stack position', () => {
    expect(sanitizeErrorText('GET https://api.example.com/v1/q?symbol=RELIANCE&qty=40 failed'))
      .toBe('GET https://api.example.com/v1/q failed');
    expect(sanitizeErrorText('at f (http://localhost:3000/_next/app.js?v=abc:12:345)'))
      .toBe('at f (http://localhost:3000/_next/app.js:12:345)');
    expect(sanitizeErrorText('route /transactions?account=HDFC#row-9')).toBe('route /transactions');
  });

  test('strips amounts and long digit runs', () => {
    const out = sanitizeErrorText('Balance ₹1,20,000.50 vs Rs. 900 and $45.10, total 12,345 for acct 50100234567890 at 1234.56');
    expect(out).not.toMatch(/120|900|45\.10|12,345|50100234567890|1234/);
    expect(out).toContain('[amount]');
    expect(out).toContain('[number]');
  });

  test('keeps versions and stack line/column numbers', () => {
    expect(sanitizeErrorText('v1.0.0 at chunk.js:1:123456')).toBe('v1.0.0 at chunk.js:1:123456');
  });
});

describe('ring buffer', () => {
  test('records sanitized entries with route and version', () => {
    recordError({ message: 'Bad total 98,765 for a@b.com', stack: 'Error\n at x (/a?b=1:2:3)' }, { ...ctx, now: 5 });
    const [e] = recentErrors();
    expect(e).toEqual({
      t: 5, message: 'Bad total [amount] for [email]', stack: 'Error\n at x (/a:2:3)', route: '/settings', version: '1.0.0',
    });
  });

  test(`caps at ${MAX_ENTRIES}, dropping the oldest`, () => {
    for (let i = 0; i < MAX_ENTRIES + 15; i++) recordError({ message: `err ${i}` }, ctx);
    const all = recentErrors();
    expect(all).toHaveLength(MAX_ENTRIES);
    expect(all[0].message).toBe('err 15');
    expect(all.at(-1)!.message).toBe(`err ${MAX_ENTRIES + 14}`);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toHaveLength(MAX_ENTRIES);
  });

  test('survives a reload via localStorage', () => {
    recordError({ message: 'before reload' }, ctx);
    __resetErrorLogForTests();
    expect(recentErrors().map((e) => e.message)).toEqual(['before reload']);
  });

  test('keeps working in memory when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    __resetErrorLogForTests();
    for (let i = 0; i < MAX_ENTRIES + 3; i++) expect(() => recordError({ message: `m${i}` }, ctx)).not.toThrow();
    expect(recentErrors()).toHaveLength(MAX_ENTRIES);
  });

  test('ignores corrupt stored data', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    __resetErrorLogForTests();
    expect(recentErrors()).toEqual([]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ t: 1, message: 'ok', route: '/', version: '1' }, { evil: true }]));
    __resetErrorLogForTests();
    expect(recentErrors()).toHaveLength(1);
  });
});

describe('installErrorLog', () => {
  test('captures window errors and unhandled rejections, once', () => {
    const off = installErrorLog('9.9.9');
    const offAgain = installErrorLog('9.9.9'); // idempotent
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', error: new TypeError('x is 4500.00') }));
    const rej = new Event('unhandledrejection') as Event & { reason?: unknown };
    rej.reason = { secret: 'vault' };
    window.dispatchEvent(rej);
    offAgain();
    off();
    const all = recentErrors();
    expect(all).toHaveLength(2);
    expect(all[0].message).toBe('TypeError: x is [amount]');
    expect(all[0].version).toBe('9.9.9');
    // A non-Error rejection value is never serialised.
    expect(all[1].message).toBe('Unhandled rejection: Non-error value (object)');
    expect(JSON.stringify(all)).not.toContain('vault');
  });
});
