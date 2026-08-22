// Failed-unlock throttling, and why the web client needed it most.
//
// The Flutter client has had a lockout since the beginning
// (`lib/core/security/vault_unlock_notifier.dart`). This client — the one
// anyone can reach on the open web, and the one that actually ships — had none:
// wrong PINs could be tried as fast as PBKDF2 would run, with the derivation
// cost as the only brake. Against a six-digit keyspace that is not enough on
// its own, and it makes our own CPU the rate limit rather than our policy.
//
// The counters live in localStorage rather than in memory on purpose: closing
// the tab must not be the reset button.
import { describe, test, expect, beforeEach, vi } from 'vitest';

// jsdom ships no IndexedDB, and the throttle is not about storage. The vault
// row is real enough to reach the PIN check; its verifier is nonsense, so
// decryption always fails — which is exactly the "wrong PIN" path.
vi.mock('@/lib/db', () => ({
  db: {
    vaults: {
      get: vi.fn(async () => ({
        vaultId: 'default',
        name: 'My Vault',
        saltB64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        verifier: { iv: 'AAAAAAAAAAAAAAAA', ct: 'AAAAAAAAAAAAAAAAAAAAAAAA' },
        schemaVersion: 99,
      })),
      update: vi.fn(async () => 1),
      put: vi.fn(async () => 'default'),
    },
    records: { where: vi.fn(() => ({ toArray: async () => [] })) },
    tombstones: { where: vi.fn(() => ({ toArray: async () => [] })) },
  },
  requestPersistence: vi.fn(async () => 'denied'),
  persistenceState: vi.fn(async () => 'denied'),
}));

const { useApp, lsGet } = await import('@/lib/store');

const FAILURES_KEY = 'khazana-pin-failures';
const LOCKOUT_KEY = 'khazana-lockout-until';

beforeEach(() => {
  localStorage.clear();
  useApp.setState({
    status: 'locked',
    pinFailures: 0,
    lockedOutUntil: 0,
    error: null,
    key: null,
  });
});

describe('failed unlock attempts', () => {
  test('a wrong PIN is counted, and written down', async () => {
    await useApp.getState().unlock('000000');

    expect(useApp.getState().pinFailures).toBe(1);
    expect(lsGet(FAILURES_KEY)).toBe('1');
    expect(useApp.getState().error).toBe('Incorrect PIN.');
    expect(useApp.getState().lockedOutUntil).toBe(0);
  });

  test('the first few attempts are free — typos are normal', async () => {
    for (let i = 0; i < 4; i++) await useApp.getState().unlock('000000');

    expect(useApp.getState().pinFailures).toBe(4);
    expect(useApp.getState().lockedOutUntil).toBe(0);
    expect(useApp.getState().error).toBe('Incorrect PIN.');
  });

  test('the fifth failure starts a lockout', async () => {
    for (let i = 0; i < 5; i++) await useApp.getState().unlock('000000');

    expect(useApp.getState().pinFailures).toBe(5);
    expect(useApp.getState().lockedOutUntil).toBeGreaterThan(Date.now());
    expect(useApp.getState().error).toMatch(/Too many attempts/);
    expect(Number(lsGet(LOCKOUT_KEY))).toBeGreaterThan(Date.now());
  });

  test('a successful unlock is not needed to persist the count — the write is immediate', async () => {
    await useApp.getState().unlock('000000');
    // What a reload sees. If this were in-memory only, reopening the tab would
    // hand an attacker a fresh five attempts, forever.
    expect(lsGet(FAILURES_KEY)).toBe('1');
  });

  test('a lockout refuses the attempt before deriving a key', async () => {
    useApp.setState({ pinFailures: 6, lockedOutUntil: Date.now() + 30_000 });

    const before = performance.now();
    await useApp.getState().unlock('123456');
    const elapsed = performance.now() - before;

    expect(useApp.getState().error).toMatch(/Too many attempts/);
    // The point of checking first is that 600k PBKDF2 iterations never run.
    // If this ever creeps towards a second, the guard has slipped below the
    // derivation and the throttle has become decorative.
    expect(elapsed).toBeLessThan(200);
  });

  test('the wait grows with each failure past the threshold', async () => {
    for (let i = 0; i < 5; i++) await useApp.getState().unlock('000000');
    const first = useApp.getState().lockedOutUntil - Date.now();

    useApp.setState({ lockedOutUntil: 0 }); // serve the wait
    await useApp.getState().unlock('000000');
    const second = useApp.getState().lockedOutUntil - Date.now();

    expect(second).toBeGreaterThan(first);
  });

  test('the wait is capped, so an honest user is never permanently locked out', async () => {
    useApp.setState({ pinFailures: 100, lockedOutUntil: 0 });
    await useApp.getState().unlock('000000');

    const wait = useApp.getState().lockedOutUntil - Date.now();
    expect(wait).toBeLessThanOrEqual(5 * 60_000);
  });

  test('the lockout message counts down in seconds, then minutes', async () => {
    useApp.setState({ pinFailures: 6, lockedOutUntil: Date.now() + 20_000 });
    await useApp.getState().unlock('123456');
    expect(useApp.getState().error).toMatch(/in \d+s\./);

    useApp.setState({ pinFailures: 9, lockedOutUntil: Date.now() + 180_000 });
    await useApp.getState().unlock('123456');
    expect(useApp.getState().error).toMatch(/in \d+ min\./);
  });

  test('an expired lockout lets the next attempt through', async () => {
    useApp.setState({ pinFailures: 6, lockedOutUntil: Date.now() - 1 });

    await useApp.getState().unlock('123456');

    // The attempt was actually processed rather than short-circuited: the
    // counter moved. A lockout that outlives its own deadline is a bricked
    // app, so the deadline has to be the only thing that gates it.
    expect(useApp.getState().pinFailures).toBe(7);
    // And because we are still past the threshold, that failure immediately
    // starts a fresh — longer — wait. Once someone is in lockout territory,
    // every further wrong PIN costs them again.
    expect(useApp.getState().lockedOutUntil).toBeGreaterThan(Date.now());
  });
});

describe('storage durability', () => {
  test('persistence state is carried in the store, not assumed', () => {
    // With no server, IndexedDB is not a cache of the truth — it is the truth.
    // Browsers evict ordinary origin storage, so whether this vault is durable
    // is something the user is entitled to see, and Settings reads it here.
    expect(['persisted', 'denied', 'unsupported']).toContain(
      useApp.getState().persistence,
    );
  });
});
