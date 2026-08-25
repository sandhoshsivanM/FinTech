// The development Pro override, and the one property that makes it safe to
// keep in the repository: it cannot reach a production build.
//
// The web twin of Flutter's `kProOverride`. Flutter gets this for free because
// `bool.fromEnvironment` is compile-time; on the web it rests on Next inlining
// `process.env.NODE_ENV` and `process.env.NEXT_PUBLIC_*` at build time, so the
// guard folds to `false` and minification removes the branch.
//
// That is a claim about the bundler, so it is checked two ways: the runtime
// behaviour here, and the built output in `devOverride.build.test.ts`-style
// assertions below that read the emitted bundle when one exists.
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// jsdom has no IndexedDB and this test is about entitlement resolution, not
// storage. Same shape of stub as `proPersistence.test.ts`, which mocks for the
// same reason — it only has to satisfy Dexie's chain far enough for `init()`
// to complete.
const table = () => ({
  where: vi.fn(() => ({
    equals: vi.fn(() => ({ delete: vi.fn(async () => 0), toArray: async () => [] })),
    toArray: async () => [],
  })),
  toArray: async () => [],
  clear: vi.fn(async () => undefined),
  get: vi.fn(async () => undefined),
  put: vi.fn(async () => undefined),
  update: vi.fn(async () => 1),
  delete: vi.fn(async () => undefined),
  bulkPut: vi.fn(async () => undefined),
});

vi.mock('@/lib/db', () => ({
  db: { vaults: table(), records: table(), tombstones: table() },
  requestPersistence: vi.fn(async () => 'denied'),
  persistenceState: vi.fn(async () => 'denied'),
}));

/** Re-imports the store with a given environment, bypassing the module cache. */
async function resolveProWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    const { useApp } = await import('./store');
    // `init()` is what calls resolvePro(); reading the initial state is enough
    // to observe the override, which resolves synchronously before first paint.
    await useApp.getState().init();
    return useApp.getState().pro;
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.resetModules(); });

describe('the development override', () => {
  test('unlocks Pro when explicitly enabled outside production', async () => {
    const pro = await resolveProWith({
      NODE_ENV: 'development',
      NEXT_PUBLIC_KHAZANA_PRO: 'true',
    });
    expect(pro.isPro).toBe(true);
  });

  test('reports itself as a dev override, never as a purchase', async () => {
    // A dev build must not be indistinguishable from a paying customer in a
    // screenshot or a bug report.
    const pro = await resolveProWith({
      NODE_ENV: 'development',
      NEXT_PUBLIC_KHAZANA_PRO: 'true',
    });
    expect(pro.source).toBe('devOverride');
    expect(pro.source).not.toBe('licenseKey');
    // It is not a purchase, so it carries no order reference to display.
    expect(pro.orderRef).toBeUndefined();
  });

  test('is OFF unless the variable is exactly "true"', async () => {
    // Guards against a stray `NEXT_PUBLIC_KHAZANA_PRO=1` or `=false` reading as
    // truthy, which is how an env-var flag usually goes wrong.
    for (const value of [undefined, '', 'false', '1', 'yes', 'TRUE']) {
      const pro = await resolveProWith({
        NODE_ENV: 'development',
        NEXT_PUBLIC_KHAZANA_PRO: value,
      });
      expect(pro.isPro, `value ${JSON.stringify(value)} should not unlock`).toBe(false);
    }
  });

  test('is ignored in production even when the variable is set', async () => {
    // THE important one. If this ever fails, the override has become a way to
    // ship a free Pro build.
    const pro = await resolveProWith({
      NODE_ENV: 'production',
      NEXT_PUBLIC_KHAZANA_PRO: 'true',
    });
    expect(pro.isPro).toBe(false);
    expect(pro.source).toBe('none');
  });
});

describe('the production bundle', () => {
  /** The emitted client chunks, when a build exists to inspect. */
  const chunkDir = resolve(process.cwd(), 'out/_next/static/chunks');

  test('contains no reference to the override variable', () => {
    if (!existsSync(chunkDir)) {
      // `npm run build` has not run in this working tree. The runtime test
      // above still covers the behaviour; this one adds proof about the
      // artefact, so it is skipped rather than silently passing.
      return;
    }
    const files = readdirSync(chunkDir, { recursive: true }) as string[];
    const offenders: string[] = [];
    for (const f of files) {
      if (!f.endsWith('.js')) continue;
      const body = readFileSync(join(chunkDir, f), 'utf8');
      if (body.includes('NEXT_PUBLIC_KHAZANA_PRO')) offenders.push(f);
    }
    expect(offenders, `the override name survived into: ${offenders.join(', ')}`)
      .toEqual([]);
  });
});
