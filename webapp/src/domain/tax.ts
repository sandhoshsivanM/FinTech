/**
 * Capital-gains estimator (PRD §6 / Hardening Plan §8).
 *
 * Two rules govern everything here. Slab rates are never guessed — an asset
 * taxed at the user's marginal rate reports `null` and says so, rather than
 * inventing a percentage. And the output is an *estimate*: it is labelled that
 * way at every call site, and it models a sale that has not happened.
 *
 * Rates live in a versioned rule set selected by the date of the disposal, so
 * a sale made before a rate change is not taxed under rules that did not exist
 * yet, and every estimate can name the rule-set version behind it.
 */
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type { AssetType } from '@/lib/types';

export interface Rule {
  stcgRate: number | null; // null = 'slab'
  ltcgRate: number | null;
  ltcgThresholdMonths: number;
  /**
   * The long-term exemption this asset draws on, per financial year.
   *
   * Shared across every position that names the same amount: the ₹1.25 L
   * equity allowance is one allowance for the year, not one per holding. See
   * `estimatePortfolioTax`.
   */
  ltcgExemption: string;
}

export interface TaxRuleSet {
  /** Bumped when the shape changes, so a stored estimate can be re-read. */
  schemaVersion: number;
  /** Rules apply to disposals on or after this date. */
  effectiveFrom: number;
  label: string;
  rules: Record<AssetType, Rule>;
}

// Must stay in sync with assets/tax_rules.json on the Flutter side — the Dart
// test test/unit/asset_type_test.dart asserts every AssetType has a rule there,
// and TypeScript's Record<AssetType, Rule> enforces the same completeness here.
const FY25_RULES: Record<AssetType, Rule> = {
  equity_etf: { stcgRate: 20, ltcgRate: 12.5, ltcgThresholdMonths: 12, ltcgExemption: '125000' },
  // Equity-oriented mutual funds are taxed as equity, not as debt.
  equity_mf: { stcgRate: 20, ltcgRate: 12.5, ltcgThresholdMonths: 12, ltcgExemption: '125000' },
  debt_mf: { stcgRate: null, ltcgRate: null, ltcgThresholdMonths: 24, ltcgExemption: '0' },
  // Bonds: modelled as slab, which is the conservative case. Listed bonds and
  // debentures can qualify for 12.5% LTCG after 12 months — revisit per-instrument.
  bond: { stcgRate: null, ltcgRate: null, ltcgThresholdMonths: 24, ltcgExemption: '0' },
  // Cash does not appreciate, so it produces no capital gain. Interest on it is
  // slab-taxed income and belongs in transactions, not here.
  cash: { stcgRate: 0, ltcgRate: 0, ltcgThresholdMonths: 0, ltcgExemption: '0' },
  gold_etf: { stcgRate: null, ltcgRate: 12.5, ltcgThresholdMonths: 24, ltcgExemption: '0' },
  real_estate: { stcgRate: null, ltcgRate: 12.5, ltcgThresholdMonths: 24, ltcgExemption: '0' },
  // VDAs (crypto): flat 30%, no LTCG concession, no loss set-off.
  crypto: { stcgRate: 30, ltcgRate: 30, ltcgThresholdMonths: 0, ltcgExemption: '0' },
  // FD interest is taxed at slab; modelled as 'slab' gains.
  fd: { stcgRate: null, ltcgRate: null, ltcgThresholdMonths: 0, ltcgExemption: '0' },
  // PPF/EPF maturity is exempt (EEE).
  ppf_epf: { stcgRate: 0, ltcgRate: 0, ltcgThresholdMonths: 0, ltcgExemption: '0' },
  // NPS withdrawal: taxable portion at slab (simplified).
  nps: { stcgRate: null, ltcgRate: null, ltcgThresholdMonths: 0, ltcgExemption: '0' },
  // Sukanya Samriddhi is EEE, like PPF.
  ssy: { stcgRate: 0, ltcgRate: 0, ltcgThresholdMonths: 0, ltcgExemption: '0' },
  // Sovereign Gold Bonds held to maturity are capital-gains exempt, but this
  // engine models a SALE: a pre-maturity sale on the exchange is a listed
  // security at 12.5% after 12 months. The redemption exemption is a maturity
  // event, not a disposal, so it is deliberately not encoded as a rate.
  sgb: { stcgRate: null, ltcgRate: 12.5, ltcgThresholdMonths: 12, ltcgExemption: '0' },
  // ULIPs issued after 1 Feb 2021 with aggregate annual premium above Rs 2.5L
  // are taxed as equity-oriented funds. Below it, proceeds are exempt under
  // 10(10D) — but that threshold depends on the user's whole policy portfolio,
  // which this engine cannot see, so it models the taxable case. Understating
  // tax is the worse of the two errors.
  ulip: { stcgRate: 20, ltcgRate: 12.5, ltcgThresholdMonths: 12, ltcgExemption: '125000' },
};

/**
 * Rate changes of 23 July 2024 (Finance (No. 2) Act 2024): equity LTCG to
 * 12.5%, STCG to 20%, exemption raised to ₹1.25 L.
 */
const PRE_FY25_RULES: Record<AssetType, Rule> = {
  ...FY25_RULES,
  equity_etf: { stcgRate: 15, ltcgRate: 10, ltcgThresholdMonths: 12, ltcgExemption: '100000' },
  equity_mf: { stcgRate: 15, ltcgRate: 10, ltcgThresholdMonths: 12, ltcgExemption: '100000' },
  ulip: { stcgRate: 15, ltcgRate: 10, ltcgThresholdMonths: 12, ltcgExemption: '100000' },
  gold_etf: { stcgRate: null, ltcgRate: 20, ltcgThresholdMonths: 36, ltcgExemption: '0' },
  real_estate: { stcgRate: null, ltcgRate: 20, ltcgThresholdMonths: 24, ltcgExemption: '0' },
  sgb: { stcgRate: null, ltcgRate: 10, ltcgThresholdMonths: 12, ltcgExemption: '0' },
};

/** Newest first. `rulesFor` walks this and takes the first that has taken effect. */
export const TAX_RULE_SETS: TaxRuleSet[] = [
  {
    schemaVersion: 4,
    effectiveFrom: Date.UTC(2024, 6, 23),
    label: 'India FY25 (from 23 Jul 2024)',
    rules: FY25_RULES,
  },
  {
    schemaVersion: 4,
    effectiveFrom: 0,
    label: 'India, before 23 Jul 2024',
    rules: PRE_FY25_RULES,
  },
];

/** The rule set in force on the date of a disposal. */
export function rulesFor(saleDate: Date): TaxRuleSet {
  const t = saleDate.getTime();
  return TAX_RULE_SETS.find((s) => t >= s.effectiveFrom) ?? TAX_RULE_SETS[TAX_RULE_SETS.length - 1];
}

/** The current rules, for UI that names them without pricing a disposal. */
export const CURRENT_RULES = TAX_RULE_SETS[0];

/** Kept for callers that only need today's table. */
export const TAX_RULES = FY25_RULES;

export type GainType = 'short_term' | 'long_term';

export interface GainResult {
  gain: Decimal;
  gainType: GainType;
  rate: number | null;
  isSlab: boolean;
  estimatedTax: Decimal;
  rateLabel: string;
  /** Exemption actually consumed by this disposal. Zero for short-term. */
  exemptionUsed: Decimal;
  /** Which rule set priced it, so an estimate can show its provenance (§8). */
  ruleSet: string;
  ruleSchemaVersion: number;
}

/**
 * Whole months held.
 *
 * Both ends are reduced to a calendar day first: a purchase stored at 18:00 and
 * a sale evaluated at 09:00 differ by a part-day that has nothing to do with
 * the holding period, and it could tip a position either side of the 12- or
 * 24-month line.
 */
function monthsBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  return Math.max(0, m);
}

/**
 * Tax on one disposal.
 *
 * @param exemptionAvailable how much of the year's long-term exemption is
 *   still unused. Defaults to the rule's full allowance, which is correct for a
 *   single disposal and wrong for a portfolio — use `estimatePortfolioTax`
 *   there, or every position claims the whole allowance.
 */
export function computeGain(
  assetType: AssetType,
  firstPurchase: Date,
  saleDate: Date,
  buyValue: Decimal,
  saleValue: Decimal,
  exemptionAvailable?: Decimal,
): GainResult {
  const set = rulesFor(saleDate);
  const rule = set.rules[assetType];
  const months = monthsBetween(firstPurchase, saleDate);
  const isLong = months >= rule.ltcgThresholdMonths;
  const gainType: GainType = isLong ? 'long_term' : 'short_term';
  const gain = saleValue.minus(buyValue);
  const rate = isLong ? rule.ltcgRate : rule.stcgRate;

  let tax = ZERO;
  let exemptionUsed = ZERO;
  if (rate != null && gain.gt(0)) {
    const pool = exemptionAvailable ?? D(rule.ltcgExemption);
    const available = isLong ? Decimal.min(pool, D(rule.ltcgExemption)) : ZERO;
    exemptionUsed = Decimal.min(available, gain);
    const taxable = gain.minus(exemptionUsed);
    // Kept in Decimal to the last step; the rate is a percentage, not money.
    if (taxable.gt(0)) tax = taxable.times(D(rate)).div(100).toDecimalPlaces(2);
  }

  return {
    gain,
    gainType,
    rate,
    isSlab: rate == null,
    estimatedTax: tax,
    exemptionUsed,
    ruleSet: set.label,
    ruleSchemaVersion: set.schemaVersion,
    rateLabel: rate == null ? 'As per your tax slab' : rate === 0 ? 'Tax-free (exempt)' : `${rate.toFixed(1)}%`,
  };
}

export interface Position {
  id: string;
  assetType: AssetType;
  firstPurchase: Date;
  buyValue: Decimal;
  saleValue: Decimal;
}

export interface PortfolioTaxEstimate {
  rows: (GainResult & { id: string })[];
  /** Tax on everything the engine can price. Excludes slab-rate assets. */
  estimatedTax: Decimal;
  /** Long-term exemption consumed across the whole year. */
  exemptionUsed: Decimal;
  /**
   * Gains on assets taxed at the user's marginal rate.
   *
   * Reported separately rather than folded into the total as zero: a slab asset
   * with a real gain contributed nothing to the headline figure and nothing
   * said so, which understates the bill by however much the user holds in debt
   * funds, bonds, FDs and NPS.
   */
  slabGain: Decimal;
  slabCount: number;
  ruleSet: string;
  ruleSchemaVersion: number;
}

/**
 * Tax across a set of disposals that share a financial year.
 *
 * The reason this exists: the ₹1.25 L long-term exemption is one allowance per
 * year, and pricing each position with `computeGain` gave every one of them the
 * full amount. Ten equity positions therefore claimed ₹12.5 L of exemption
 * between them and the estimate came out far below what would actually be due.
 *
 * The allowance is spent largest-gain-first, which is how anyone filing would
 * apply it and is deterministic regardless of the order positions arrive in.
 */
export function estimatePortfolioTax(positions: Position[], saleDate: Date): PortfolioTaxEstimate {
  const set = rulesFor(saleDate);

  const priced = positions
    .map((p) => ({ p, preview: computeGain(p.assetType, p.firstPurchase, saleDate, p.buyValue, p.saleValue, ZERO) }))
    .sort((a, b) => b.preview.gain.cmp(a.preview.gain));

  // One pool per exemption amount: equity's ₹1.25 L is not shared with an
  // asset class that happens to name a different allowance.
  const pools = new Map<string, Decimal>();
  const poolFor = (t: AssetType) => {
    const amount = set.rules[t].ltcgExemption;
    if (!pools.has(amount)) pools.set(amount, D(amount));
    return amount;
  };

  const rows: (GainResult & { id: string })[] = [];
  let estimatedTax = ZERO;
  let exemptionUsed = ZERO;
  let slabGain = ZERO;
  let slabCount = 0;

  for (const { p } of priced) {
    const poolKey = poolFor(p.assetType);
    const available = pools.get(poolKey)!;
    const r = computeGain(p.assetType, p.firstPurchase, saleDate, p.buyValue, p.saleValue, available);
    pools.set(poolKey, available.minus(r.exemptionUsed));

    rows.push({ ...r, id: p.id });
    estimatedTax = estimatedTax.plus(r.estimatedTax);
    exemptionUsed = exemptionUsed.plus(r.exemptionUsed);
    if (r.isSlab && r.gain.gt(0)) {
      slabGain = slabGain.plus(r.gain);
      slabCount += 1;
    }
  }

  return {
    rows,
    estimatedTax,
    exemptionUsed,
    slabGain,
    slabCount,
    ruleSet: set.label,
    ruleSchemaVersion: set.schemaVersion,
  };
}
