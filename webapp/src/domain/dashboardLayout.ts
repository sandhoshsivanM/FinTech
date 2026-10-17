/**
 * The dashboard's arrangement: which widgets show, in what order, at what size.
 *
 * Pure data and functions so the rules — a saved layout never loses a widget
 * added in a later release, a stale id never crashes the page — are tested
 * without a browser. Persistence lives in `useDashboardLayout`.
 */

export type WidgetSize = 's' | 'm' | 'l' | 'xl';

/** Columns a size takes on the 12-column desktop grid. */
export const SIZE_COLS: Record<WidgetSize, number> = { s: 4, m: 6, l: 8, xl: 12 };
export const SIZE_LABEL: Record<WidgetSize, string> = { s: 'S', m: 'M', l: 'L', xl: 'XL' };
/** Spoken names for the size buttons; "XL" read aloud is noise. */
export const SIZE_NAME: Record<WidgetSize, string> = { s: 'Small', m: 'Medium', l: 'Large', xl: 'Full width' };
export const SIZES: WidgetSize[] = ['s', 'm', 'l', 'xl'];

export interface WidgetDef {
  id: string;
  title: string;
  size: WidgetSize;
  /** The smallest size its contents still read at; smaller sizes are not offered. */
  minSize?: WidgetSize;
  /** Off in the default layout; still available from "Add widgets". */
  hiddenByDefault?: boolean;
}

/**
 * Every widget, in the default order. A new widget is added here once; saved
 * layouts pick it up automatically (see `resolveLayout`).
 */
export const WIDGETS: WidgetDef[] = [
  { id: 'balance', title: 'Total balance', size: 's' },
  { id: 'wallet', title: 'My wallet', size: 's' },
  { id: 'insight', title: 'Insight', size: 's' },
  { id: 'week', title: 'Last 7 days', size: 'l', minSize: 'm' },
  { id: 'budgetMonth', title: 'Budget this month', size: 's' },
  { id: 'income', title: 'Income', size: 's' },
  { id: 'goalsSaved', title: 'Saved toward goals', size: 's' },
  { id: 'spentWeek', title: 'Spent this week', size: 's' },
  { id: 'inOut', title: 'Money in and out', size: 's' },
  { id: 'cashFlow', title: 'Cash flow', size: 'l', minSize: 'm' },
  { id: 'tileNetWorth', title: 'Net worth trend', size: 's' },
  { id: 'tileInvestments', title: 'Investments trend', size: 's' },
  { id: 'tileLiabilities', title: 'Liabilities trend', size: 's' },
  { id: 'spendCategory', title: 'Spending by category', size: 's' },
  { id: 'goals', title: 'Goals', size: 's' },
  { id: 'budgets', title: 'Budgets', size: 's' },
  { id: 'dailySpend', title: 'Daily spending', size: 'xl', minSize: 'm' },
  { id: 'netWorth', title: 'Net worth', size: 'xl', minSize: 'm' },
  { id: 'thisMonth', title: 'This month', size: 'xl', minSize: 'm' },
  { id: 'performance', title: 'Portfolio performance', size: 'xl', minSize: 'm' },
  { id: 'allocation', title: 'Allocation', size: 'm' },
  { id: 'movers', title: 'Movers', size: 'm' },
  { id: 'health', title: 'Financial health', size: 'm' },
  { id: 'insights', title: 'Insights list', size: 'm' },
  { id: 'holdings', title: 'Top holdings', size: 'l', minSize: 'm' },
  { id: 'bills', title: 'Upcoming bills', size: 's' },
  { id: 'latest', title: 'Latest transactions', size: 's' },
  { id: 'monthTiles', title: 'Month summary tiles', size: 'm', hiddenByDefault: true },
];

export interface LayoutItem { id: string; size: WidgetSize; hidden: boolean }
export type Layout = LayoutItem[];

export const defaultLayout = (): Layout =>
  WIDGETS.map((w) => ({ id: w.id, size: w.size, hidden: !!w.hiddenByDefault }));

const isSize = (s: unknown): s is WidgetSize => typeof s === 'string' && s in SIZE_COLS;

/** Sizes a widget may take: everything from its minimum up. */
export function allowedSizes(id: string): WidgetSize[] {
  const min = WIDGETS.find((w) => w.id === id)?.minSize ?? 's';
  return SIZES.slice(SIZES.indexOf(min));
}

/** `size`, raised to the widget's minimum when it is below it. */
export function clampSize(id: string, size: WidgetSize): WidgetSize {
  const allowed = allowedSizes(id);
  return allowed.includes(size) ? size : allowed[0];
}

/**
 * A saved layout made safe to render: unknown ids dropped, duplicates
 * removed, bad sizes reset, and widgets the save has never seen inserted at
 * their default position relative to their default neighbours.
 */
export function resolveLayout(saved: unknown): Layout {
  if (!Array.isArray(saved)) return defaultLayout();
  const known = new Map(WIDGETS.map((w) => [w.id, w]));
  const seen = new Set<string>();
  const out: Layout = [];
  for (const raw of saved) {
    const id = (raw as LayoutItem | null)?.id;
    if (typeof id !== 'string' || !known.has(id) || seen.has(id)) continue;
    seen.add(id);
    const def = known.get(id)!;
    out.push({ id, size: isSize((raw as LayoutItem).size) ? clampSize(id, (raw as LayoutItem).size) : def.size, hidden: !!(raw as LayoutItem).hidden });
  }
  // New widgets: place each after the nearest earlier default widget that is
  // already in the layout, so it lands where the release meant it to.
  WIDGETS.forEach((w, i) => {
    if (seen.has(w.id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.findIndex((x) => x.id === WIDGETS[j].id);
      if (k >= 0) { at = k + 1; break; }
    }
    out.splice(at, 0, { id: w.id, size: w.size, hidden: !!w.hiddenByDefault });
    seen.add(w.id);
  });
  return out;
}

/** Moves `id` to the position currently held by `targetId` (before it, or after when `after`). */
export function moveWidget(layout: Layout, id: string, targetId: string, after = false): Layout {
  if (id === targetId) return layout;
  const from = layout.findIndex((x) => x.id === id);
  if (from < 0 || !layout.some((x) => x.id === targetId)) return layout;
  const next = layout.slice();
  const [item] = next.splice(from, 1);
  const to = next.findIndex((x) => x.id === targetId) + (after ? 1 : 0);
  next.splice(to, 0, item);
  return next;
}

/** One step earlier or later among the visible widgets — the keyboard path. */
export function nudgeWidget(layout: Layout, id: string, dir: -1 | 1): Layout {
  const visible = layout.filter((x) => !x.hidden);
  const i = visible.findIndex((x) => x.id === id);
  const target = visible[i + dir];
  if (i < 0 || !target) return layout;
  return moveWidget(layout, id, target.id, dir === 1);
}

export const setWidgetSize = (layout: Layout, id: string, size: WidgetSize): Layout =>
  layout.map((x) => (x.id === id ? { ...x, size: clampSize(id, size) } : x));

export const setWidgetHidden = (layout: Layout, id: string, hidden: boolean): Layout =>
  layout.map((x) => (x.id === id ? { ...x, hidden } : x));

export const widgetTitle = (id: string): string => WIDGETS.find((w) => w.id === id)?.title ?? id;

/** Columns a size takes on the 6-column tablet grid: S and M halve, L and XL fill. */
export const TABLET_COLS: Record<WidgetSize, number> = { s: 3, m: 3, l: 6, xl: 6 };

/**
 * Column spans after packing widgets into rows of `total`, in order.
 *
 * A widget that does not fit in what is left of a row starts the next one,
 * and the last widget of the row it leaves grows to fill the gap — so every
 * row is full and no card sits beside empty space, whatever the user picks.
 */
export function packSpans(items: { id: string; size: WidgetSize }[], cols: Record<WidgetSize, number>, total: number): Record<string, number> {
  const span: Record<string, number> = {};
  let row: string[] = [];
  let used = 0;
  const closeRow = () => {
    if (row.length && used < total) span[row[row.length - 1]] += total - used;
    row = [];
    used = 0;
  };
  for (const it of items) {
    const want = Math.min(cols[it.size], total);
    if (used + want > total) closeRow();
    span[it.id] = want;
    row.push(it.id);
    used += want;
  }
  closeRow();
  return span;
}
