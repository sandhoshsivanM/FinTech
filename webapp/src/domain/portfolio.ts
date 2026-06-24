// Portfolio analytics (PRD §6 / WealthCare FinClean). Pure Decimal math.
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type { AssetType, Holding } from '@/lib/types';

export const ASSET_META: Record<AssetType, { label: string; color: string }> = {
  equity_etf: { label: 'Equity / ETF', color: '#34406b' },
  debt_mf: { label: 'Debt MF', color: '#6d5bd0' },
  gold_etf: { label: 'Gold', color: '#b07d12' },
  real_estate: { label: 'Real Estate', color: '#1f8a5b' },
  crypto: { label: 'Crypto', color: '#c0492f' },
  fd: { label: 'Fixed Deposit', color: '#0e7490' },
  ppf_epf: { label: 'PPF / EPF', color: '#7c8a3a' },
  nps: { label: 'NPS', color: '#9a5b9a' },
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
