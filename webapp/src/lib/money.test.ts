import { describe, expect, test, vi } from 'vitest';
import { D, ZERO } from './money';

describe('D — tolerant money parsing', () => {
  test('clean values are unchanged', () => {
    expect(D('72.00').toString()).toBe('72');
    expect(D('1234.56').toString()).toBe('1234.56');
    expect(D(72).toString()).toBe('72');
    expect(D(ZERO).toString()).toBe('0');
  });

  test('a trailing space no longer throws', () => {
    // The exact record that killed the Dividends screen: decimal.js rejects
    // this, and the thrown message prints "72.00" so the space is invisible.
    expect(D('72.00 ').toString()).toBe('72');
    expect(D(' 72.00').toString()).toBe('72');
    expect(D(' 72.00').toString()).toBe('72');
    expect(D('72.00​').toString()).toBe('72');
  });

  test('currency symbols and separators are recovered, not rejected', () => {
    expect(D('₹72.00').toString()).toBe('72');
    expect(D('1,234.56').toString()).toBe('1234.56');
    expect(D('₹1,23,456.78').toString()).toBe('123456.78');
  });

  test('accounting negatives survive', () => {
    expect(D('(1,234.00)').toString()).toBe('-1234');
  });

  test('negatives and exponents still work', () => {
    expect(D('-72.5').toString()).toBe('-72.5');
    expect(D('1e3').toString()).toBe('1000');
  });

  test('empty is zero, not a throw', () => {
    expect(D('').toString()).toBe('0');
    expect(D('   ').toString()).toBe('0');
  });

  test('genuinely unusable input yields zero and warns rather than killing the screen', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(D('not a number').toString()).toBe('0');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('D never throws, whatever it is handed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const v of ['', '  ', 'abc', '₹', '--', '1.2.3', 'NaN', '72.00 ']) {
      expect(() => D(v)).not.toThrow();
    }
    warn.mockRestore();
  });
});
