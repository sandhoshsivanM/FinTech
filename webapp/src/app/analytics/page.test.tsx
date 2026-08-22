// Analytics composition, against the design spec (Part C, /analytics).
//
// The screen shipped as three 176px dials, a month-movement column chart and
// two aggregate lists. The spec calls for six figures, three structural reads
// and three time-and-shape figures — including a sunburst whose component,
// colour ramp and roll-up were all built and shipped without ever being
// rendered by anything.
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { useApp } from '@/lib/store';
import type { Holding } from '@/lib/types';
import AnalyticsPage from './page';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

const hold = (over: Partial<Holding>): Holding => ({
  id: over.symbol ?? 'h', vaultId: 'v', symbol: 'X', exchange: 'NSE',
  quantity: '100', avgCost: '100', lastPrice: '100', assetType: 'equity_etf', ...over,
} as Holding);

/** A position worth `qty × 100`, `pct` above its cost. */
const at = (symbol: string, pct: number, qty = 100): Holding =>
  hold({ id: symbol, symbol, quantity: String(qty), lastPrice: '100',
    avgCost: String(100 / (1 + pct / 100)) });

function seed(holdings: Holding[]) {
  useApp.setState({
    holdings, snapshots: [], fxRates: [], ghost: false, currencyCode: 'INR',
    txns: [], liabilities: [], accounts: [], postings: [], categories: [],
    budgets: [], goals: [], insurances: [], recurring: [], dividends: [],
    // Analytics is a Pro screen. These tests are about the figures it computes,
    // not about the paywall — the gate itself is covered by gates.test.ts.
    // Without this the page renders blurred behind the Pro card and every
    // query below finds nothing.
    pro: { isPro: true, source: 'licenseKey' },
  });
}

const BOOK = [
  at('HDFCBANK', 12, 12), at('INFY', 30, 9), at('ICICIBANK', 5, 8),
  at('TCS', -4, 7), at('NIFTYBEES', 55, 6), at('TATAMOTORS', -18, 5),
  at('MARUTI', 25, 5), at('SUNPHARMA', 46, 4),
];

beforeEach(cleanup);

/** The six-figure strip. Scoped, because its labels legitimately repeat as
 *  card headings further down the page. */
const strip = () => screen.getByRole('group', { name: 'Key figures' });

describe('the six figures', () => {
  test('all six are present, as a strip rather than as dials', () => {
    seed(BOOK);
    render(<AnalyticsPage />);
    for (const label of ['Diversification', 'Concentration', 'Positions',
      'Return quality', 'Best position', 'Weakest']) {
      expect(within(strip()).getByText(label)).toBeInTheDocument();
    }
  });

  test('best and weakest name the position, by return and not by size', () => {
    seed(BOOK);
    render(<AnalyticsPage />);
    // NIFTYBEES is up 55% on 6 units; HDFCBANK is the largest position but only
    // up 12%. The extreme is about return.
    expect(within(strip()).getByText('NIFTYBEES')).toBeInTheDocument();
    expect(within(strip()).getByText('TATAMOTORS')).toBeInTheDocument();
  });

  test('concentration reports the fact, not a derived risk score', () => {
    // It used to render an inverted 0–100 "Concentration risk" — a number with
    // no unit that read "12 / Needs work" for an ordinary all-equity book. The
    // largest asset group's actual share is the thing a reader can act on.
    seed(BOOK);
    render(<AnalyticsPage />);
    expect(screen.getByText('largest asset group')).toBeInTheDocument();
    expect(screen.queryByText('Concentration risk')).not.toBeInTheDocument();
  });
});

describe('the three structural reads', () => {
  test('risk & diversification carries the stat table, not just a dial', () => {
    seed(BOOK);
    render(<AnalyticsPage />);
    for (const row of ['Holdings', 'Sectors represented', 'Largest position',
      'Top 5 weight', 'Equity weight', 'Non-equity sleeves']) {
      expect(screen.getByText(row)).toBeInTheDocument();
    }
  });

  test('concentration ranks positions by name', () => {
    seed(BOOK);
    render(<AnalyticsPage />);
    const card = screen.getByRole('heading', { name: 'Concentration' }).closest('section')!;
    // The heaviest position leads the ranking.
    expect(within(card).getByText('HDFCBANK')).toBeInTheDocument();
  });

  test('an over-weight position raises the alert callout', () => {
    // One name at 60% of the book, well past the 8% ceiling.
    seed([at('HEAVY', 0, 60), at('A', 0, 10), at('B', 0, 10),
      at('C', 0, 10), at('D', 0, 10)]);
    render(<AnalyticsPage />);
    expect(screen.getByText(/exceeds? the alert weight|exceed the alert weight/i))
      .toBeInTheDocument();
    expect(screen.getByText(/above the 8% ceiling/i)).toBeInTheDocument();
  });

  test('a level book raises no alert', () => {
    seed(Array.from({ length: 20 }, (_, i) => at(`H${i}`, 0, 5)));
    render(<AnalyticsPage />);
    expect(screen.queryByText(/alert weight/i)).not.toBeInTheDocument();
  });

  test('return distribution is a labelled histogram', () => {
    seed(BOOK);
    render(<AnalyticsPage />);
    expect(screen.getByText('Return distribution')).toBeInTheDocument();
    // The fixed axis, present whatever the data.
    for (const bucket of ['<−10', '−10–0', '0–10', '>40']) {
      expect(screen.getByText(bucket)).toBeInTheDocument();
    }
  });
});

describe('where value sits', () => {
  test('the sunburst is actually rendered', () => {
    // Its component, colour ramp and `sunburst()` roll-up all shipped with zero
    // callers. This is the test that keeps it wired in.
    seed(BOOK);
    render(<AnalyticsPage />);
    expect(screen.getByText('Where value sits')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /equity/i })).toBeInTheDocument();
  });
});

describe('honesty', () => {
  test('an empty book offers a way in rather than a page of zeros', () => {
    seed([]);
    render(<AnalyticsPage />);
    expect(screen.getByText('Nothing to analyse yet')).toBeInTheDocument();
    expect(screen.getByText('Add a holding')).toBeInTheDocument();
  });

  test('a single holding scores nothing rather than scoring badly', () => {
    // One position cannot be called diversified or concentrated.
    seed([at('ONLY', 10)]);
    render(<AnalyticsPage />);
    expect(screen.getByText('Needs two holdings')).toBeInTheDocument();
  });

  test('the subtitle says what the page is for', () => {
    seed(BOOK);
    render(<AnalyticsPage />);
    expect(screen.getByText('How the portfolio is built, and how it behaves'))
      .toBeInTheDocument();
  });
});

describe('layout', () => {
  test('the six figures sit on one track spec, not two fighting ones', () => {
    // Tailwind v4 emits arbitrary `min-[…]:` variants BEFORE the named
    // breakpoint scale, so `min-[1180px]:grid-cols-6` passed via className lost
    // to the `md:grid-cols-4` baked into MetricRow — silently, as a 4+2 wrap.
    // Passing the whole spec via `cols` is what makes the caller win.
    seed(BOOK);
    render(<AnalyticsPage />);
    const cls = strip().className;
    expect(cls).toContain('xl:grid-cols-6');
    expect(cls).not.toContain('md:grid-cols-4');
    expect(cls).not.toMatch(/min-\[\d+px\]:grid-cols/);
  });

  test('the risk card never splits itself on a viewport breakpoint', () => {
    // It is one third of the row, so a viewport-sized split measured the stat
    // column against the window and truncated four of six labels.
    seed(BOOK);
    render(<AnalyticsPage />);
    const card = screen.getByRole('heading', { name: /Risk & diversification/ })
      .closest('section')!;
    const grid = card.querySelector('div.grid')!;
    expect(grid.className).not.toMatch(/(sm|md|lg|xl):grid-cols/);
  });

  test('one quantity is never printed as two different figures', () => {
    // An all-equity book showed "Concentration 100.0%" beside "Equity weight
    // 99.9%" — the same share, from two roll-up paths that round differently.
    seed([at('A', 0, 50), at('B', 0, 50)]);
    render(<AnalyticsPage />);
    const conc = within(strip()).getByText('largest asset group')
      .parentElement!.textContent!;
    const equity = screen.getByText('Equity weight').closest('div')!.textContent!;
    const pctOf = (s: string) => s.match(/(\d+\.\d)%/)?.[1];
    expect(pctOf(conc)).toBe(pctOf(equity));
  });
});
