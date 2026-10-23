// Khazana (offline) never talks to our backend, never signs in and never syncs
// through a server: that is Khazana Online, a separate app (ADR 0007). These
// checks fail the build if online code finds its way in here.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const webapp = join(__dirname, '..');
const repo = join(webapp, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|mjs)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

// The gateway's own route prefixes (/v1/auth, /v1/sync, …), read from its
// config so a new backend route is banned here the day it is added.
function gatewayPrefixes(): string[] {
  const config = JSON.parse(readFileSync(join(repo, 'backend/Khazana.Gateway/appsettings.json'), 'utf8'));
  const paths = Object.values(config.ReverseProxy.Routes as Record<string, { Match: { Path: string } }>)
    .map((r) => /^(\/v1\/[^/{]+)/.exec(r.Match.Path)?.[1])
    .filter((p): p is string => p !== undefined);
  return [...new Set(paths)];
}

const banned = [
  ...gatewayPrefixes(),
  'DPoP', 'access_token', 'refresh_token', 'passkey', 'navigator.credentials',
  'webapp-online', 'mobile-online', 'khazana_online', '@khazana/online',
];

test('the gateway prefixes were found (the guard is not empty)', () => {
  assert.ok(gatewayPrefixes().includes('/v1/auth'));
  assert.ok(gatewayPrefixes().includes('/v1/sync'));
});

// The shared packages are compiled into this app, so they are held to the
// same rule (Khazana Online keeps its online code in its own app).
test('no backend routes, tokens, sign-in or online-app imports in src/ or the shared packages', () => {
  const roots = [join(webapp, 'src'), join(repo, 'packages/domain-ts/src'), join(repo, 'packages/ui-ts/src')];
  const hits = roots.flatMap(sourceFiles).flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    return banned.filter((word) => text.includes(word)).map((word) => `${file.slice(repo.length + 1)}: ${word}`);
  });
  assert.deepEqual(hits, [], 'Online code belongs in webapp-online/ (ADR 0007)');
});

test('no sign-in or backend client packages', () => {
  const pkg = JSON.parse(readFileSync(join(webapp, 'package.json'), 'utf8'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const auth = deps.filter((d) => /^(next-auth|@auth\/|@simplewebauthn\/|firebase|@firebase\/|oidc-client|@azure\/msal|@supabase\/|@clerk\/)/.test(d));
  assert.deepEqual(auth, []);
});

test("the CSP still allows connections to this site only", () => {
  const toml = readFileSync(join(webapp, 'netlify.toml'), 'utf8');
  const csp = /Content-Security-Policy = "([^"]+)"/.exec(toml)?.[1] ?? '';
  const connect = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src'));
  assert.equal(connect, "connect-src 'self'");
});
