// The narrative engine — the app's generated sentences, and the rule that keeps
// them descriptive.
//
// The twin of `lib/domain/services/narrative_engine.dart`. Both sides share the
// banned-phrase list below and both are tested against it.
//
// This exists because the Overview page previously shipped sentences like
// "Prioritising high-APR debt first saves the most interest" and "Consider
// diversifying into long-term assets" — written in good faith, and both
// regulated advice. The line is between description and direction: "HDFC Flexi
// Cap is 31% of your equity" states a fact about the user's own portfolio;
// "consider diversifying" tells them what to do with it.
import Decimal from 'decimal.js';
import type { NetWorthSnapshot } from '@/lib/types';
import type { HealthScore } from './health';
import type { Anomaly, SafeToSpend } from './insights';
import type { InvestmentTotals } from './investmentTotals';
import { isEmptyPortfolio } from './investmentTotals';

export type NarrativeKind =
  | 'networth' | 'savings' | 'spending' | 'investing' | 'protection' | 'goal' | 'pricing';

/** No 'advice' value, deliberately: this app describes, it does not recommend. */
export type NarrativeTone = 'positive' | 'neutral' | 'caution';

export interface Narrative {
  /** Stable across rebuilds, so a dismissal sticks to a sentence not a slot. */
  id: string;
  kind: NarrativeKind;
  tone: NarrativeTone;
  /** Higher wins. The Overview shows exactly one. */
  priority: number;
  text: string;
  /** Which page explains this further. */
  routeKey?: string;
}

export interface NarrativeContext {
  health: HealthScore;
  investments: InvestmentTotals;
  safeToSpend?: SafeToSpend | null;
  anomalies?: Anomaly[];
  snapshots?: NetWorthSnapshot[];
  categoryNames?: Record<string, string>;
  /** How money renders inside a sentence; injected to keep locale out of here. */
  formatMoney: (v: Decimal) => string;
  now?: number;
}

/** Rendered under any narrative block. */
export const NARRATIVE_DISCLAIMER = 'Informational only — not investment advice.';

/**
 * Phrases that must never appear in generated text.
 *
 * This list, and the test that greps every rule's output against it, is the
 * actual compliance mechanism. A style guide is a hope. Kept identical to
 * `kBannedPhrases` in narrative_engine.dart.
 */
export const BANNED_PHRASES: string[] = [
  'buy ',
  'sell ',
  'invest in',
  'recommend',
  'you should',
  'guaranteed',
  'will return',
  'best fund',
  'top pick',
  'consider ',
  'aim for',
  'prioritis',
  'prioritiz',
];

/** A rule returns null when it has nothing to say — never filler. */
type Rule = (ctx: NarrativeContext) => Narrative | null;

const DAY = 86_400_000;

/** "Your net worth is up ₹42,000 over the past month." */
const netWorthChange: Rule = (ctx) => {
  const snaps = ctx.snapshots ?? [];
  if (snaps.length < 2) return null;
  const sorted = [...snaps].sort((a, b) => a.date - b.date);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days = Math.round((last.date - first.date) / DAY);
  // Under a month, the "change" is mostly noise from one salary landing.
  if (days < 28) return null;

  const delta = new Decimal(last.netWorth).minus(new Decimal(first.netWorth));
  if (delta.isZero()) return null;
  const up = delta.gt(0);
  const months = Math.min(99, Math.max(1, Math.round(days / 30)));
  const window = months === 1 ? 'the past month' : `the past ${months} months`;

  return {
    id: 'networth_change',
    kind: 'networth',
    tone: up ? 'positive' : 'caution',
    priority: 90,
    text: up
      ? `Your net worth is up ${ctx.formatMoney(delta)} over ${window}.`
      : `Your net worth is down ${ctx.formatMoney(delta.neg())} over ${window}.`,
    routeKey: 'score.wealth',
  };
};

/** "You saved 34% of your income over the last 90 days." */
const savingsRate: Rule = (ctx) => {
  const efficiency = ctx.health.categories.find((c) => c.key === 'efficiency');
  const metric = efficiency?.metrics.find((m) => m.key === 'efficiency.savings_rate');
  if (!metric || metric.value === null) return null;
  // The metric is achievement against a 30% target; recover the rate itself.
  const rate = metric.value * 0.3;
  return {
    id: 'savings_rate',
    kind: 'savings',
    tone: rate >= 0.2 ? 'positive' : 'neutral',
    priority: rate >= 0.2 ? 70 : 75,
    text: `You saved ${Math.round(rate * 100)}% of your income over the last 90 days.`,
    routeKey: 'score.efficiency',
  };
};

/** "Food is running 2.1× its usual — ₹9,400 against ₹4,500 on average." */
const categorySpike: Rule = (ctx) => {
  const anomalies = ctx.anomalies ?? [];
  if (anomalies.length === 0) return null;
  const worst = anomalies.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const name = ctx.categoryNames?.[worst.categoryId];
  // A sentence naming a category id would be gibberish.
  if (!name) return null;

  return {
    id: 'category_spike',
    kind: 'spending',
    tone: 'caution',
    priority: 85,
    text: `${name} is running ${worst.ratio.toFixed(1)}× its usual — ${ctx.formatMoney(worst.current)} against ${ctx.formatMoney(worst.avg)} on average.`,
    routeKey: 'score.efficiency',
  };
};

/** "₹18,200 left this month — about ₹1,400 a day for the next 13 days." */
const safeToSpendRule: Rule = (ctx) => {
  const s = ctx.safeToSpend;
  if (!s || s.remaining.lte(0) || s.daysLeft <= 0) return null;
  return {
    id: 'safe_to_spend',
    kind: 'savings',
    tone: 'neutral',
    priority: 60,
    text: `${ctx.formatMoney(s.remaining)} left this month — about ${ctx.formatMoney(s.perDay)} a day for the next ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'}.`,
    routeKey: 'score.efficiency',
  };
};

const CATEGORY_NEEDS: Record<string, string> = {
  wealth: 'a holding or some transaction history',
  protection: 'an insurance policy or an emergency-fund goal',
  efficiency: 'some income and spending history',
  future: 'a goal or a holding',
};

/**
 * "Protection is not scored yet — it needs an insurance policy or an
 * emergency-fund goal."
 *
 * The honesty rule as a sentence. Phrased as what the app is missing rather
 * than what the user ought to do about it.
 */
const untrackedCategory: Rule = (ctx) => {
  const untracked = ctx.health.categories.filter((c) => !c.tracked);
  if (untracked.length === 0) return null;
  const c = untracked[0];
  const needs = CATEGORY_NEEDS[c.key];
  if (!needs) return null;
  return {
    id: 'untracked_category',
    kind: 'protection',
    tone: 'neutral',
    priority: 80,
    text: `${c.label} is not scored yet — it needs ${needs}.`,
    routeKey: `score.${c.key}`,
  };
};

/** "About 40% of your portfolio value comes from prices entered by hand." */
const stalePricing: Rule = (ctx) => {
  const t = ctx.investments;
  if (isEmptyPortfolio(t) || t.marketValue.lte(0)) return null;
  const share = t.indicativeValue.div(t.marketValue).toNumber();
  // Below a fifth it is a footnote, not a headline.
  if (share < 0.2) return null;
  return {
    id: 'stale_pricing',
    kind: 'pricing',
    tone: 'neutral',
    priority: 50,
    text: `About ${Math.round(share * 100)}% of your portfolio value comes from prices entered by hand rather than live quotes.`,
    routeKey: 'investments',
  };
};

export const DEFAULT_RULES: Rule[] = [
  netWorthChange,
  savingsRate,
  categorySpike,
  safeToSpendRule,
  untrackedCategory,
  stalePricing,
];

/** Every sentence that fires, highest priority first. */
export function generateNarratives(
  ctx: NarrativeContext,
  rules: Rule[] = DEFAULT_RULES,
): Narrative[] {
  return rules
    .map((r) => r(ctx))
    .filter((n): n is Narrative => n !== null)
    .sort((a, b) => b.priority - a.priority);
}

/**
 * The single sentence for the Overview. Null when nothing fires — an absent
 * card beats a generic one, because filler teaches people the box never says
 * anything worth reading.
 */
export function headlineNarrative(
  ctx: NarrativeContext,
  rules: Rule[] = DEFAULT_RULES,
): Narrative | null {
  return generateNarratives(ctx, rules)[0] ?? null;
}

/** The Score page's paragraph: up to three sentences, joined. */
export function weeklyReport(
  ctx: NarrativeContext,
  rules: Rule[] = DEFAULT_RULES,
): string {
  const all = generateNarratives(ctx, rules).slice(0, 3);
  return all.length === 0
    ? 'There is not enough history yet to summarise your week.'
    : all.map((n) => n.text).join(' ');
}
