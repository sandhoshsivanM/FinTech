// @vitest-environment jsdom
// Every online page, in its main states, checked with axe-core, plus the focus
// and status behaviour that axe cannot see: focus after a change of view, and
// announcements of async progress. Colour contrast is in tokens.test.ts.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act } from 'react';
import { click, byText, flush, render, type, violations, type Rendered } from './harness';
import { KhazanaStoreProvider } from '@khazana/screens/store';
import { ConfirmProvider } from '@khazana/screens/components/Confirm';
import { createMockStore } from './mockStore';

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  redirect: vi.fn(),
  path: '/dashboard',
  ready: { ready: false, error: undefined as string | undefined },
  online: {
    ledger: { accounts: [] as unknown[], transactions: [] as unknown[] },
    loaded: true,
    status: { kind: 'idle' } as Record<string, unknown>,
  },
  gateway: {} as Record<string, unknown>,
  keys: {} as Record<string, unknown>,
  ensureReady: vi.fn(),
  records: { all: vi.fn(async () => []) },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: h.replace, push: h.push, prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => h.path,
  useSearchParams: () => new URLSearchParams(),
  redirect: (to: string) => h.redirect(to),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={typeof href === 'string' ? href : '#'} {...rest}>{children}</a>,
}));
vi.mock('@/lib/useReady', () => ({ useReady: () => h.ready }));
vi.mock('@/lib/store', async () => ({
  useAppStore: (await import('./mockStore')).createMockStore(),
  useOnline: () => h.online,
  writer: { addAccount: vi.fn(), addTxn: vi.fn(), updateTxn: vi.fn(), deleteTxn: vi.fn(), deleteAccount: vi.fn() },
  syncNow: vi.fn(async () => undefined),
  startSync: vi.fn(async () => undefined),
}));
vi.mock('@/lib/account', () => ({
  keys: () => h.keys,
  ensureReady: () => h.ensureReady(),
  signOutEverywhereLocal: vi.fn(async () => undefined),
}));
vi.mock('@/lib/api', () => ({ gateway: () => h.gateway }));
vi.mock('@/lib/google', () => ({ googleClientId: '', renderGoogleButton: vi.fn() }));
vi.mock('@/lib/passkey', () => ({ passkeysSupported: () => true }));
vi.mock('@/lib/vault', () => ({ records: h.records }));
vi.mock('@/lib/crypto/e2e', () => ({ decryptRecord: vi.fn(async () => undefined) }));

const WORDS = Array.from({ length: 24 }, (_, i) => `word${i + 1}`);

let rendered: Rendered[] = [];
async function open(ui: Parameters<typeof render>[0], opts?: Parameters<typeof render>[1]) {
  const r = await render(ui, opts);
  rendered.push(r);
  return r;
}

beforeEach(() => {
  h.replace.mockClear();
  h.ready = { ready: false, error: undefined };
  h.online.loaded = true;
  h.online.status = { kind: 'idle' };
  h.online.ledger = { accounts: [], transactions: [] };
});

afterEach(async () => {
  for (const r of rendered) await r.unmount();
  rendered = [];
  document.title = '';
  window.history.replaceState({}, '', '/');
});

describe('sign-in', () => {
  test('is accessible, with a page title that names the page', async () => {
    const SignIn = (await import('@/app/sign-in/page')).default;
    const r = await open(<SignIn />);
    expect(await violations(r.container)).toEqual([]);
    expect(document.title).toBe('Sign in · Khazana Online');
  });

  test('a passkey wait is announced in the live status, and the button label does not change', async () => {
    let finish!: () => void;
    h.gateway.signUpWithPasskey = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const SignIn = (await import('@/app/sign-in/page')).default;
    const r = await open(<SignIn />);
    await click(byText(r.container, 'Create account with a passkey'));
    const status = r.container.querySelector('[role="status"]')!;
    expect(status.textContent).toBe('Waiting for your passkey…');
    expect(byText(r.container, 'Create account with a passkey').textContent).toBe('Create account with a passkey');
    await act(async () => finish());
    expect(h.replace).toHaveBeenCalledWith('/setup/');
  });

  test('a failure is announced as an alert in plain words', async () => {
    h.gateway.signInWithPasskey = vi.fn(async () => {
      throw new TypeError('network');
    });
    const SignIn = (await import('@/app/sign-in/page')).default;
    const r = await open(<SignIn />);
    await click(byText(r.container, 'Sign in with a passkey'));
    const alert = r.container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('The server could not be reached');
    expect(await violations(r.container)).toEqual([]);
  });
});

describe('sign-in with a mobile number', () => {
  const digits = (r: Rendered) => r.container.querySelector<HTMLInputElement>('#phone')!;
  const codeField = (r: Rendered) => r.container.querySelector<HTMLInputElement>('#otp')!;

  async function asked(challenge: Record<string, unknown> = { challenge_id: 'c1', expires_in: 300, resend_after: 30 }) {
    h.gateway.startPhoneSignIn = vi.fn(async () => challenge);
    const SignIn = (await import('@/app/sign-in/page')).default;
    const r = await open(<SignIn />);
    await type(digits(r), '98765 43210');
    await click(byText(r.container, 'Send code'));
    return r;
  }

  test('leads with the mobile number, passkey and Google sit under other ways, and it is accessible', async () => {
    const SignIn = (await import('@/app/sign-in/page')).default;
    const r = await open(<SignIn />);
    const headings = [...r.container.querySelectorAll('h2')].map((x) => x.textContent);
    expect(headings).toEqual(['Continue with mobile number', 'Other ways to sign in']);
    expect(digits(r).labels![0].textContent).toBe('Mobile number');
    expect(await violations(r.container)).toEqual([]);
  });

  test('a bad number is refused in words before any request', async () => {
    h.gateway.startPhoneSignIn = vi.fn();
    const SignIn = (await import('@/app/sign-in/page')).default;
    const r = await open(<SignIn />);
    await type(digits(r), '12345');
    await click(byText(r.container, 'Send code'));
    expect(h.gateway.startPhoneSignIn).not.toHaveBeenCalled();
    expect(r.container.querySelector('[role="alert"]')!.textContent).toContain('valid 10-digit');
    expect(await violations(r.container)).toEqual([]);
  });

  test('asking sends +91 and the 10 digits, then the code field takes focus', async () => {
    const r = await asked();
    expect(h.gateway.startPhoneSignIn).toHaveBeenCalledWith('+919876543210');
    expect(document.activeElement).toBe(codeField(r));
    expect(codeField(r).autocomplete).toBe('one-time-code');
    expect(r.container.textContent).toContain('+91 9876543210');
    expect(r.container.querySelector('[data-testid="demo-code"]')).toBeNull();
    expect(await violations(r.container)).toEqual([]);
  });

  test('a demo server code is shown, labelled Demo code, and the state is accessible', async () => {
    const r = await asked({ challenge_id: 'c1', expires_in: 300, resend_after: 30, demo_code: '482913' });
    expect(r.container.querySelector('[data-testid="demo-code"]')!.textContent).toBe('482913');
    expect(r.container.textContent).toContain('Demo code:');
    expect(await violations(r.container)).toEqual([]);
  });

  test('resend is off during the countdown, which is plain text, not a live region', async () => {
    const r = await asked();
    expect(byText(r.container, 'Resend code').hasAttribute('disabled')).toBe(true);
    expect(r.container.textContent).toMatch(/new code in \d+ s/);
    expect(r.container.querySelector('[role="status"]')!.textContent).toBe('');
  });

  test('the right code signs in and goes on to setup; a wrong one is explained and can retry', async () => {
    const r = await asked();
    h.gateway.signInWithPhone = vi.fn().mockRejectedValueOnce(Object.assign(new Error('400'), { status: 400, code: 'invalid_grant' }))
      .mockResolvedValueOnce(undefined);
    await type(codeField(r), '12 34x56');
    expect(codeField(r).value).toBe('123456');
    await click(byText(r.container, 'Sign in'));
    expect(r.container.querySelector('[role="alert"]')!.textContent).toContain('isn’t right, or it has expired');
    expect(h.replace).not.toHaveBeenCalled();
    expect(await violations(r.container)).toEqual([]);
    await click(byText(r.container, 'Sign in'));
    expect(h.gateway.signInWithPhone).toHaveBeenLastCalledWith('c1', '123456');
    expect(h.replace).toHaveBeenCalledWith('/setup/');
  });

  test('an incomplete code is not sent', async () => {
    const r = await asked();
    h.gateway.signInWithPhone = vi.fn();
    await type(codeField(r), '123');
    await click(byText(r.container, 'Sign in'));
    expect(h.gateway.signInWithPhone).not.toHaveBeenCalled();
    expect(r.container.querySelector('[role="alert"]')!.textContent).toContain('6-digit');
  });

  test('a rate limit says how long to wait, and Change number goes back', async () => {
    h.gateway.startPhoneSignIn = vi.fn(async () => {
      throw Object.assign(new Error('429'), { status: 429, code: 'too_many_requests', retryAfter: 600 });
    });
    const SignIn = (await import('@/app/sign-in/page')).default;
    const r = await open(<SignIn />);
    await type(digits(r), '9876543210');
    await click(byText(r.container, 'Send code'));
    expect(r.container.querySelector('[role="alert"]')!.textContent).toContain('10 minutes');
    expect(await violations(r.container)).toEqual([]);

    const ok = await asked();
    await click(byText(ok.container, 'Change number'));
    expect(digits(ok)).not.toBeNull();
  });

  test('the wait for the code is announced in the live status', async () => {
    let finish!: (c: unknown) => void;
    h.gateway.startPhoneSignIn = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    const SignIn = (await import('@/app/sign-in/page')).default;
    const r = await open(<SignIn />);
    await type(digits(r), '9876543210');
    await click(byText(r.container, 'Send code'));
    expect(r.container.querySelector('[role="status"]')!.textContent).toBe('Sending the code…');
    await act(async () => finish({ challenge_id: 'c1', expires_in: 300, resend_after: 30 }));
  });
});

describe('the passkey offer after a mobile-number sign-in', () => {
  afterEach(() => localStorage.clear());

  test('is accessible, adds the passkey and then says so', async () => {
    const { rememberSignIn } = await import('@/lib/signInMethod');
    rememberSignIn('phone');
    h.gateway.addPasskey = vi.fn(async () => undefined);
    const { PasskeyOffer } = await import('@/components/PasskeyOffer');
    const r = await open(<PasskeyOffer />);
    expect(r.container.querySelector('h2')!.textContent).toBe('Add a passkey for faster sign-in');
    expect(await violations(r.container)).toEqual([]);
    await click(byText(r.container, 'Add a passkey'));
    expect(h.gateway.addPasskey).toHaveBeenCalled();
    expect(r.container.querySelector('h2')!.textContent).toBe('Passkey added');
    expect(await violations(r.container)).toEqual([]);
  });

  test('a late attempt says to sign in again, and Not now closes the offer', async () => {
    const { rememberSignIn, passkeyOfferOpen } = await import('@/lib/signInMethod');
    rememberSignIn('phone');
    h.gateway.addPasskey = vi.fn(async () => {
      throw Object.assign(new Error('403'), { status: 403, code: 'reauthentication_required' });
    });
    const { PasskeyOffer } = await import('@/components/PasskeyOffer');
    const r = await open(<PasskeyOffer />);
    await click(byText(r.container, 'Add a passkey'));
    expect(r.container.querySelector('[role="alert"]')!.textContent).toContain('sign in again');
    await click(byText(r.container, 'Not now'));
    expect(r.container.textContent).toBe('');
    expect(passkeyOfferOpen()).toBe(false);
  });

  test('shows nothing for any other sign-in', async () => {
    const { rememberSignIn } = await import('@/lib/signInMethod');
    rememberSignIn('other');
    const { PasskeyOffer } = await import('@/components/PasskeyOffer');
    const r = await open(<PasskeyOffer />);
    expect(r.container.textContent).toBe('');
  });
});

describe('devices for a mobile-number sign-in', () => {
  afterEach(() => localStorage.clear());

  test('explains up front, and a failed passkey check becomes that explanation, not a passkey error', async () => {
    const { rememberSignIn } = await import('@/lib/signInMethod');
    rememberSignIn('phone');
    h.ready = { ready: true, error: undefined };
    const device = { id: 'd2', name: 'Old laptop', platform: 'web', app_version: null, created_at: '2026-10-01T00:00:00Z', last_seen_at: '2026-10-02T00:00:00Z', current: false };
    h.gateway.call = vi.fn(async () => [device]);
    h.gateway.callWithStepUp = vi.fn(async () => {
      throw Object.assign(new Error('x'), { name: 'NotAllowedError' });
    });
    const Devices = (await import('@/app/settings/devices/page')).default;
    const r = await open(<Devices />);
    await click(byText(r.container, 'Remove'));
    expect(r.container.textContent).toContain('you signed in with a mobile number');
    await click(byText(r.container, 'Confirm with passkey and remove'));
    const alert = r.container.querySelector('[role="alert"]')!.textContent!;
    expect(alert).toContain('Add a passkey first');
    expect(alert).not.toContain('prompt');
    expect(await violations(r.container)).toEqual([]);
  });
});

describe('setup', () => {
  test('the waiting state is accessible and announced', async () => {
    h.ensureReady.mockResolvedValue('needs-setup');
    h.keys = { status: vi.fn(async () => ({ account_has_keys: false })) };
    const Setup = (await import('@/app/setup/page')).default;
    const r = await open(<Setup />);
    expect(await violations(r.container)).toEqual([]);
    expect(r.container.querySelector('[role="status"]')!.textContent).toContain('Registering this device');
  });
});

describe('recovery phrase on a new account', () => {
  beforeEach(() => {
    h.keys = {
      createAccountKey: vi.fn(async () => ({ words: WORDS, save: vi.fn(async () => undefined) })),
    };
  });

  test('shows the words, and is accessible', async () => {
    const New = (await import('@/app/setup/new/page')).default;
    const r = await open(<New />);
    expect(r.container.querySelectorAll('[data-testid="recovery-words"] li')).toHaveLength(24);
    expect(await violations(r.container)).toEqual([]);
  });

  test('moving to the check moves focus into the first word field', async () => {
    const New = (await import('@/app/setup/new/page')).default;
    const r = await open(<New />);
    await click(byText(r.container, 'I’ve written them down'));
    const first = document.activeElement as HTMLInputElement;
    expect(first.tagName).toBe('INPUT');
    expect(first.closest('label')?.textContent).toMatch(/^Word \d+/);
    expect(await violations(r.container)).toEqual([]);
  });
});

describe('link this device', () => {
  test('the empty state is accessible', async () => {
    const Link = (await import('@/app/setup/link/page')).default;
    const r = await open(<Link />);
    expect(await violations(r.container)).toEqual([]);
  });

  test('a pairing QR code has a text alternative, and the link box is labelled', async () => {
    h.keys = {
      startPairing: vi.fn(async () => ({ link: 'https://online.example/pair#id=1&code=2&h=3', expiresAt: new Date(Date.now() + 60_000) })),
      waitForApproval: vi.fn(() => new Promise<boolean>(() => undefined)),
    };
    const Link = (await import('@/app/setup/link/page')).default;
    const r = await open(<Link />);
    await click(byText(r.container, 'Pair with another device'));
    expect(r.container.querySelector('[role="img"]')?.getAttribute('aria-label')).toMatch(/QR code/);
    expect(r.container.querySelector('input[readonly]')?.getAttribute('aria-label')).toBe('Pairing link');
    expect(await violations(r.container)).toEqual([]);
  });

  test('an expired pairing link lets the user start again without a reload', async () => {
    h.keys = {
      startPairing: vi.fn(async () => ({ link: 'https://online.example/pair#id=1&code=2&h=3', expiresAt: new Date(Date.now() + 60_000) })),
      waitForApproval: vi.fn(async () => false),
    };
    const Link = (await import('@/app/setup/link/page')).default;
    const r = await open(<Link />);
    await click(byText(r.container, 'Pair with another device'));
    expect(r.container.querySelector('[role="alert"]')?.textContent).toContain('expired');
    expect(byText(r.container, 'Pair with another device')).toBeTruthy();
    expect(await violations(r.container)).toEqual([]);
  });

  test('the recovery phrase says how many words are in, and only enables at 24', async () => {
    const Link = (await import('@/app/setup/link/page')).default;
    const r = await open(<Link />);
    const box = r.container.querySelector('textarea') as HTMLTextAreaElement;
    expect(box.getAttribute('aria-describedby')).toBe('phrase-hint');
    await type(box, WORDS.slice(0, 5).join(' '));
    expect(r.container.querySelector('#phrase-hint')!.textContent).toContain('5 of 24 words entered');
    expect(byText(r.container, 'Use recovery phrase').hasAttribute('disabled')).toBe(true);
    await type(box, WORDS.join(' '));
    expect(byText(r.container, 'Use recovery phrase').hasAttribute('disabled')).toBe(false);
    expect(await violations(r.container)).toEqual([]);
  });
});

describe('approve a new device', () => {
  test('the approval screen is accessible and the result is announced', async () => {
    window.history.replaceState({}, '', '/pair/#id=abc&code=123&h=xyz');
    h.ensureReady.mockResolvedValue('ready');
    h.keys = {
      inspectPairing: vi.fn(async () => ({ name: 'Pixel 8', platform: 'android' })),
      approvePairing: vi.fn(async () => undefined),
    };
    const Pair = (await import('@/app/pair/page')).default;
    const r = await open(<Pair />);
    expect(r.container.textContent).toContain('Pixel 8');
    expect(await violations(r.container)).toEqual([]);
    await click(byText(r.container, 'Approve'));
    expect(r.container.querySelector('[role="status"]')!.textContent).toContain('Done.');
    expect(await violations(r.container)).toEqual([]);
  });
});

describe('how it works', () => {
  test('the empty state is accessible', async () => {
    h.ready = { ready: true, error: undefined };
    const How = (await import('@/app/how/page')).default;
    const r = await open(<How />);
    await flush();
    expect(r.container.querySelector('[role="status"]')!.textContent).toBe('Add an account first.');
    expect(await violations(r.container)).toEqual([]);
  });
});

describe('sync status', () => {
  test('an error is shown in words, and its outcome is announced once', async () => {
    h.ready = { ready: true, error: undefined };
    h.online.status = { kind: 'error', message: 'The server refused that (503).' };
    const { SyncChip } = await import('@/components/SyncChip');
    const r = await open(<SyncChip />);
    expect(r.container.textContent).toContain('Sync problem · tap to retry');
    expect(r.container.textContent).toContain('The server refused that (503).');
    expect(r.container.querySelector('[role="status"]')!.textContent).toBe('Sync problem: The server refused that (503). Tap to retry.');
    expect(r.container.querySelector('button')!.hasAttribute('title')).toBe(false);
    expect(await violations(r.container)).toEqual([]);
  });
});

// --- the shared screens, mounted on Online's store contract -----------------------------------
//
// Every route that re-exports a screen from @khazana/screens, rendered on an empty KhazanaStore
// (the first-run state) and on one with data, and checked with axe. A route added without a test
// here fails `routes.test.ts`, which keeps this list and the app/ folder in step.

import { SHARED_ROUTES } from './routes';

function Wrapped({ store, children }: { store: ReturnType<typeof createMockStore>; children: React.ReactNode }) {
  return (
    <KhazanaStoreProvider store={store}>
      <ConfirmProvider>{children}</ConfirmProvider>
    </KhazanaStoreProvider>
  );
}

const seeded = () => createMockStore({
  categories: [{ id: 'cat-food', vaultId: 'default', name: 'Food', icon: 'Utensils' }],
  accounts: [{ id: 'acct-1', vaultId: 'default', profileId: 'default', name: 'HDFC Savings', type: 'asset', subtype: 'bank', openingBalance: '10000' }],
  txns: [{
    id: 't1', vaultId: 'default', profileId: 'default', amount: '450', type: 'expense', categoryId: 'cat-food',
    merchant: 'Swiggy', date: Date.UTC(2026, 9, 3), createdAt: 0, accountId: 'acct-1',
  }],
});

describe.each(SHARED_ROUTES)('shared screen %s', (route) => {
  for (const [label, make] of [['empty', () => createMockStore()], ['with data', seeded]] as const) {
    test(`is accessible (${label})`, async () => {
      h.path = `/${route}`;
      const Page = (await import(`../../../packages/screens-ts/src/pages/${route}.tsx`)).default;
      const r = await open(<Wrapped store={make()}><Page /></Wrapped>);
      expect(r.container.textContent?.length ?? 0).toBeGreaterThan(0);
      expect(await violations(r.container)).toEqual([]);
    });
  }
});

describe('the shell', () => {
  test('is accessible, lists Cards, and has no lock, backup or diagnostics', async () => {
    h.path = '/dashboard';
    const { OnlineShell } = await import('@/components/OnlineShell');
    const r = await open(<Wrapped store={createMockStore()}><OnlineShell><p>content</p></OnlineShell></Wrapped>, { bare: true });
    const links = [...r.container.querySelectorAll('nav a')].map((a) => a.getAttribute('href'));
    expect(links).toContain('/cards');
    expect(links).not.toContain('/diagnostics');
    expect(r.container.querySelector('[aria-label="Lock vault"]')).toBeNull();
    expect(r.container.querySelector('[aria-label="Sign out"]')).not.toBeNull();
    expect(r.container.querySelector('[data-testid="sync-status"]')).not.toBeNull();
    expect(await violations(r.container)).toEqual([]);
  });
});

describe('settings', () => {
  test('is accessible and offers devices, export and sign out', async () => {
    h.path = '/settings';
    const Settings = (await import('@/app/settings/page')).default;
    const r = await open(<Wrapped store={createMockStore()}><Settings /></Wrapped>);
    expect(byText(r.container, 'Sign out')).toBeTruthy();
    expect(byText(r.container, 'Export')).toBeTruthy();
    expect(r.container.querySelector('a[href="/settings/devices"]')).not.toBeNull();
    expect(r.container.querySelector('a[href="/link"]')?.textContent).toContain('Link bank & investments');
    expect(await violations(r.container)).toEqual([]);
  });
});

describe('home', () => {
  test('redirects to the dashboard', async () => {
    const Home = (await import('@/app/home/page')).default;
    Home();
    expect(h.redirect).toHaveBeenCalledWith('/dashboard');
  });
});

describe('help, privacy and terms', () => {
  test('say what is true of Online, not of the offline vault', async () => {
    const { configurePlatform } = await import('@khazana/screens/platform');
    const { onlineCopy } = await import('@/lib/onlineCopy');
    configurePlatform({ copy: onlineCopy });
    for (const route of ['help', 'privacy', 'terms']) {
      const Page = (await import(`../../../packages/screens-ts/src/pages/${route}.tsx`)).default;
      const r = await open(<Wrapped store={createMockStore()}><Page /></Wrapped>);
      const text = r.container.textContent ?? '';
      expect(text.match(/in this browser only|no server|Dexie|forget your PIN|PIN itself|never uploaded/i)).toBeNull();
      if (route === 'privacy') expect(text).toMatch(/ciphertext/i);
    }
  });
});
