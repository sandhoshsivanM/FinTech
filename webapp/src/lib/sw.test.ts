// The service worker is plain JS loaded into a fake global scope. These tests
// exist because a defect here does not throw — it silently hands respondWith()
// an undefined, and the browser turns that into "This page couldn't load".
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');

interface FakeScope {
  addEventListener: (t: string, fn: (e: unknown) => void) => void;
  location: { origin: string };
  skipWaiting: () => void;
  clients: { claim: () => void };
  handlers: Record<string, (e: unknown) => void>;
}

function loadWorker(origin: string): FakeScope {
  const handlers: Record<string, (e: unknown) => void> = {};
  const scope = {
    addEventListener: (t: string, fn: (e: unknown) => void) => { handlers[t] = fn; },
    location: { origin },
    skipWaiting: () => {},
    clients: { claim: () => {} },
    handlers,
  } as FakeScope;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('self', 'caches', 'fetch', 'Response', 'URL', SRC)(
    scope, globalThis.caches, globalThis.fetch, Response, URL,
  );
  return scope;
}

/** Runs the fetch handler and returns whatever it passed to respondWith. */
async function runFetch(scope: FakeScope, req: Partial<Request> & { url: string }) {
  let responded: unknown;
  let intercepted = false;
  scope.handlers.fetch({
    request: { method: 'GET', mode: 'navigate', ...req },
    respondWith: (v: unknown) => { intercepted = true; responded = v; },
  });
  return { intercepted, value: intercepted ? await responded : undefined };
}

beforeEach(() => {
  vi.stubGlobal('caches', {
    open: async () => ({ put: async () => {}, addAll: async () => {} }),
    match: async () => undefined, // every cache lookup misses
    keys: async () => [],
    delete: async () => true,
  });
});

describe('service worker fetch handler', () => {
  test('a failed fetch with an empty cache still yields a Response', async () => {
    // The exact bug: this used to resolve to undefined, and respondWith(undefined)
    // becomes a network error — the dead "This page couldn't load" screen.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const scope = loadWorker('https://khazana-app.netlify.app');
    const { intercepted, value } = await runFetch(scope, { url: 'https://khazana-app.netlify.app/dividends/' });

    expect(intercepted).toBe(true);
    expect(value).toBeInstanceOf(Response);
    expect(value).not.toBeUndefined();
  });

  test('the offline fallback page explains itself and is readable HTML', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const scope = loadWorker('https://khazana-app.netlify.app');
    const { value } = await runFetch(scope, { url: 'https://khazana-app.netlify.app/import/' });
    const res = value as Response;
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('offline');
  });

  test('a failed sub-resource returns an error Response, not undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const scope = loadWorker('https://khazana-app.netlify.app');
    const { value } = await runFetch(scope, {
      url: 'https://khazana-app.netlify.app/_next/static/chunks/x.js', mode: 'no-cors',
    });
    expect(value).toBeInstanceOf(Response);
  });

  test('custom schemes are not intercepted at all', async () => {
    // The desktop wrapper serves tauri://localhost and owns its own assets.
    vi.stubGlobal('fetch', vi.fn());
    const scope = loadWorker('tauri://localhost');
    const { intercepted } = await runFetch(scope, { url: 'tauri://localhost/dividends/' });
    expect(intercepted).toBe(false);
  });

  test('cross-origin requests are not intercepted', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const scope = loadWorker('https://khazana-app.netlify.app');
    const { intercepted } = await runFetch(scope, { url: 'https://example.com/x.png' });
    expect(intercepted).toBe(false);
  });

  test('a successful fetch is passed straight through', async () => {
    const ok = new Response('hi', { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok));
    const scope = loadWorker('https://khazana-app.netlify.app');
    const { value } = await runFetch(scope, { url: 'https://khazana-app.netlify.app/dividends/' });
    expect(value).toBe(ok);
  });
});
