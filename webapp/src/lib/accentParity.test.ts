import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCENTS } from './store';

/**
 * The no-FOUC script in app/layout.tsx carries a hand-copied accent table,
 * because it runs before any module loads. This keeps the copy honest: a
 * drifted value flashes the wrong accent on every page load.
 */
describe('accent table parity', () => {
  const src = readFileSync(join(__dirname, '../app/layout.tsx'), 'utf8');
  const table = src.match(/var A=(\{.*?\}\});var p=/)?.[1];

  it('finds the inline table', () => {
    expect(table).toBeTruthy();
  });

  it('matches ACCENTS in lib/store.ts exactly', () => {
    // eslint-disable-next-line no-new-func
    const A = new Function(`return ${table}`)() as Record<string, { l: string[]; d: string[] }>;
    const expected = Object.fromEntries(
      Object.entries(ACCENTS).map(([k, a]) => [k, {
        l: a.on ? [...a.light, a.on.light] : [...a.light],
        d: a.on ? [...a.dark, a.on.dark] : [...a.dark],
      }]),
    );
    expect(A).toEqual(expected);
  });
});
