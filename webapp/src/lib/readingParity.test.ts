// Text size and font (Settings → Appearance) exist twice: TEXT_SIZES /
// FONT_FAMILIES in @khazana/domain/appearance, applied by the store, and a copy
// in the no-FOUC script in app/layout.tsx that applies them before first paint.
// If the copies drift, a reader who chose large text sees small text flash on
// every load — or a font the store would never pick.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import { FONT_FAMILIES, TEXT_SIZES, readingVars } from '@khazana/domain/appearance';
import { applyAppearance } from './store';

const inlineScript = (() => {
  const src = readFileSync(join(__dirname, '../app/layout.tsx'), 'utf8');
  const m = src.match(/"(\(function\(\)\{try\{var g=[\s\S]*?\}\)\(\);)"/);
  if (!m) throw new Error('no-FOUC script not found in layout.tsx');
  return m[1];
})();

const root = () => document.documentElement.style;
const applied = () => ({
  scale: root().getPropertyValue('--font-scale'),
  font: root().getPropertyValue('--font-sans'),
});

const viaScript = (size: string, font: string) => {
  document.documentElement.removeAttribute('style');
  localStorage.setItem('khazana-text-size', size);
  localStorage.setItem('khazana-font', font);
  new Function(inlineScript)();
  return applied();
};

const viaStore = (size: string, font: string) => {
  document.documentElement.removeAttribute('style');
  localStorage.setItem('khazana-text-size', size);
  localStorage.setItem('khazana-font', font);
  applyAppearance();
  return applied();
};

beforeEach(() => {
  localStorage.clear();
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    });
  }
});

describe('no-FOUC script agrees with the store', () => {
  test.each(Object.keys(TEXT_SIZES))('text size %s', (size) => {
    const script = viaScript(size, 'default');
    const store = viaStore(size, 'default');
    // The script leaves the default unset (the CSS default is 1); the store sets 1.
    expect(Number(script.scale || '1')).toBe(Number(store.scale));
    expect(Number(store.scale)).toBe(TEXT_SIZES[size as keyof typeof TEXT_SIZES].scale);
  });

  test.each(Object.keys(FONT_FAMILIES))('font %s', (font) => {
    expect(viaScript('default', font).font).toBe(viaStore('default', font).font);
    expect(viaStore('default', font).font || null).toBe(readingVars('default', font)['--font-sans']);
  });

  test('unknown stored values fall back to the defaults in both', () => {
    expect(viaScript('enormous', 'comic')).toEqual({ scale: '', font: '' });
    expect(viaStore('enormous', 'comic')).toEqual({ scale: '1', font: '' });
  });
});

describe('fonts.ts declares every web font the table names', () => {
  const fontsSrc = readFileSync(join(__dirname, 'fonts.ts'), 'utf8');
  test.each(Object.entries(FONT_FAMILIES).filter(([, f]) => f.value?.startsWith('var(')))(
    '%s', (_key, f) => {
      const variable = f.value!.slice(4, -1);
      expect(fontsSrc).toContain(`variable: '${variable}'`);
    },
  );
  test('every face ships latin-ext, the subset that carries ₹', () => {
    const webFonts = Object.values(FONT_FAMILIES).filter((f) => f.value?.startsWith('var(')).length;
    expect(fontsSrc.match(/subsets: \['latin', 'latin-ext'\]/g)?.length).toBe(webFonts);
  });
});
