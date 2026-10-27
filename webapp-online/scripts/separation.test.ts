// Khazana Online is a separate app from the offline Khazana (ADR 0007): it
// never imports the offline app and never touches its storage. Shared code
// comes only through packages/.
import { expect, test } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gatewayOrigin, headersFile } from './headers.mjs';

const app = join(__dirname, '..');
const repo = join(app, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mjs|css)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

// The shared UI and screens packages are compiled into this app, so they are
// checked too. `@khazana/screens` itself is allowed (ADR 0007, amended
// 2026-10-27); a path into /webapp/ or /webapp-online/ is not.
test('nothing imports the offline web app or opens its database', () => {
  const offline = [/from\s+['"][^'"]*\/webapp\//, /import\s*\(\s*['"][^'"]*\/webapp\//, /['"]fintech_os['"]/, /@import\s+["'][^"']*\/webapp\//];
  const files = [...sourceFiles(join(app, 'src')), ...sourceFiles(join(repo, 'packages/ui-ts')), ...sourceFiles(join(repo, 'packages/screens-ts')), join(app, 'next.config.ts'), join(app, 'tsconfig.json')];
  const hits = files.flatMap((file) =>
    offline.filter((re) => re.test(readFileSync(file, 'utf8'))).map((re) => `${file.slice(repo.length + 1)}: ${re}`),
  );
  expect(hits).toEqual([]);
});

// The screens are shared with the offline app, which never talks to a server,
// so the package holds no storage and no network: each app injects its own.
test('packages/screens-ts has no storage, network or Tauri code', () => {
  const banned = [/from\s+['"]dexie['"]/, /new\s+Dexie/, /\bindexedDB\./, /\bfetch\s*\(/, /XMLHttpRequest/, /new\s+WebSocket/, /EventSource/, /sendBeacon/, /@tauri-apps/, /plugin-http/, /fintech_os/];
  // Screen preferences (not vault data) may use localStorage, from these files only.
  const prefs = new Set(['src/components/DemoBadge.tsx', 'src/lib/prefs.ts', 'src/lib/useDashboardLayout.ts']);
  const root = join(repo, 'packages/screens-ts');
  const files = sourceFiles(join(root, 'src'));
  expect(files.length).toBeGreaterThan(50);
  const hits = files.flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    const rel = file.slice(root.length + 1);
    const found = banned.filter((re) => re.test(text)).map(String);
    if (!prefs.has(rel) && /localStorage|sessionStorage/.test(text)) found.push('localStorage');
    return found.map((f) => `${rel}: ${f}`);
  });
  expect(hits).toEqual([]);
});

test('the CSP allows this site and the gateway only', () => {
  const file = headersFile('https://api.khazana.example/');
  const csp = /Content-Security-Policy: (.+)/.exec(file)![1];
  expect(csp.split('; ').find((d) => d.startsWith('connect-src'))).toBe("connect-src 'self' https://api.khazana.example");
  expect(csp).toContain("frame-ancestors 'none'");
  // WebAssembly for libsodium, but never JavaScript eval.
  expect(csp).toContain("'wasm-unsafe-eval'");
  expect(csp).not.toMatch(/'unsafe-eval'/);
});

test('Google sign-in adds only Google\'s GIS origins, and only when configured', () => {
  const csp = (google: boolean) => /Content-Security-Policy: (.+)/.exec(headersFile('https://api.khazana.example', { google }))![1];
  expect(csp(false)).not.toContain('accounts.google.com');
  const on = csp(true);
  expect(on).toContain("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://accounts.google.com/gsi/client");
  expect(on).toContain('frame-src https://accounts.google.com/gsi/');
  expect(on.split('; ').find((d) => d.startsWith('connect-src'))).toBe("connect-src 'self' https://api.khazana.example https://accounts.google.com/gsi/");
  expect(on).not.toMatch(/'unsafe-eval'/);
});

test('a plain-http gateway is refused unless it is localhost', () => {
  expect(gatewayOrigin('http://localhost:5196')).toBe('http://localhost:5196');
  expect(() => gatewayOrigin('http://api.khazana.example')).toThrow(/https/);
});

// The CSP's connect-src is this site plus the gateway, img-src is self/data/blob, and fonts are
// self-hosted. The shared screens show demo market and news data that is generated on the device,
// so nothing in the shared code may reach for another origin: no fetch to one, no remote image,
// stylesheet, font or script. (Plain `<a href>` links out, e.g. to a broker's site, are navigation,
// not a request, and are listed so a new one is a conscious decision.)
test('shared code makes no request to any other origin', () => {
  const roots = ['packages/screens-ts/src', 'packages/ui-ts/src', 'packages/domain-ts/src', 'webapp-online/src'];
  const remote = [
    /fetch\s*\(\s*[`'"]https?:/, /fetch\s*\(\s*new URL/, /\b(src|srcSet)\s*=\s*\{?\s*[`'"]https?:/, /url\(\s*[`'"]?https?:/,
    /@import\s+(url\()?\s*['"]https?:/, /new Image\(\)[^;]*https?:/, /import\(\s*['"]https?:/, /new Worker\(\s*['"]https?:/,
  ];
  // google.ts loads Google's sign-in script, and only when Google sign-in is configured, which is the
  // one case headers.mjs adds to the CSP.
  const files = roots.flatMap((r) => sourceFiles(join(repo, r))).filter((f) => !f.endsWith('webapp-online/src/lib/google.ts'));
  const hits = files.flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    return remote.filter((re) => re.test(text)).map((re) => `${file.slice(repo.length + 1)}: ${re}`);
  });
  expect(hits).toEqual([]);

  // Every absolute URL in the shared screens is a link the user follows (institutions' sites).
  const urlFiles = sourceFiles(join(repo, 'packages/screens-ts/src')).filter((f) => /https?:\/\/(?!www\.w3\.org)/.test(readFileSync(f, 'utf8')));
  expect(urlFiles.map((f) => f.slice(repo.length + 1)).sort()).toEqual(['packages/screens-ts/src/lib/institutions.ts']);
});
