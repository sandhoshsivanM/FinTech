// Khazana is free for everyone. There is no Pro tier, no paywall and nothing
// to unlock, so every screen that used to sit behind one must render its real
// content to a user who has paid nothing — which is every user.
//
// This replaces the old "backup, restore, export and erase are always free"
// invariant: with no gate left, the invariant is simply that nothing is gated.
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { useApp } from '@/lib/store';
import { ConfirmProvider } from '@khazana/screens/components/Confirm';
import { NAV_GROUPS } from '@khazana/screens/components/navConfig';
import type { Txn } from '@khazana/domain/types';
import TaxPage from '@khazana/screens/pages/tax';
import AnalyticsPage from '@khazana/screens/pages/analytics';
import ForecastPage from '@khazana/screens/pages/forecast';
import DividendsPage from '@khazana/screens/pages/dividends';
import WatchlistPage from '@khazana/screens/pages/watchlist';
import MarketsPage from '@khazana/screens/pages/markets';
import NewsPage from '@khazana/screens/pages/news';
import ReconcilePage from '@khazana/screens/pages/reconcile';
import ReportsPage from '@khazana/screens/pages/reports';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

type AppPatch = Partial<Parameters<typeof useApp.setState>[0]>;

const base: AppPatch = {
  txns: [], holdings: [], liabilities: [], accounts: [], postings: [],
  categories: [], budgets: [], goals: [], insurances: [], snapshots: [],
  recurring: [], dividends: [], fxRates: [], transfers: [], watchlist: [],
  ghost: false, currencyCode: 'INR',
};

/** Anything a paywall would say. None of it may appear on any screen. */
const PAYWALL = /\bPro\b|paywall|licen[cs]e key|unlock|upgrade|one-time payment|See what .* includes/i;

const FORMERLY_PRO: [string, () => React.ReactElement][] = [
  ['tax', () => <TaxPage />],
  ['analytics', () => <AnalyticsPage />],
  ['forecast', () => <ForecastPage />],
  ['dividends', () => <DividendsPage />],
  ['watchlist', () => <WatchlistPage />],
  ['markets', () => <MarketsPage />],
  ['news', () => <NewsPage />],
  ['reconcile', () => <ReconcilePage />],
  ['reports', () => <ReportsPage />],
];

beforeEach(() => {
  cleanup();
  useApp.setState(base);
});

describe('every formerly-Pro screen renders for everyone', () => {
  test.each(FORMERLY_PRO)('%s shows its real content, with no paywall', (_, page) => {
    const { container } = render(<ConfirmProvider>{page()}</ConfirmProvider>);
    // Real content: the page's own heading is there.
    expect(container.querySelector('h1')).not.toBeNull();
    // Nothing is rendered faded and inert behind an upgrade card.
    expect(container.querySelector('[inert]')).toBeNull();
    expect(container.textContent ?? '').not.toMatch(PAYWALL);
    expect(container.querySelector('a[href="/pro"]')).toBeNull();
  });

  test('report export (Excel and PDF) is offered to everyone', () => {
    const txn = {
      id: 't1', vaultId: 'v', type: 'expense', amount: '500', categoryId: 'c',
      date: new Date('2026-03-01').getTime(), note: 'x',
    } as unknown as Txn;
    useApp.setState({ ...base, txns: [txn] });
    render(<ConfirmProvider><ReportsPage /></ConfirmProvider>);
    expect(screen.getByRole('button', { name: /excel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pdf/i })).toBeInTheDocument();
  });
});

describe('there is nothing left to sell', () => {
  test('no /pro route and no Pro row in the navigation', () => {
    expect(existsSync(join(__dirname, 'pro'))).toBe(false);
    const items = NAV_GROUPS.flatMap((g) => g.items);
    expect(items.map((i) => i.href)).not.toContain('/pro');
    for (const i of items) {
      expect(i.label, i.href).not.toMatch(PAYWALL);
      expect('pro' in i, i.href).toBe(false);
    }
  });

  test('no source file gates, licenses or sells anything', () => {
    const src = join(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !p.endsWith('everythingFree.test.tsx')) {
          const body = readFileSync(p, 'utf8');
          if (/ProGate|lib\/entitlement|Khazana Pro|NEXT_PUBLIC_KHAZANA_PRO|isPro\b/.test(body)) offenders.push(p);
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});
