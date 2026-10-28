// @vitest-environment jsdom
// The Link bank & investments screen in its main states, checked with axe-core,
// plus what axe can't see: the live status during a link, plain-words errors,
// and the revoke choice about imported data.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { byText, click, render, violations, type Rendered } from './harness';
import type { Consent, ProviderInfo } from '@/lib/aa/api';

const h = vi.hoisted(() => ({
  ready: { ready: true, error: undefined as string | undefined },
  linker: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/link',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('@/lib/useReady', () => ({ useReady: () => h.ready }));
vi.mock('@/lib/aa', () => ({ linker: () => h.linker }));

const SAMPLE: ProviderInfo = {
  provider: 'fake', sample: true, needs_aa_handle: false,
  fi_types: ['DEPOSIT', 'TERM_DEPOSIT', 'RECURRING_DEPOSIT', 'MUTUAL_FUNDS', 'EQUITIES', 'ETF', 'NPS', 'EPF', 'PPF', 'INSURANCE_POLICIES'],
};
const SETU: ProviderInfo = { provider: 'setu', sample: false, needs_aa_handle: true, fi_types: ['DEPOSIT', 'MUTUAL_FUNDS', 'NPS'] };

const consent = (over: Partial<Consent> = {}): Consent => ({
  id: 'c1', status: 'active', fi_types: ['DEPOSIT', 'MUTUAL_FUNDS'], frequency: 'weekly', data_from: '2026-04-01', data_to: '2026-10-28',
  expires_at: '2027-10-28T00:00:00Z', created_at: '2026-10-28T00:00:00Z', activated_at: '2026-10-28T00:00:00Z',
  last_fetched_at: '2026-10-28T00:00:00Z', next_fetch_at: null, redirect_url: null, provider: 'fake', ...over,
});

const report = { payloads: 1, failed: 0, accounts: 1, txns: 3, skippedDuplicates: 0, holdings: 2, policies: 0 };

let rendered: Rendered[] = [];
async function open() {
  const Page = (await import('@/app/link/page')).default;
  const r = await render(<Page />);
  rendered.push(r);
  return r;
}

beforeEach(() => {
  h.ready = { ready: true, error: undefined };
  h.linker = {
    provider: vi.fn(async () => SAMPLE),
    consents: vi.fn(async () => [] as Consent[]),
    linkRecords: vi.fn(async () => new Map()),
    importInbox: vi.fn(async () => ({ ...report, payloads: 0, accounts: 0, txns: 0, holdings: 0 })),
    createConsent: vi.fn(async () => consent({ status: 'pending' })),
    waitWhilePending: vi.fn(async () => consent()),
    refresh: vi.fn(async () => ({ fetch: { saga_id: 's', state: 'sealed', started: true, attempt: 0, error_code: null, last_fetched_at: null }, report })),
    revoke: vi.fn(async () => 0),
  };
});

afterEach(async () => {
  for (const r of rendered) await r.unmount();
  rendered = [];
});

describe('link bank & investments', () => {
  test('the empty state is accessible, labels sample data, and names the page', async () => {
    const r = await open();
    expect(document.title).toBe('Link bank & investments · Khazana Online');
    expect(r.container.textContent).toContain('Sample Account Aggregator');
    expect(r.container.textContent).toContain('Nothing linked yet');
    expect(r.container.querySelectorAll('input[type="checkbox"]')).toHaveLength(6);
    expect(await violations(r.container)).toEqual([]);
  });

  test('linking creates a consent for the chosen types, then fetches and announces what was imported', async () => {
    const r = await open();
    await click(byText(r.container, 'Link'));
    expect(h.linker.createConsent).toHaveBeenCalledWith(['DEPOSIT', 'MUTUAL_FUNDS'], undefined);
    expect(h.linker.refresh).toHaveBeenCalledWith('c1');
    const status = r.container.querySelector('[role="status"]:not(.sr-only)');
    expect(status?.textContent).toBe('Imported 1 account, 3 transactions, 2 holdings.');
    expect(await violations(r.container)).toEqual([]);
  });

  test('a refusal is an alert in plain words', async () => {
    h.linker.createConsent = vi.fn(async () => { throw Object.assign(new Error('409'), { status: 409, code: 'too_many' }); });
    const r = await open();
    await click(byText(r.container, 'Link'));
    expect(r.container.querySelector('[role="alert"]')?.textContent).toMatch(/most links open/);
  });

  test('a real AA asks for the mobile number, and offers only what it can deliver', async () => {
    h.linker.provider = vi.fn(async () => SETU);
    const r = await open();
    expect(r.container.textContent).not.toContain('Sample Account Aggregator');
    const mobile = r.container.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!;
    expect(mobile.closest('label')?.textContent).toContain('Mobile number linked to your bank');
    expect((byText(r.container, 'Link') as HTMLButtonElement).disabled).toBe(true);
    const insurance = [...r.container.querySelectorAll('label')].find((l) => l.textContent?.includes('Insurance'))!;
    expect(insurance.querySelector('input')!.disabled).toBe(true);
    expect(r.container.textContent).toContain('EPF and PPF are not on the AA network yet.');
    expect(await violations(r.container)).toEqual([]);
  });

  test('a linked consent shows its status and dates; revoke explains what stays and can remove it', async () => {
    h.linker.consents = vi.fn(async () => [consent(), consent({ id: 'c2', status: 'revoked', fi_types: ['INSURANCE_POLICIES'] })]);
    h.linker.linkRecords = vi.fn(async () => new Map([['c1', { id: 'c1', owned: [], lastImportedAt: '2026-10-28T00:00:00Z', imported: { accounts: 1, txns: 3, holdings: 2, policies: 0 } }]]));
    h.linker.revoke = vi.fn(async () => 6);
    const r = await open();
    expect(r.container.textContent).toContain('Bank accounts, Mutual funds');
    expect(r.container.textContent).toContain('Revoked');
    expect(byText(r.container, 'Refresh now')).toBeTruthy();
    await click(byText(r.container, 'Revoke'));
    const panel = r.container.querySelector('[role="group"][aria-label="Revoke this link"]')!;
    expect(panel.textContent).toContain('stays in your records unless you remove it');
    expect(await violations(r.container)).toEqual([]);
    await click(panel.querySelector('input[type="checkbox"]')!);
    await click(byText(panel, 'Revoke'));
    expect(h.linker.revoke).toHaveBeenCalledWith('c1', true);
    expect(r.container.querySelector('[role="status"]:not(.sr-only)')?.textContent).toContain('6 records this link imported were removed');
  });
});
