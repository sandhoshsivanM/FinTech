// The dividends chart. Two things it must not do: draw a bar for a month with
// no payouts, and hide the figures behind a hover tooltip that a phone user
// and a screenshot can never reach.
import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ColumnChart } from './ColumnChart';

const MONTHS = [
  { label: 'Jun 26', value: 8 },
  { label: 'Jul 26', value: 22 },
  { label: 'Aug 26', value: 232 },
  { label: 'Sep 26', value: 0 },
  { label: 'Oct 26', value: 0 },
];

/** Bars carry a title; empty periods must contribute none. */
const bars = (c: HTMLElement) => c.querySelectorAll('[title]');

beforeEach(cleanup);

describe('ColumnChart', () => {
  test('draws a bar only for periods with a value', () => {
    // Regression: a 3px minimum height was applied to zero as well, so ten
    // empty months rendered identically to real small payouts.
    const { container } = render(<ColumnChart columns={MONTHS} />);
    expect(bars(container)).toHaveLength(3);
  });

  test('every period still gets its label', () => {
    render(<ColumnChart columns={MONTHS} />);
    for (const m of MONTHS) expect(screen.getByText(m.label)).toBeInTheDocument();
  });

  test('showValues prints the figure for each non-empty period', () => {
    render(<ColumnChart columns={MONTHS} showValues format={(n) => `₹${n}`} />);
    expect(screen.getByText('₹8')).toBeInTheDocument();
    expect(screen.getByText('₹22')).toBeInTheDocument();
    expect(screen.getByText('₹232')).toBeInTheDocument();
    // ...and nothing for the empty ones.
    expect(screen.queryByText('₹0')).toBeNull();
  });

  test('formatLabel gives the on-bar figure a compact form', () => {
    render(
      <ColumnChart columns={[{ label: 'Aug 26', value: 232000 }]} showValues
        format={(n) => `₹${n.toFixed(2)}`} formatLabel={(n) => `₹${(n / 1000).toFixed(0)}K`} />,
    );
    expect(screen.getByText('₹232K')).toBeInTheDocument();
  });

  test('values are off by default, so existing charts are unchanged', () => {
    render(<ColumnChart columns={MONTHS} format={(n) => `₹${n}`} />);
    // Present but hidden. The slot is reserved deliberately: inserting the
    // label on hover pushed the bar down and made the widget jump.
    expect(screen.getByText('₹232')).toHaveStyle({ visibility: 'hidden' });
  });

  test('negative periods render below the axis and still label', () => {
    const { container } = render(
      <ColumnChart columns={[{ label: 'A', value: -50 }, { label: 'B', value: 0 }]} showValues format={(n) => `${n}`} />,
    );
    expect(bars(container)).toHaveLength(1);
    expect(screen.getByText('-50')).toBeInTheDocument();
  });

  test('an all-zero set draws no bars at all', () => {
    const { container } = render(<ColumnChart columns={[{ label: 'A', value: 0 }, { label: 'B', value: 0 }]} />);
    expect(bars(container)).toHaveLength(0);
  });
});
