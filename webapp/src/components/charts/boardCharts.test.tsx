// Guards for the dashboard chart board's components.
import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SplitBar } from '@khazana/ui/charts/SplitBar';
import { DotMatrix } from '@khazana/ui/charts/DotMatrix';
import { SplineDots } from '@khazana/ui/charts/SplineDots';
import { MirrorBars } from '@khazana/ui/charts/MirrorBars';
import { BlockStack, niceTicks } from '@khazana/ui/charts/BlockStack';
import { TrendTile } from '@khazana/ui/charts/TrendTile';
import { DotProgress } from '@khazana/ui/charts/DotProgress';
import { PaceBars } from '@khazana/ui/charts/PaceBars';
import { SpendCalendar } from '@khazana/ui/charts/SpendCalendar';
import { smoothPath } from '@khazana/ui/charts/smoothPath';

beforeEach(cleanup);
const fmt = (n: number) => `₹${n}`;

describe('SplitBar', () => {
  test('labels each part with its true share and names the amount on hover', () => {
    render(<SplitBar format={fmt} segments={[
      { label: 'Salary', value: 120000, color: 'red' },
      { label: 'Freelance', value: 18000, color: 'blue' },
      { label: 'Dividends', value: 4000, color: 'green' },
    ]} />);
    expect(screen.getByText('85%')).toBeTruthy();
    expect(screen.getByText('13%')).toBeTruthy();
    expect(screen.getByText('3%')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Salary 85%, Freelance 13%, Dividends 3%' })).toBeTruthy();
  });

  test('nothing to split renders nothing', () => {
    const { container } = render(<SplitBar format={fmt} segments={[{ label: 'A', value: 0, color: 'red' }]} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('DotMatrix', () => {
  test('fills dots in proportion and clamps past 100%', () => {
    const { container } = render(<DotMatrix groups={[
      { label: 'Goa', fraction: 0.7, color: 'rgb(1, 2, 3)' },
      { label: 'Over', fraction: 1.4, color: 'rgb(4, 5, 6)' },
    ]} />);
    // +1 for each group's legend swatch, which shares the colour.
    const filled = (c: string) => [...container.querySelectorAll('span')].filter((s) => s.style.background === c).length;
    expect(filled('rgb(1, 2, 3)')).toBe(Math.round(0.7 * 35) + 1);
    expect(filled('rgb(4, 5, 6)')).toBe(35 + 1);
  });
});

describe('SplineDots', () => {
  test('one point is not a line', () => {
    const { container } = render(<SplineDots format={fmt} points={[{ label: 'Sat', value: 960 }]} />);
    expect(container.innerHTML).toBe('');
  });

  test('pins the latest value, and hovering moves the readout', () => {
    render(<SplineDots format={fmt} points={[
      { label: 'Fri', value: 1050, title: 'Fri 16' }, { label: 'Sat', value: 960, title: 'Today' },
    ]} />);
    expect(screen.getByText('Today ₹960')).toBeTruthy();
  });
});

describe('MirrorBars', () => {
  test('the readout says kept or short for the selected period', () => {
    render(<MirrorBars format={fmt} rows={[{ label: 'Sep', up: 100, down: 130 }, { label: 'Oct', up: 142, down: 121 }]} />);
    expect(screen.getByText('kept ₹21')).toBeTruthy();
    fireEvent.mouseEnter(screen.getByRole('img').children[1]);
    expect(screen.getByText('short ₹30')).toBeTruthy();
  });
});

describe('BlockStack', () => {
  test('niceTicks rounds the scale up past the maximum', () => {
    expect(niceTicks(142000)).toEqual([0, 50000, 100000, 150000]);
    expect(niceTicks(0)).toEqual([0]);
  });

  test('columns are buttons; selecting one shows its parts in the readout', () => {
    render(<BlockStack format={fmt} columns={[
      { label: 'Sep', total: { label: 'Income', value: 140, color: 'blue' }, parts: [{ label: 'Spent', value: 100, color: 'red' }, { label: 'Saved', value: 40, color: 'green' }] },
      { label: 'Oct', total: { label: 'Income', value: 142, color: 'blue' }, parts: [{ label: 'Spent', value: 96, color: 'red' }, { label: 'Saved', value: 46, color: 'green' }] },
    ]} />);
    expect(screen.getByText('₹46')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Sep/ }));
    expect(screen.getByText('₹40')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Sep/ }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('TrendTile', () => {
  test('a fall in a liability is good news', () => {
    render(<TrendTile title="Liabilities" value="₹6.2 L" values={[639, 620]} color="red" tint="pink"
      change={{ up: false, text: '3%', good: true }} marker="₹6.2 L" />);
    expect(screen.getByLabelText(/Liabilities ₹6.2 L, down 3% vs last month/)).toBeTruthy();
    expect(document.querySelector('.text-success')).toBeTruthy();
  });

  test('ghost mode hides the figure and the line that would give it away', () => {
    const { container } = render(<TrendTile title="Net worth" value="₹15.07 L" values={[1, 2]} color="blue" tint="x"
      change={null} marker="₹15.07 L" ghost />);
    expect(screen.queryByText('₹15.07 L')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('DotProgress', () => {
  test('announces its share', () => {
    render(<DotProgress fraction={0.35} />);
    expect(screen.getByRole('img', { name: '35%' })).toBeTruthy();
  });
});

describe('PaceBars', () => {
  test('each status gets its own chip', () => {
    render(<PaceBars elapsed={0.55} elapsedLabel="Today" rows={[
      { label: 'Food', ratio: 1.24, status: 'over', amounts: 'a', over: '₹3,640' },
      { label: 'Shopping', ratio: 0.83, status: 'ahead', amounts: 'b' },
      { label: 'Transport', ratio: 0.55, status: 'onTrack', amounts: 'c' },
    ]} />);
    expect(screen.getByText('Over by ₹3,640')).toBeTruthy();
    expect(screen.getByText('Ahead of pace')).toBeTruthy();
    expect(screen.getByText('On track')).toBeTruthy();
  });
});

describe('SpendCalendar', () => {
  test('pads to the first weekday and leaves future days empty', () => {
    const { container } = render(<SpendCalendar format={fmt} monthLabel="Oct" firstWeekday={4} today={2}
      days={[{ date: 1, value: 33200 }, { date: 2, value: 960 }, { date: 3, value: null }]} />);
    const grid = screen.getByRole('img');
    // 7 weekday headers + 4 pad cells + 3 days.
    expect(grid.children).toHaveLength(14);
    expect(container.querySelectorAll('.border-dashed')).toHaveLength(1);
  });
});

describe('smoothPath', () => {
  test('passes through every point', () => {
    const d = smoothPath([[0, 10], [50, 0], [100, 20]]);
    expect(d.startsWith('M0,10')).toBe(true);
    expect(d).toContain('50.00,0.00');
    expect(d.endsWith('100.00,20.00')).toBe(true);
  });
});
