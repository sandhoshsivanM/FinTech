/**
 * Analytics — the structural questions the Dashboard deliberately does not
 * answer: how concentrated the book is, how returns are spread across
 * positions, and where value actually sits once you drill past the asset group.
 *
 * Pure functions, no React. The page was computing all of this inline, which
 * meant none of it could be tested and the scores could not be reused by the
 * Flutter client.
 *
 * The governing rule here is the one from the spec's annotation 1: these are
 * **scores, not verdicts**, and a missing input renders `null` — a dash — never
 * a zero that would read as a real, terrible score.
 */
import type Decimal from 'decimal.js';
import type { Holding } from '@/lib/types';
import type { HoldingView, RollupRow } from './portfolio';

/* -------------------------------------------------------------------------- */
/* Return distribution                                                        */
/* -------------------------------------------------------------------------- */

export interface ReturnBucket {
  /** Axis label. Kept short — this is read under a bar, not in a sentence. */
  label: string;
  /** Long form, for the screen-reader description and the hover title. */
  title: string;
  count: number;
  /** True for buckets below cost. They take the danger token. */
  negative: boolean;
}

/**
 * Buckets by unrealised return.
 *
 * A **count** histogram, not a value-weighted one, by decision: the question
 * this chart answers is "how many of my positions are working", and weighting
 * by value would hide nineteen struggling holdings behind one large winner.
 *
 * The edges are fixed rather than derived from the data. A histogram whose
 * buckets move as holdings are added is not comparable with itself week to
 * week, which is the only thing anyone uses it for.
 */
export function returnBuckets(views: HoldingView[]): ReturnBucket[] {
  // Axis labels carry no "%": seven buckets share a third-width card, and
  // "10–20%" at 11px does not fit the ~45px that leaves per column — it
  // truncated to "10–2…", which is worse than no unit at all. The unit is
  // stated once in the card's own sub-heading, and each bucket's `title` spells
  // it out in full for the tooltip and the screen reader.
  const spec: [string, string, (p: number) => boolean, boolean][] = [
    ['<−10', 'Down more than 10%', (p) => p < -10, true],
    ['−10–0', 'Down up to 10%', (p) => p >= -10 && p < 0, true],
    ['0–10', 'Up to 10%', (p) => p >= 0 && p < 10, false],
    ['10–20', 'Up 10 to 20%', (p) => p >= 10 && p < 20, false],
    ['20–30', 'Up 20 to 30%', (p) => p >= 20 && p < 30, false],
    ['30–40', 'Up 30 to 40%', (p) => p >= 30 && p < 40, false],
    ['>40', 'Up more than 40%', (p) => p >= 40, false],
  ];
  return spec.map(([label, title, test, negative]) => ({
    label,
    title,
    negative,
    count: views.filter((v) => test(v.pnlPct)).length,
  }));
}

/* -------------------------------------------------------------------------- */
/* Concentration, per position                                                */
/* -------------------------------------------------------------------------- */

/**
 * The weight above which a single position is called out.
 *
 * A constant, not a setting, and the copy says so: the app does not yet have a
 * per-user ceiling, and captioning this "the limit you set" when nobody set
 * anything would be a lie about the user's own configuration. Eight per cent is
 * roughly where a single name starts to drive the book's return rather than
 * ride it.
 */
export const POSITION_ALERT_WEIGHT = 0.08;

export interface PositionWeight {
  symbol: string;
  /** Fraction of the book's market value, 0–1. */
  weight: number;
  value: Decimal;
  /** At or above [POSITION_ALERT_WEIGHT]. */
  flagged: boolean;
}

/**
 * Every position's share of the book, heaviest first.
 *
 * Per NAME, not per asset group. The page previously reported concentration
 * only as "largest asset group is 100%", which is true of any all-equity book
 * and tells its owner nothing they can act on — the actionable fact is which
 * single holding is too large.
 */
export function positionWeights(views: HoldingView[]): PositionWeight[] {
  const total = views.reduce((s, v) => s + v.current.toNumber(), 0);
  if (total <= 0) return [];
  return views
    .map((v) => {
      const weight = v.current.toNumber() / total;
      return {
        symbol: v.holding.symbol,
        weight,
        value: v.current,
        flagged: weight >= POSITION_ALERT_WEIGHT,
      };
    })
    .sort((a, b) => b.weight - a.weight);
}

/* -------------------------------------------------------------------------- */
/* Risk & diversification stats                                               */
/* -------------------------------------------------------------------------- */

export interface RiskStats {
  holdings: number;
  sectorsRepresented: number;
  sectorUniverse: number;
  largest: { symbol: string; weight: number } | null;
  /** Combined weight of the five heaviest positions, 0–1. */
  top5Weight: number | null;
  /** Equity as a share of the book, 0–1. */
  equityWeight: number | null;
  /** Asset groups present other than equity — the diversifying sleeves. */
  nonEquitySleeves: number;
}

export function riskStats(
  holdings: Holding[],
  views: HoldingView[],
  groups: RollupRow[],
  sectors: RollupRow[],
  unclassifiedKey: string,
  sectorUniverse: number,
): RiskStats {
  const weights = positionWeights(views);
  const total = views.reduce((s, v) => s + v.current.toNumber(), 0);
  const equity = groups.find((g) => g.key === 'equity');
  return {
    holdings: holdings.length,
    sectorsRepresented: sectors.filter((s) => s.key !== unclassifiedKey).length,
    sectorUniverse,
    largest: weights.length ? { symbol: weights[0].symbol, weight: weights[0].weight } : null,
    top5Weight: weights.length
      ? weights.slice(0, 5).reduce((s, w) => s + w.weight, 0)
      : null,
    equityWeight: total > 0 && equity ? equity.current.toNumber() / total : total > 0 ? 0 : null,
    nonEquitySleeves: groups.filter((g) => g.key !== 'equity').length,
  };
}

/* -------------------------------------------------------------------------- */
/* Scores                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Diversification, 0–100. Null below two holdings — a single position cannot be
 * called diversified or concentrated, so it gets no score rather than a bad one.
 *
 * Blends breadth (how many of the seven asset groups are present, capped at
 * five) with the largest group's share.
 */
export function diversificationScore(
  holdingCount: number,
  groupCount: number,
  largestGroupShare: number | null,
): number | null {
  if (holdingCount < 2) return null;
  const share = largestGroupShare ?? 1;
  return Math.round(
    Math.max(0, Math.min(100, (Math.min(groupCount, 5) / 5) * 55 + (1 - share) * 45)),
  );
}

/** The word beside the diversification dial. 54 reads "Concentrated". */
export function diversificationBand(score: number): string {
  if (score >= 80) return 'Diversified';
  if (score >= 65) return 'Balanced';
  if (score >= 45) return 'Concentrated';
  return 'Very concentrated';
}

/**
 * Return quality, 0–100. Null until something has been invested — a book with
 * no cost basis has no return to judge.
 */
export function returnQualityScore(
  invested: Decimal,
  pnlPct: number,
): number | null {
  if (invested.lte(0)) return null;
  return Math.round(Math.max(0, Math.min(100, 50 + pnlPct * 1.6)));
}

/** Best and weakest position by unrealised return. Null on an empty book. */
export function extremes(views: HoldingView[]): {
  best: HoldingView | null;
  weakest: HoldingView | null;
} {
  if (views.length === 0) return { best: null, weakest: null };
  let best = views[0];
  let weakest = views[0];
  for (const v of views) {
    if (v.pnlPct > best.pnlPct) best = v;
    if (v.pnlPct < weakest.pnlPct) weakest = v;
  }
  return { best, weakest };
}
