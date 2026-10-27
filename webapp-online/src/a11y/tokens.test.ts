// WCAG contrast for the colour pairs the online app actually uses, computed from
// the shared tokens (packages/domain-ts/tokens.css), and a guard that no screen
// introduces a colour that is not a token. Runs in Node: no DOM needed.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { contrast } from '@khazana/domain/colorScience';

const tokensPath = fileURLToPath(new URL('../../../packages/domain-ts/tokens.css', import.meta.url));
const srcRoot = fileURLToPath(new URL('..', import.meta.url));

/** The light theme's custom properties, with var() references resolved to hex. */
function lightTokens(): Map<string, string> {
  const css = readFileSync(tokensPath, 'utf8');
  const root = css.slice(css.indexOf(':root {'), css.indexOf(':root[data-theme="dark"]'));
  const raw = new Map<string, string>();
  for (const m of root.matchAll(/(--[\w-]+):\s*([^;]+);/g)) raw.set(m[1], m[2].trim());
  const resolve = (value: string, depth = 0): string => {
    const ref = value.match(/^var\((--[\w-]+)\)$/);
    if (!ref || depth > 10) return value;
    return resolve(raw.get(ref[1]) ?? '', depth + 1);
  };
  return new Map([...raw].map(([k, v]) => [k, resolve(v)]));
}

const t = lightTokens();
const hex = (name: string) => {
  const v = t.get(name);
  if (!v || !/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error(`token ${name} is not a 6-digit hex (${v})`);
  return v;
};

describe('text contrast on the online app\'s surfaces (WCAG 1.4.3, 4.5:1)', () => {
  const textPairs: [string, string, string][] = [
    ['--ink', '--canvas', 'body text on the page'],
    ['--ink', '--card', 'body text on a card'],
    ['--ink', '--surface', 'text in a field or a quiet button'],
    ['--muted', '--canvas', 'helper text on the page'],
    ['--muted', '--card', 'helper text on a card'],
    ['--muted', '--surface', 'helper text on white'],
    ['--primary-fg', '--primary', 'primary button label'],
  ];
  for (const [fg, bg, what] of textPairs) {
    test(`${what}: ${fg} on ${bg}`, () => {
      expect(contrast(hex(fg), hex(bg))).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('non-text contrast (WCAG 1.4.11, 3:1)', () => {
  const nonText: [string, string, string][] = [
    ['--danger', '--canvas', 'error bar beside the error text'],
    ['--muted', '--surface', 'input edge on white'],
    ['--muted', '--card', 'input edge on a card'],
    ['--ink', '--canvas', 'keyboard focus ring'],
  ];
  for (const [fg, bg, what] of nonText) {
    test(`${what}: ${fg} on ${bg}`, () => {
      expect(contrast(hex(fg), hex(bg))).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('no colour outside the tokens', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  }

  test('no hex or rgb literal in app, components, or lib', () => {
    const offenders = sourceFiles(srcRoot).flatMap((file) => {
      const lines = readFileSync(file, 'utf8').split('\n');
      return lines
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(line))
        .map(({ n }) => `${relative(srcRoot, file)}:${n}`);
    });
    expect(offenders).toEqual([]);
  });
});
