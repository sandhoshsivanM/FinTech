// Portfolio analytics (PRD §6 / WealthCare FinClean). Pure Decimal math.
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type { AssetType, Holding } from '@/lib/types';
import {
  MARKET_CAP_LABEL,
  type InstrumentClassification,
} from './instrumentMaster';

// Labels + chip colours per asset type. These colours are used for the small
// labelled chips in tables, where the text always accompanies the colour, so
// hue never carries meaning on its own.
//
// NOTE: do NOT feed these 11 colours straight into a chart. Eleven categorical
// hues cannot be kept colourblind-separable — see ASSET_GROUP below, which is
// what charts colour by.
export const ASSET_META: Record<AssetType, { label: string; color: string }> = {
  equity_etf: { label: 'Equity / ETF', color: '#34406b' },
  equity_mf: { label: 'Equity MF', color: '#4a5f9e' },
  debt_mf: { label: 'Debt MF', color: '#6d5bd0' },
  gold_etf: { label: 'Gold', color: '#b07d12' },
  bond: { label: 'Bonds', color: '#2f7f8f' },
  cash: { label: 'Cash', color: '#7a8577' },
  real_estate: { label: 'Real Estate', color: '#1f8a5b' },
  crypto: { label: 'Crypto', color: '#c0492f' },
  fd: { label: 'Fixed Deposit', color: '#0e7490' },
  ppf_epf: { label: 'PPF / EPF', color: '#7c8a3a' },
  nps: { label: 'NPS', color: '#9a5b9a' },
};

/** Chart-facing buckets. Eleven asset types collapse to seven groups. */
export type AssetGroup =
  | 'equity' | 'debt' | 'gold' | 'real_estate' | 'retirement' | 'crypto' | 'cash';

export const ASSET_GROUP_OF: Record<AssetType, AssetGroup> = {
  equity_etf: 'equity',
  equity_mf: 'equity',
  debt_mf: 'debt',
  bond: 'debt',
  gold_etf: 'gold',
  real_estate: 'real_estate',
  fd: 'retirement',
  ppf_epf: 'retirement',
  nps: 'retirement',
  crypto: 'crypto',
  cash: 'cash',
};

/**
 * Validated categorical palette for the seven chart groups.
 *
 * Hues and steps come from the data-viz reference palette. This exact ORDER is
 * the colourblind-safety mechanism, so charts must render groups in this order
 * and must NOT sort slices by value: on the fixed adjacent pairlist the set
 * passes every gate (worst adjacent CVD ΔE 9.1 protan, normal-vision ΔE 19.6),
 * but re-ordered freely (all-pairs) it fails hard — worst pair ΔE 3.2 protan.
 *
 * Three light-mode steps sit below 3:1 on the surface, so the relief rule
 * applies: always ship visible labels (the donut legend) alongside.
 */
export const ASSET_GROUP_ORDER: AssetGroup[] = [
  'equity', 'debt', 'gold', 'real_estate', 'retirement', 'crypto', 'cash',
];

export const ASSET_GROUP_META: Record<AssetGroup, { label: string; light: string; dark: string }> = {
  equity: { label: 'Equity', light: '#2a78d6', dark: '#3987e5' },
  debt: { label: 'Debt', light: '#eb6834', dark: '#d95926' },
  gold: { label: 'Gold', light: '#1baf7a', dark: '#199e70' },
  real_estate: { label: 'Real Estate', light: '#eda100', dark: '#c98500' },
  retirement: { label: 'Retirement', light: '#e87ba4', dark: '#d55181' },
  crypto: { label: 'Crypto', light: '#008300', dark: '#008300' },
  cash: { label: 'Cash', light: '#4a3aa7', dark: '#9085e9' },
};

export interface HoldingView {
  holding: Holding;
  invested: Decimal;
  current: Decimal;
  pnl: Decimal;
  pnlPct: number;
}

export function holdingView(h: Holding): HoldingView {
  const qty = D(h.quantity);
  const invested = qty.times(D(h.avgCost));
  const price = D(h.lastPrice ?? h.avgCost);
  const current = qty.times(price);
  const pnl = current.minus(invested);
  const pnlPct = invested.isZero() ? 0 : pnl.div(invested).times(100).toNumber();
  return { holding: h, invested, current, pnl, pnlPct };
}

export interface PortfolioSummary {
  invested: Decimal;
  current: Decimal;
  pnl: Decimal;
  pnlPct: number;
  views: HoldingView[];
  allocation: { type: AssetType; label: string; color: string; value: number }[];
}

export function portfolioSummary(holdings: Holding[]): PortfolioSummary {
  const views = holdings.map(holdingView);
  const invested = views.reduce((s, v) => s.plus(v.invested), ZERO);
  const current = views.reduce((s, v) => s.plus(v.current), ZERO);
  const pnl = current.minus(invested);
  const pnlPct = invested.isZero() ? 0 : pnl.div(invested).times(100).toNumber();
  const byType = new Map<AssetType, Decimal>();
  for (const v of views) {
    byType.set(v.holding.assetType, (byType.get(v.holding.assetType) ?? ZERO).plus(v.current));
  }
  const allocation = [...byType.entries()]
    .map(([type, value]) => ({ type, label: ASSET_META[type].label, color: ASSET_META[type].color, value: value.toNumber() }))
    .sort((a, b) => b.value - a.value);
  return { invested, current, pnl, pnlPct, views, allocation };
}

// ---- XIRR (Newton-Raphson) on dated cashflows. Outflows negative, inflows positive. ----
export interface CashFlow { when: number; amount: number } // when = epoch ms

function npv(rate: number, flows: CashFlow[], t0: number): number {
  return flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, (f.when - t0) / 31557600000), 0);
}

export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const t0 = Math.min(...flows.map((f) => f.when));
  const hasNeg = flows.some((f) => f.amount < 0);
  const hasPos = flows.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos) return null;
  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(rate, flows, t0);
    const d = (npv(rate + 1e-6, flows, t0) - f) / 1e-6;
    if (Math.abs(d) < 1e-12) break;
    const next = rate - f / d;
    if (!isFinite(next)) return null;
    if (Math.abs(next - rate) < 1e-8) return next * 100;
    rate = next;
  }
  return rate * 100;
}

// ---------------------------------------------------------------------------
// Roll-ups (sector-wise P&L)
// ---------------------------------------------------------------------------
//
// Mirrors `PortfolioAnalytics.rollup` in
// lib/domain/services/portfolio_analytics.dart. The load-bearing invariant, and
// what the paired tests assert on both sides: a roll-up along any dimension must
// sum exactly to the portfolio total.
//
// Note the model difference from Flutter, which is deliberate and not an
// oversight: the web app stores aggregated positions (one row per symbol with an
// average cost), so it computes UNREALISED P&L only. Lot-level cost basis,
// per-trade charges and realised P&L need the Drift v4 trade ledger, which is
// currently Flutter-only.

export type RollupDimension =
  | 'sector' | 'industry' | 'marketCap' | 'assetGroup' | 'assetType' | 'currency';

export const UNCLASSIFIED_KEY = '__unclassified__';
export const UNCLASSIFIED_LABEL = 'Unclassified';

export interface RollupRow {
  key: string;
  label: string;
  current: Decimal;
  invested: Decimal;
  pnl: Decimal;
  /** Null when cost is zero — an undefined percentage must not render as 0%. */
  pnlPct: number | null;
  holdingCount: number;
  /** Holdings with no price. Their P&L reads as zero, so the UI must disclose. */
  unpricedCount: number;
}

function bucketOf(
  h: Holding,
  dimension: RollupDimension,
  classify: (h: Holding) => InstrumentClassification | undefined,
): [string, string] {
  const cls = classify(h);
  switch (dimension) {
    case 'sector':
      return cls?.sector ? [cls.sector, cls.sector] : [UNCLASSIFIED_KEY, UNCLASSIFIED_LABEL];
    case 'industry':
      return cls?.industry ? [cls.industry, cls.industry] : [UNCLASSIFIED_KEY, UNCLASSIFIED_LABEL];
    case 'marketCap':
      return cls?.cap ? [cls.cap, MARKET_CAP_LABEL[cls.cap]] : [UNCLASSIFIED_KEY, UNCLASSIFIED_LABEL];
    case 'assetGroup': {
      const g = ASSET_GROUP_OF[h.assetType];
      return [g, ASSET_GROUP_META[g].label];
    }
    case 'assetType':
      return [h.assetType, ASSET_META[h.assetType].label];
    case 'currency':
      // The web Holding has no currency column; everything is vault currency.
      return ['INR', 'INR'];
  }
}

/**
 * Groups holdings along `dimension` and totals value, cost and P&L.
 *
 * Rows come back sorted by value descending — safe because a table is read as a
 * ranking, unlike a chart, whose colour adjacency must stay fixed (see
 * ASSET_GROUP_ORDER).
 */
export function rollup(
  holdings: Holding[],
  dimension: RollupDimension,
  classify: (h: Holding) => InstrumentClassification | undefined = () => undefined,
): RollupRow[] {
  const acc = new Map<string, {
    label: string; current: Decimal; invested: Decimal;
    count: number; unpriced: number;
  }>();

  for (const h of holdings) {
    const view = holdingView(h);
    const [key, label] = bucketOf(h, dimension, classify);
    const row = acc.get(key) ?? {
      label, current: ZERO, invested: ZERO, count: 0, unpriced: 0,
    };
    row.current = row.current.plus(view.current);
    row.invested = row.invested.plus(view.invested);
    row.count += 1;
    // No price recorded: holdingView falls back to avgCost, so this holding
    // contributes no P&L and the row's figure is understated.
    if (h.lastPrice == null || h.lastPrice === '') row.unpriced += 1;
    acc.set(key, row);
  }

  return [...acc.entries()]
    .map(([key, r]) => {
      const pnl = r.current.minus(r.invested);
      return {
        key,
        label: r.label,
        current: r.current,
        invested: r.invested,
        pnl,
        pnlPct: r.invested.isZero() ? null : pnl.div(r.invested).times(100).toNumber(),
        holdingCount: r.count,
        unpricedCount: r.unpriced,
      };
    })
    .sort((a, b) => b.current.comparedTo(a.current));
}

/**
 * Allocation by asset group in the FIXED chart order.
 *
 * Use this for the allocation chart. `rollup` sorts by value, which would make
 * colour adjacency data-dependent and break the palette's colourblind
 * guarantees — see ASSET_GROUP_ORDER.
 */
export function allocationByGroup(holdings: Holding[]): RollupRow[] {
  const rows = rollup(holdings, 'assetGroup');
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return ASSET_GROUP_ORDER
    .filter((g) => byKey.has(g))
    .map((g) => byKey.get(g)!);
}

/** Most steps a single hue family can carry before they stop separating. */
export const MAX_GROUP_SHADES = 5;

/** Surface colours the ramps lerp toward, matching the app's two canvases. */
const SURFACE = { light: '#ffffff', dark: '#17191f' } as const;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

/**
 * An ordinal ramp within one group's hue, for the sunburst's outer ring.
 * The twin of `groupShades` in lib/presentation/asset_group_colors.dart.
 *
 * Children share their parent's hue and differ only in lightness — a composite
 * encoding (family hue picks the asset class, lightness step picks the child),
 * which is the legitimate way past the seven-hue ceiling ASSET_GROUP_META hits.
 *
 * NOT implemented as opacity, despite that being the obvious reading of "the
 * parent hue at lower opacity": these charts sit over a gradient backdrop, so an
 * alpha-blended arc's effective colour depends on where it lands on screen and
 * its contrast cannot be verified. Mixing toward the surface gives the same look
 * with a colour that is actually knowable.
 *
 * The step index must come from a STABLE key — never value order. Colour keyed
 * on rank means a price movement repaints the chart.
 */
export function groupShades(g: AssetGroup, count: number, dark: boolean): string[] {
  const base = dark ? ASSET_GROUP_META[g].dark : ASSET_GROUP_META[g].light;
  const toward = dark ? SURFACE.dark : SURFACE.light;
  const n = Math.max(1, Math.min(count, MAX_GROUP_SHADES));
  return Array.from({ length: n }, (_, i) => (i === 0 ? base : mix(base, toward, 0.14 * i)));
}
