// Khazana Online is a separate app from the offline Khazana (ADR 0007): it
// never imports the offline app and never touches its storage. Shared code
// comes only through packages/.
import { expect, test } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gatewayOrigin, headersFile } from './headers.mjs';

const app = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mjs|css)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

test('nothing imports the offline web app or opens its database', () => {
  const offline = [/from\s+['"][^'"]*\/webapp\//, /import\s*\(\s*['"][^'"]*\/webapp\//, /['"]fintech_os['"]/, /@import\s+["'][^"']*\/webapp\//];
  const hits = [...sourceFiles(join(app, 'src')), join(app, 'next.config.ts'), join(app, 'tsconfig.json')].flatMap((file) =>
    offline.filter((re) => re.test(readFileSync(file, 'utf8'))).map((re) => `${file.slice(app.length + 1)}: ${re}`),
  );
  expect(hits).toEqual([]);
});

test('the CSP allows this site and the gateway only', () => {
  const file = headersFile('https://api.khazana.example/');
  const csp = /Content-Security-Policy: (.+)/.exec(file)![1];
  expect(csp.split('; ').find((d) => d.startsWith('connect-src'))).toBe("connect-src 'self' https://api.khazana.example");
  expect(csp).toContain("frame-ancestors 'none'");
});

test('a plain-http gateway is refused unless it is localhost', () => {
  expect(gatewayOrigin('http://localhost:5196')).toBe('http://localhost:5196');
  expect(() => gatewayOrigin('http://api.khazana.example')).toThrow(/https/);
});
