// The "Try demo" vault: a separate database, opened through the real setup and
// unlock with a random per-tab PIN. These tests pin down the three ways a demo
// tab can start (fresh, reload, stale) and that the demo can never touch the
// real vault's database or its unlock throttle.
import { describe, test, expect, beforeEach, vi } from 'vitest';

// jsdom has no IndexedDB. A stand-in demo database: one optional vault row,
// a record count, and delete/open that record what happened.
const fake = vi.hoisted(() => ({
  name: 'fintech_os_demo',
  meta: undefined as undefined | Record<string, unknown>,
  records: 0,
  deleted: 0,
}));

vi.mock('@/lib/db', () => ({
  DEMO_DB_NAME: 'fintech_os_demo',
  db: {
    get name() { return fake.name; },
    vaults: {
      get: vi.fn(async () => fake.meta),
      put: vi.fn(async () => 'default'),
      update: vi.fn(async () => 1),
    },
    records: { count: vi.fn(async () => fake.records) },
    delete: vi.fn(async () => { fake.deleted++; fake.meta = undefined; fake.records = 0; }),
    open: vi.fn(async () => undefined),
  },
  requestPersistence: vi.fn(async () => 'denied'),
  persistenceState: vi.fn(async () => 'denied'),
}));

vi.mock('@/lib/sampleData', () => ({ loadSampleData: vi.fn(async () => undefined) }));

const { useApp, lsGet, lsSet } = await import('@/lib/store');
const { openDemoVault } = await import('@/lib/demoVault');
const { loadSampleData } = await import('@/lib/sampleData');
const { DEMO_PIN_KEY, DEMO_SESSION_KEY } = await import('@khazana/screens/lib/demoSession');

const setup = vi.fn(async () => { useApp.setState({ status: 'unlocked' }); });
const unlock = vi.fn(async () => { useApp.setState({ status: 'unlocked' }); });

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  sessionStorage.setItem(DEMO_SESSION_KEY, '1');
  Object.assign(fake, { name: 'fintech_os_demo', meta: undefined, records: 0, deleted: 0 });
  setup.mockClear();
  unlock.mockClear();
  vi.mocked(loadSampleData).mockClear();
  useApp.setState({ status: 'loading', error: null, setup, unlock });
});

describe('opening the demo vault', () => {
  test('fresh: a random PIN is made, kept in this tab only, and the vault filled with samples', async () => {
    await openDemoVault();

    const pin = sessionStorage.getItem(DEMO_PIN_KEY);
    // 32 random bytes, base64: far beyond any guessable PIN.
    expect(pin).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(setup).toHaveBeenCalledWith(pin);
    expect(unlock).not.toHaveBeenCalled();
    expect(loadSampleData).toHaveBeenCalledOnce();
    expect(fake.deleted).toBe(0);
    // Never in localStorage, where it would outlive the tab.
    expect(Object.values({ ...localStorage })).not.toContain(pin);
    // Demo market data is on for this tab, and only this tab.
    expect(sessionStorage.getItem('khazana-demo-market')).toBe('1');
    expect(localStorage.getItem('khazana-demo-market')).toBeNull();
  });

  test('two fresh demos never share a PIN', async () => {
    await openDemoVault();
    const first = sessionStorage.getItem(DEMO_PIN_KEY);
    sessionStorage.removeItem(DEMO_PIN_KEY);
    fake.meta = undefined;
    await openDemoVault();
    expect(sessionStorage.getItem(DEMO_PIN_KEY)).not.toBe(first);
  });

  test('reload: an existing demo vault is unlocked with the session PIN, not rebuilt', async () => {
    fake.meta = { vaultId: 'default' };
    fake.records = 40;
    sessionStorage.setItem(DEMO_PIN_KEY, 'the-session-pin');

    await openDemoVault();

    expect(unlock).toHaveBeenCalledWith('the-session-pin');
    expect(setup).not.toHaveBeenCalled();
    expect(loadSampleData).not.toHaveBeenCalled();
    expect(fake.deleted).toBe(0);
  });

  test('stale: a demo vault this tab has no PIN for is deleted and built again', async () => {
    fake.meta = { vaultId: 'default' };
    fake.records = 40;

    await openDemoVault();

    expect(fake.deleted).toBe(1);
    expect(unlock).not.toHaveBeenCalled();
    expect(setup).toHaveBeenCalledOnce();
    expect(loadSampleData).toHaveBeenCalledOnce();
  });

  test('a session PIN that no longer opens the vault also starts again', async () => {
    fake.meta = { vaultId: 'default' };
    sessionStorage.setItem(DEMO_PIN_KEY, 'wrong');
    unlock.mockImplementationOnce(async () => { useApp.setState({ status: 'locked', error: 'Incorrect PIN.' }); });

    await openDemoVault();

    expect(fake.deleted).toBe(1);
    expect(setup).toHaveBeenCalledOnce();
    expect(useApp.getState().status).toBe('unlocked');
  });

  test('does nothing at all when the open database is the real one', async () => {
    fake.name = 'fintech_os';
    fake.meta = { vaultId: 'default' };
    fake.records = 40;

    await openDemoVault();

    expect(fake.deleted).toBe(0);
    expect(setup).not.toHaveBeenCalled();
    expect(unlock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(DEMO_PIN_KEY)).toBeNull();
  });
});

describe('the unlock throttle', () => {
  // The real unlock, against a vault row whose verifier never decrypts.
  const realUnlock = useApp.getState().unlock;
  const badVault = {
    vaultId: 'default',
    saltB64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    verifier: { iv: 'AAAAAAAAAAAAAAAA', ct: 'AAAAAAAAAAAAAAAAAAAAAAAA' },
  };

  test('a demo tab counts its failures on its own keys, never the real vault\'s', async () => {
    useApp.setState({ unlock: realUnlock, pinFailures: 0, lockedOutUntil: 0 });
    lsSet('khazana-pin-failures', '4');
    fake.meta = badVault;

    await useApp.getState().unlock('000000');

    expect(lsGet('khazana-demo-pin-failures')).toBe('1');
    // The real vault's count is exactly as it was.
    expect(lsGet('khazana-pin-failures')).toBe('4');
  });

  test('outside a demo, the real keys are used as before', async () => {
    fake.name = 'fintech_os';
    useApp.setState({ unlock: realUnlock, pinFailures: 0, lockedOutUntil: 0 });
    fake.meta = badVault;

    await useApp.getState().unlock('000000');

    expect(lsGet('khazana-pin-failures')).toBe('1');
    expect(lsGet('khazana-demo-pin-failures')).toBeNull();
  });
});
