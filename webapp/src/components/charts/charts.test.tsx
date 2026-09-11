// Chart-kit guards. The web twins of test/widget/charts_test.dart.
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { Gauge } from './Gauge';
import { AreaChart } from './AreaChart';
import { Sunburst, type SunburstNode } from './Sunburst';
import { Donut, type DonutSeg } from './Donut';
import { groupShades, MAX_GROUP_SHADES, ASSET_GROUP_META, ASSET_GROUP_ORDER } from '@/domain/portfolio';

beforeEach(cleanup);

describe('Gauge', () => {
  test('a null value reads "Not yet tracked" and shows no number', () => {
    // This single behaviour is the entire honesty rule's UI surface. If it
    // regresses, an untracked score renders as a failing grade.
    render(<Gauge value={null} />);
    expect(screen.getByText('Not yet tracked')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.getByText('—')).toBeTruthy();
  });

  test('a tracked value shows the number and its grade', () => {
    render(<Gauge value={72} sublabel="Strong" />);
    expect(screen.getByText('72')).toBeTruthy();
    expect(screen.getByText('Strong')).toBeTruthy();
    expect(screen.queryByText('Not yet tracked')).toBeNull();
  });

  test('a zero score is not the same as no score', () => {
    render(<Gauge value={0} sublabel="At risk" />);
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.queryByText('Not yet tracked')).toBeNull();
  });

  test('clamps out-of-range values to the scale', () => {
    render(<Gauge value={340} />);
    expect(screen.getByText('100')).toBeTruthy();
  });

  test('announces itself to assistive tech', () => {
    render(<Gauge value={72} sublabel="Strong" />);
    expect(screen.getByRole('img', { name: '72, Strong' })).toBeTruthy();
  });

  test('the untracked state announces itself too', () => {
    render(<Gauge value={null} />);
    expect(screen.getByRole('img', { name: 'Not yet tracked' })).toBeTruthy();
  });
});

describe('AreaChart', () => {
  test('fewer than two points renders the empty state', () => {
    render(<AreaChart values={[42]} />);
    expect(screen.getByText('Not enough data yet')).toBeTruthy();
  });

  test('a perfectly flat series does not divide by zero', () => {
    render(<AreaChart values={[100, 100, 100]} />);
    expect(screen.getByText('Not enough data yet')).toBeTruthy();
  });

  test('two charts on one page get distinct gradient ids', () => {
    // The bug this guards: the id used to be hardcoded, so the second chart on
    // a page silently inherited the first one's gradient — which the Overview
    // and Score pages together would have hit.
    const { container } = render(
      <>
        <AreaChart values={[1, 2, 3]} />
        <AreaChart values={[3, 2, 1]} />
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('Sunburst', () => {
  const leaf = (label: string, value: number, color: string): SunburstNode =>
    ({ key: label, label, value, color });

  const root = (): SunburstNode => ({
    key: 'root',
    label: 'Portfolio',
    value: 1000,
    color: 'transparent',
    children: [
      {
        key: 'equity',
        label: 'Equity',
        value: 700,
        color: ASSET_GROUP_META.equity.light,
        children: [
          leaf('IT', 400, groupShades('equity', 2, false)[0]),
          leaf('Energy', 300, groupShades('equity', 2, false)[1]),
        ],
      },
      {
        key: 'gold',
        label: 'Gold',
        value: 300,
        color: ASSET_GROUP_META.gold.light,
        children: [leaf('GOLDBEES', 300, ASSET_GROUP_META.gold.light)],
      },
    ],
  });

  test('every arc is labelled for assistive tech', () => {
    render(<Sunburst root={root()} />);
    expect(screen.getByRole('button', { name: 'Equity, 70%' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gold, 30%' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'IT, 40%' })).toBeTruthy();
  });

  test('clicking a parent arc drills in and reports the path', () => {
    const onFocusChange = vi.fn();
    render(<Sunburst root={root()} onFocusChange={onFocusChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Equity, 70%' }));
    expect(onFocusChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Portfolio' }),
        expect.objectContaining({ label: 'Equity' }),
      ]),
    );
  });

  test('Enter drills in, so the chart is usable without a pointer', () => {
    const onFocusChange = vi.fn();
    render(<Sunburst root={root()} onFocusChange={onFocusChange} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Equity, 70%' }), { key: 'Enter' });
    expect(onFocusChange).toHaveBeenCalled();
  });

  test('drilling in reveals a breadcrumb back to the top', () => {
    render(<Sunburst root={root()} />);
    expect(screen.queryByRole('navigation', { name: 'Chart drill-down' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Equity, 70%' }));
    const crumbs = screen.getByRole('navigation', { name: 'Chart drill-down' });
    expect(within(crumbs).getByRole('button', { name: 'Portfolio' })).toBeTruthy();
  });

  test('the legend renders segments in the order given, never re-sorted', () => {
    // The palette's colourblind guarantee is a property of ASSET_GROUP_ORDER's
    // exact adjacency, so a value sort would break it silently.
    const { container } = render(<Sunburst root={root()} />);
    const legend = container.querySelectorAll('.flex-wrap > span');
    expect([...legend].map((s) => s.textContent?.trim())).toEqual(['Equity 70%', 'Gold 30%']);
  });

  test('an empty root renders a message rather than blank rings', () => {
    render(<Sunburst root={{ key: 'r', label: 'Portfolio', value: 0, color: '#ccc' }} />);
    expect(screen.getByText('Nothing to show yet')).toBeTruthy();
  });
});

describe('groupShades', () => {
  test('the first step is the group colour itself', () => {
    for (const g of ASSET_GROUP_ORDER) {
      expect(groupShades(g, 3, false)[0]).toBe(ASSET_GROUP_META[g].light);
      expect(groupShades(g, 3, true)[0]).toBe(ASSET_GROUP_META[g].dark);
    }
  });

  test('caps at five steps', () => {
    // Past five, adjacent steps stop separating and the chart would claim to
    // distinguish things a reader cannot.
    expect(groupShades('equity', 12, false)).toHaveLength(MAX_GROUP_SHADES);
  });

  test('the same (group, index) is always the same colour', () => {
    // Shade index follows a stable entity key, never value rank — otherwise a
    // price movement repaints the chart and the colours stop meaning anything.
    expect(groupShades('debt', 4, true)).toEqual(groupShades('debt', 4, true));
  });

  test('emits valid hex at every step', () => {
    for (const g of ASSET_GROUP_ORDER) {
      for (const shade of groupShades(g, MAX_GROUP_SHADES, false)) {
        expect(shade).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  test('light and dark ramps differ', () => {
    expect(groupShades('equity', 3, false)[2]).not.toBe(groupShades('equity', 3, true)[2]);
  });
});

describe('Donut folding', () => {
  const many = (n: number): DonutSeg[] =>
    Array.from({ length: n }, (_, i) => ({ label: `ITEM${i}`, value: n - i, color: 'var(--c1)' }));

  test('below the limit every segment keeps its own legend row', () => {
    render(<Donut segments={many(4)} maxSlices={6} />);
    expect(screen.getByText('ITEM3')).toBeTruthy();
    expect(screen.queryByText(/Others \(/)).toBeNull();
  });

  test('the tail folds into one row that names how many are in it', () => {
    const { container } = render(<Donut segments={many(10)} maxSlices={6} />);
    expect(screen.getByText('ITEM5')).toBeTruthy();
    expect(screen.queryByText('ITEM6')).toBeNull();
    // Scoped to the legend: the arc also carries a <title> with the same text
    // for its hover tooltip, so an unscoped query now matches twice.
    const legendRows = Array.from(container.querySelectorAll('span'))
      .map((el) => el.textContent ?? '');
    expect(legendRows.some((t) => /Others \(4\)/.test(t))).toBe(true);
  });

  test('each arc carries its value and share as a hover tooltip', () => {
    // Reading a slice off the legend means matching a colour by eye; hovering
    // the arc itself is what people actually try.
    const { container } = render(
      <Donut segments={many(3)} formatValue={(n) => `₹${n}`} />,
    );
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toHaveLength(3);
    expect(titles[0]).toMatch(/ITEM0/);
    expect(titles[0]).toMatch(/₹3/);
    expect(titles[0]).toMatch(/%/);
  });

  test('clicking "Others" reveals every folded item, then hides again', () => {
    // The whole point of the disclosure: a folded row that cannot be opened
    // tells the reader that a third of their money is somewhere unnamed.
    render(<Donut segments={many(10)} maxSlices={6} />);
    const btn = screen.getByRole('button', { expanded: false });
    fireEvent.click(btn);
    for (let i = 6; i < 10; i++) expect(screen.getByText(`ITEM${i}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { expanded: true }));
    expect(screen.queryByText('ITEM9')).toBeNull();
  });

  test('the folded share is the sum of what it hides', () => {
    // Six of ten plus four of ten out of a hundred: the folded row reads 40%,
    // not the share of any one member.
    const segs: DonutSeg[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ label: `H${i}`, value: 10, color: 'var(--c1)' })),
      ...Array.from({ length: 4 }, (_, i) => ({ label: `T${i}`, value: 10, color: 'var(--c1)' })),
    ];
    render(<Donut segments={segs} maxSlices={6} />);
    const btn = screen.getByRole('button', { expanded: false });
    expect(within(btn).getByText('40%')).toBeTruthy();
  });

  test('without maxSlices nothing is folded or dropped', () => {
    render(<Donut segments={many(12)} />);
    expect(screen.getByText('ITEM11')).toBeTruthy();
    expect(screen.queryByRole('button', { expanded: false })).toBeNull();
  });
});

describe('sector overrides reach the allocation', () => {
  // Regression: the holdings editor wrote `sector` faithfully and every screen
  // then classified on the bundled master alone, so an edited holding stayed
  // "Unclassified" no matter what was typed.
  test('a holding sector overrides the master, and blank falls back to it', async () => {
    const { classifyHolding } = await import('@/domain/instrumentMaster');
    const master = {
      schemaVersion: 1,
      bySymbol: new Map([['INFY', { symbol: 'INFY', sector: 'Information Technology', industry: 'IT Services', cap: 'large' as const }]]),
      byIsin: new Map(),
    };

    // Override wins.
    expect(classifyHolding(master, { symbol: 'INFY', sector: 'My Sector' })?.sector).toBe('My Sector');
    // Blank falls through to the master.
    expect(classifyHolding(master, { symbol: 'INFY', sector: '' })?.sector).toBe('Information Technology');
    expect(classifyHolding(master, { symbol: 'INFY' })?.sector).toBe('Information Technology');
    // A symbol the master has never heard of is classified purely by the override.
    expect(classifyHolding(master, { symbol: 'UNKNOWNXYZ', sector: 'Healthcare' })?.sector).toBe('Healthcare');
    // Nothing anywhere stays undefined, so callers still say "Unclassified".
    expect(classifyHolding(master, { symbol: 'UNKNOWNXYZ' })).toBeUndefined();
    // Cap override behaves the same way.
    expect(classifyHolding(master, { symbol: 'INFY', marketCapBand: 'small' })?.cap).toBe('small');
  });
});

describe('hover readouts', () => {
  // A `title` attribute is an OS tooltip: delayed, platform-styled, and absent
  // entirely on touch. Every chart has to state its figure itself.
  test('ColumnChart names the hovered period and its value', async () => {
    const { ColumnChart } = await import('./ColumnChart');
    const { container } = render(
      <ColumnChart columns={[{ label: 'Jul 26', value: 22 }, { label: 'Aug 26', value: 232 }]}
        format={(n) => `₹${n}`} />,
    );
    // Hidden until hovered — but always occupying its slot, so the bar does
    // not move when it appears.
    expect(screen.getByText('₹232')).toHaveStyle({ visibility: 'hidden' });

    const cols = container.querySelectorAll('div.flex-1');
    fireEvent.mouseEnter(cols[1]);
    expect(screen.getByText('₹232')).toHaveStyle({ visibility: 'visible' });
  });

  test('Bars names the hovered group and every series in it', async () => {
    const { Bars } = await import('../ui');
    const { container } = render(
      <Bars
        groups={[
          { label: 'Jul 26', values: [{ value: 100, color: 'green' }, { value: 40, color: 'red' }] },
          { label: 'Aug 26', values: [{ value: 300, color: 'green' }, { value: 90, color: 'red' }] },
        ]}
        formatY={(n) => `₹${n}`}
      />,
    );
    expect(screen.queryByText('₹300')).toBeNull();

    const groups = container.querySelectorAll('div.flex-1');
    fireEvent.mouseEnter(groups[1]);
    // Twice on purpose: once in the readout, once as the axis label beneath.
    expect(screen.getAllByText('Aug 26')).toHaveLength(2);
    expect(screen.getByText('₹300')).toBeInTheDocument();
    expect(screen.getByText('₹90')).toBeInTheDocument();
  });

  // The readout used to be one node pinned to `left-0 right-0 text-center` on
  // the chart wrapper, so it rendered over the middle of the WHOLE chart no
  // matter which group was hovered — hovering the third of three months printed
  // its figures above the second month's bars. It has to live inside the column
  // it describes. jsdom does no layout, so the containment is what's assertable
  // and it is also the thing that was actually wrong.
  test('the Bars readout renders inside the hovered group, not the chart', async () => {
    const { Bars } = await import('../ui');
    const { container } = render(
      <Bars
        groups={[
          { label: 'Jul 26', values: [{ value: 100, color: 'green' }] },
          { label: 'Aug 26', values: [{ value: 300, color: 'green' }] },
          { label: 'Sep 26', values: [{ value: 121, color: 'green' }] },
        ]}
        formatY={(n) => `₹${n}`}
      />,
    );
    const groups = container.querySelectorAll('div.flex-1');

    fireEvent.mouseEnter(groups[2]);
    expect(groups[2]).toContainElement(screen.getByText('₹121'));
    expect(groups[1]).not.toContainElement(screen.getByText('₹121'));

    // And it follows the cursor to another group rather than accumulating.
    fireEvent.mouseEnter(groups[0]);
    expect(screen.queryByText('₹121')).toBeNull();
    expect(groups[0]).toContainElement(screen.getByText('₹100'));
  });

  test('AreaChart reports the nearest point as the pointer moves', async () => {
    const { AreaChart } = await import('./AreaChart');
    const { container } = render(
      <AreaChart values={[10, 20, 30, 40]} format={(n) => `₹${n}`} />,
    );
    const wrap = container.firstChild as HTMLElement;
    // jsdom has no layout, so give the element a box to measure against.
    wrap.getBoundingClientRect = () => ({ left: 0, width: 400, top: 0, height: 100,
      right: 400, bottom: 100, x: 0, y: 0, toJSON: () => {} }) as DOMRect;

    fireEvent.mouseMove(wrap, { clientX: 400 });
    expect(screen.getByText('₹40')).toBeInTheDocument();

    fireEvent.mouseMove(wrap, { clientX: 0 });
    expect(screen.getByText('₹10')).toBeInTheDocument();

    fireEvent.mouseLeave(wrap);
    expect(screen.queryByText('₹10')).toBeNull();
  });
});
