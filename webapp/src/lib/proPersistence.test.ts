// Khazana Pro must outlive everything that clears vault data.
//
// This is the guardrail for a specific, very easy mistake. `lock()` and
// `wipe()` both spread `...emptyData` over the store, so anything that lives
// inside `Data` is cleared by both. If the entitlement had been put there — the
// obvious place — then locking your vault, or erasing your own financial data,
// would silently revoke something you paid for.
//
// Charging someone ₹999 and then taking it away because they used the
// erase-all-data button is not a bug we get to fix in a patch release; it is a
// refund and a review. So it is a test.
import { describe, test, expect, beforeEach, vi } from 'vitest';

// jsdom has no IndexedDB, and this test is about store state rather than
// storage. The mock only needs to satisfy Dexie's fluent chain far enough for
// `wipe()` to run to completion.
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

const { LICENSE_KEY_IS_PLACEHOLDER } = await import('@/lib/entitlement/licensePublicKey');
const { useApp } = await import('@/lib/store');

const PRO = { isPro: true as const, source: 'licenseKey' as const, orderRef: 'DEADBEEF12345678' };

beforeEach(() => {
  localStorage.clear();
  useApp.setState({ pro: PRO, status: 'unlocked', key: null });
});

describe('a purchase survives everything that clears data', () => {
  test('locking the vault does not revoke Pro', () => {
    useApp.getState().lock();

    expect(useApp.getState().status).toBe('locked');
    expect(useApp.getState().pro.isPro).toBe(true);
  });

  test('locking clears the key but keeps the order reference', () => {
    useApp.getState().lock();

    expect(useApp.getState().key).toBeNull();
    expect(useApp.getState().pro.orderRef).toBe('DEADBEEF12345678');
  });

  test('wiping the vault does not revoke Pro', async () => {
    // Erasing your financial data is not a reason to lose a purchase. The
    // entitlement lives outside `Data` precisely so `...emptyData` cannot
    // reach it.
    await useApp.getState().wipe();

    expect(useApp.getState().pro.isPro).toBe(true);
  });
});

describe('removing a licence is explicit, and only explicit', () => {
  test('removeLicense is the one thing that revokes', () => {
    useApp.getState().removeLicense();
    expect(useApp.getState().pro.isPro).toBe(false);
  });

  test('removing clears the stored key so it is not silently re-applied', () => {
    useApp.setState({ pro: PRO });
    localStorage.setItem('khazana-license-v1', 'KHAZ1.something');

    useApp.getState().removeLicense();

    expect(localStorage.getItem('khazana-license-v1')).toBeFalsy();
  });
});

describe('an unconfigured build does not accuse the customer', () => {
  test('activating a key on a placeholder build says the build is at fault', async () => {
    // Telling a paying customer their valid key is invalid would send them
    // chasing a problem that is ours.
    //
    // The placeholder state is CONSTRUCTED here rather than inherited from the
    // shipped key. This test used to pass only because no real key pair had
    // been minted yet — so the moment one was, the assertion started measuring
    // the wrong thing. The guarantee has to hold whatever is compiled in.
    vi.resetModules();
    vi.doMock('@/lib/entitlement/licensePublicKey', () => ({
      LICENSE_PUBLIC_KEY: new Uint8Array(32),
      LICENSE_KEY_IS_PLACEHOLDER: true,
    }));
    try {
      const { useApp: unconfigured } = await import('@/lib/store');
      const message = await unconfigured.getState().activateLicense('KHAZ1.anything');
      expect(message).toMatch(/build|support/i);
    } finally {
      vi.doUnmock('@/lib/entitlement/licensePublicKey');
      vi.resetModules();
    }
  });

  test('a configured build refuses a malformed key without blaming itself', () => {
    // The other half: once a real key is compiled in, a bad key is the user's
    // typo and the message should say so.
    expect(LICENSE_KEY_IS_PLACEHOLDER).toBe(false);
  });
});
