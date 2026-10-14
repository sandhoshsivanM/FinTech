// The one-time Zentra accent reset.
//
// Installs from before the redesign carry accents (Jade, Sapphire, …) that
// paint the nav and primary buttons in a colour the near-black pill was never
// designed around. They are reset to 'default' exactly once; a choice made
// after that is the user's and must survive every later load.
//
// The reset exists twice — migrateLegacyAccent() in the store and a copy in
// the no-FOUC script in app/layout.tsx — so both are exercised here.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ACCENT_MIGRATION_KEY, migrateLegacyAccent, lsGet } from './store';

const ACCENT = 'khazana-accent';

/** The inline no-FOUC script, exactly as it ships. */
const inlineScript = (() => {
  const src = readFileSync(join(__dirname, '../app/layout.tsx'), 'utf8');
  const m = src.match(/"(\(function\(\)\{try\{var g=[\s\S]*?\}\)\(\);)"/);
  if (!m) throw new Error('no-FOUC script not found in layout.tsx');
  return m[1];
})();

const runInlineScript = () => {
  // eslint-disable-next-line no-new-func
  new Function(inlineScript)();
};

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  if (!window.matchMedia) {
    // jsdom has no matchMedia; the script reads it for the 'system' theme.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('migrateLegacyAccent (store init)', () => {
  test('resets a pre-Zentra accent once and sets the marker', () => {
    localStorage.setItem(ACCENT, 'emerald');
    migrateLegacyAccent();
    expect(lsGet(ACCENT)).toBe('default');
    expect(localStorage.getItem(ACCENT_MIGRATION_KEY)).toBe('1');
  });

  test('resets an accent still under the pre-rebrand ftos-* key', () => {
    localStorage.setItem('ftos-accent', 'blue');
    migrateLegacyAccent();
    expect(lsGet(ACCENT)).toBe('default');
  });

  test('a choice made after the reset is preserved', () => {
    localStorage.setItem(ACCENT, 'emerald');
    migrateLegacyAccent();
    localStorage.setItem(ACCENT, 'violet'); // the user picks Amethyst afterwards
    migrateLegacyAccent();
    migrateLegacyAccent();
    expect(lsGet(ACCENT)).toBe('violet');
  });

  test('touches nothing but the accent and its marker', () => {
    localStorage.setItem(ACCENT, 'rose');
    localStorage.setItem('khazana-theme', 'dark');
    localStorage.setItem('khazana-active-profile', 'p1');
    migrateLegacyAccent();
    expect(localStorage.getItem('khazana-theme')).toBe('dark');
    expect(localStorage.getItem('khazana-active-profile')).toBe('p1');
    expect(localStorage.length).toBe(4);
  });

  test('survives blocked storage without throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => migrateLegacyAccent()).not.toThrow();
  });

  test('survives a full quota on write', () => {
    localStorage.setItem(ACCENT, 'amber');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => migrateLegacyAccent()).not.toThrow();
  });
});

describe('no-FOUC script copy of the reset', () => {
  test('resets once, so an old accent never paints on first load', () => {
    localStorage.setItem(ACCENT, 'emerald');
    runInlineScript();
    expect(localStorage.getItem(ACCENT)).toBe('default');
    expect(localStorage.getItem(ACCENT_MIGRATION_KEY)).toBe('1');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
  });

  test('a later choice is applied, not reset', () => {
    localStorage.setItem(ACCENT, 'emerald');
    runInlineScript();
    localStorage.setItem(ACCENT, 'blue');
    runInlineScript();
    expect(localStorage.getItem(ACCENT)).toBe('blue');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#2F4C9C');
  });

  test('agrees with the store on the marker key', () => {
    expect(inlineScript).toContain(`'${ACCENT_MIGRATION_KEY}'`);
  });

  test('survives blocked storage without throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => runInlineScript()).not.toThrow();
  });
});
