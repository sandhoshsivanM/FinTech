// Navigation structure guards for the web shell.
//
// The twin of `test/widget/navigation_test.dart`. Two things must hold:
//
//   1. The five bottom-bar destinations match the Flutter app's tab bar. A user
//      moving between clients should not have to relearn where things are.
//   2. The sidebar is the complete route index — nothing is reachable only by
//      typing a URL.
//
// Plus one guard that is specific to the web: the bottom bar must not carry
// `data-tour` attributes, because `Tour.tsx` resolves its targets with
// `querySelector` (first match in DOM order) and the sidebar copy is `hidden`
// at phone widths. Duplicating them leaves the tour spotlighting nothing.
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { Shell } from './Shell';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  // The command palette in the shell navigates on Enter.
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));
// The tour reaches into the DOM on mount; it is not what these tests are about.
vi.mock('./Tour', () => ({ Tour: () => null }));

/**
 * The Flutter bottom bar, from `lib/presentation/app_shell.dart`'s `_tabs`.
 * Kept as a literal rather than imported, because the point is to catch the two
 * lists drifting apart — a shared source would make the test vacuous.
 */
const FLUTTER_TABS = ['/dashboard', '/transactions', '/investments', '/score', '/settings'];

/**
 * Every route the app serves. Mirrors `_allRoutes` in the Dart test for the
 * routes the two clients share; the web-only screens added in the platform
 * redesign are listed after them.
 */
const ALL_ROUTES = [
  '/dashboard', '/transactions', '/add', '/calendar', '/investments', '/score',
  '/liabilities', '/insurance', '/safety-net', '/budget', '/goals', '/reports',
  '/recurring', '/settings',
  // Web-only, added with the platform redesign.
  '/analytics', '/holdings', '/watchlist', '/markets', '/dividends', '/tax',
  '/news', '/alerts', '/help', '/import', '/diagnostics', '/reconcile',
];

/** Reached from within a parent screen, so they get no nav row of their own. */
const NAV_EXEMPT = ['/add'];

beforeEach(cleanup);

function renderShell() {
  return render(<Shell><div>content</div></Shell>);
}

describe('bottom nav', () => {
  test('has exactly the five Flutter tabs, in order', () => {
    renderShell();
    const bar = screen.getByRole('navigation', { name: 'Primary' });
    const hrefs = within(bar)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(FLUTTER_TABS);
  });

  test('marks the active destination with aria-current', () => {
    renderShell();
    const bar = screen.getByRole('navigation', { name: 'Primary' });
    const current = within(bar)
      .getAllByRole('link')
      .filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', '/dashboard');
  });

  test('carries no data-tour attributes', () => {
    const { container } = renderShell();
    const bar = screen.getByRole('navigation', { name: 'Primary' });
    expect(bar.querySelectorAll('[data-tour]')).toHaveLength(0);
    // And the tour's own targets still resolve to exactly one element each.
    for (const attr of ['nav', 'add', 'ghost', 'theme', 'profile']) {
      expect(container.querySelectorAll(`[data-tour="${attr}"]`).length)
        .toBeLessThanOrEqual(1);
    }
  });
});

describe('sidebar', () => {
  test('links every route except the explicit exemptions', () => {
    const { container } = renderShell();
    const hrefs = new Set(
      [...container.querySelectorAll('nav[data-tour="nav"] a')].map((a) =>
        a.getAttribute('href'),
      ),
    );
    const missing = ALL_ROUTES.filter((r) => !NAV_EXEMPT.includes(r) && !hrefs.has(r));
    expect(missing, `unreachable from the nav: ${missing.join(', ')}`).toEqual([]);
  });

  test('includes /score', () => {
    const { container } = renderShell();
    expect(container.querySelector('nav[data-tour="nav"] a[href="/score"]')).toBeTruthy();
  });
});
