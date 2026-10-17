import { describe, expect, test } from 'vitest';
import {
  WIDGETS, allowedSizes, defaultLayout, moveWidget, packSpans, nudgeWidget, resolveLayout, setWidgetHidden, setWidgetSize,
} from './dashboardLayout';

const ids = (l: { id: string }[]) => l.map((x) => x.id);

describe('resolveLayout', () => {
  test('nothing saved, or garbage, gives the default', () => {
    expect(resolveLayout(null)).toEqual(defaultLayout());
    expect(resolveLayout('nope')).toEqual(defaultLayout());
  });

  test('keeps the saved order and settings, drops unknown and duplicate ids, repairs sizes', () => {
    const saved = [
      { id: 'budgets', size: 'xl', hidden: false },
      { id: 'ghost-widget', size: 's', hidden: false },
      { id: 'netWorth', size: 'huge', hidden: true },
      { id: 'budgets', size: 's', hidden: true },
    ];
    const l = resolveLayout(saved);
    expect(l.find((x) => x.id === 'budgets')).toEqual({ id: 'budgets', size: 'xl', hidden: false });
    expect(l.find((x) => x.id === 'netWorth')).toEqual({ id: 'netWorth', size: 'xl', hidden: true });
    expect(ids(l).indexOf('budgets')).toBeLessThan(ids(l).indexOf('netWorth'));
    expect(ids(l)).not.toContain('ghost-widget');
    expect(new Set(ids(l)).size).toBe(WIDGETS.length);
  });

  test('a widget the save has never seen lands after its default neighbour', () => {
    const saved = defaultLayout().filter((x) => x.id !== 'cashFlow');
    const l = resolveLayout(saved);
    expect(ids(l).indexOf('cashFlow')).toBe(ids(l).indexOf('inOut') + 1);
  });
});

describe('editing', () => {
  const base = defaultLayout();

  test('moveWidget puts the widget before or after the target', () => {
    const before = moveWidget(base, 'budgets', 'balance');
    expect(ids(before).slice(0, 2)).toEqual(['budgets', 'balance']);
    const after = moveWidget(base, 'balance', 'wallet', true);
    expect(ids(after).slice(0, 2)).toEqual(['wallet', 'balance']);
    expect(moveWidget(base, 'balance', 'nope')).toBe(base);
  });

  test('nudgeWidget steps over hidden widgets', () => {
    const l = setWidgetHidden(base, 'wallet', true);
    const moved = nudgeWidget(l, 'balance', 1);
    const visible = ids(moved.filter((x) => !x.hidden));
    expect(visible.slice(0, 2)).toEqual(['insight', 'balance']);
    expect(nudgeWidget(base, 'balance', -1)).toBe(base);
  });

  test('a wide widget cannot go below its minimum size, saved or set', () => {
    expect(allowedSizes('netWorth')).toEqual(['m', 'l', 'xl']);
    expect(allowedSizes('balance')).toEqual(['s', 'm', 'l', 'xl']);
    expect(setWidgetSize(base, 'netWorth', 's').find((x) => x.id === 'netWorth')?.size).toBe('m');
    expect(resolveLayout([{ id: 'netWorth', size: 's', hidden: false }]).find((x) => x.id === 'netWorth')?.size).toBe('m');
  });

  test('size and visibility change only the named widget', () => {
    const l = setWidgetSize(base, 'goals', 'l');
    expect(l.find((x) => x.id === 'goals')?.size).toBe('l');
    expect(l.filter((x) => x.id !== 'goals')).toEqual(base.filter((x) => x.id !== 'goals'));
  });
});

describe('packSpans', () => {
  const S = { s: 4, m: 6, l: 8, xl: 12 } as const;
  test('the last card of a short row grows to fill it', () => {
    // M (6) + S (4) leaves 2; the next M does not fit, so the S grows to 6.
    expect(packSpans([{ id: 'a', size: 'm' }, { id: 'b', size: 's' }, { id: 'c', size: 'm' }], S, 12))
      .toEqual({ a: 6, b: 6, c: 12 });
  });
  test('full rows are left alone', () => {
    expect(packSpans([{ id: 'a', size: 's' }, { id: 'b', size: 's' }, { id: 'c', size: 's' }, { id: 'd', size: 'l' }, { id: 'e', size: 's' }], S, 12))
      .toEqual({ a: 4, b: 4, c: 4, d: 8, e: 4 });
  });
  test('a size wider than the grid is capped', () => {
    expect(packSpans([{ id: 'a', size: 'xl' }], { s: 3, m: 3, l: 6, xl: 6 }, 6)).toEqual({ a: 6 });
  });
});
