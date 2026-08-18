/**
 * The tax estimator (§8).
 *
 * The headline defect: the ₹1.25 L long-term exemption is one allowance per
 * financial year, and it was being applied per disposal — so ten equity
 * positions claimed ₹12.5 L of exemption between them.
 */
import { describe, expect, test } from 'vitest';
import { D } from '@/lib/money';
import { computeGain, estimatePortfolioTax, rulesFor, TAX_RULE_SETS } from './tax';
import type { AssetType } from '@/lib/types';

const SALE = new Date(2026, 7, 9);
const BOUGHT_LONG = new Date(2024, 7, 9);   // 24 months before
const BOUGHT_SHORT = new Date(2026, 4, 9);  // 3 months before

const pos = (id: string, assetType: AssetType, gain: number, bought = BOUGHT_LONG) => ({
  id, assetType, firstPurchase: bought,
  buyValue: D('100000'), saleValue: D(100000 + gain),
});

describe('holding period', () => {
  test('twelve whole months is long term for equity', () => {
    expect(computeGain('equity_etf', new Date(2025, 7, 9), SALE, D('100'), D('200')).gainType)
      .toBe('long_term');
  });

  test('a day short of twelve months is not', () => {
    expect(computeGain('equity_etf', new Date(2025, 7, 10), SALE, D('100'), D('200')).gainType)
      .toBe('short_term');
  });

  test('the time of day does not decide the holding period', () => {
    // A purchase stored at 18:00 against a sale evaluated at 09:00 differs by a
    // part-day that has nothing to do with how long it was held, and it used to
    // be able to tip a position across the threshold.
    const evening = new Date(2025, 7, 9, 18, 30);
    const morning = new Date(2026, 7, 9, 9, 0);
    expect(computeGain('equity_etf', evening, morning, D('100'), D('200')).gainType)
      .toBe('long_term');
  });
});

describe('the long-term exemption is annual, not per position', () => {
  test('one position pays nothing on a gain inside the allowance', () => {
    const e = estimatePortfolioTax([pos('a', 'equity_etf', 100_000)], SALE);
    expect(e.estimatedTax.toNumber()).toBe(0);
    expect(e.exemptionUsed.toNumber()).toBe(100_000);
  });

  test('two positions share one allowance rather than claiming it each', () => {
    // Two gains of ₹1,00,000 = ₹2,00,000 total. One ₹1,25,000 allowance leaves
    // ₹75,000 taxable at 12.5% = ₹9,375. Per-position exemption gave ₹0.
    const e = estimatePortfolioTax(
      [pos('a', 'equity_etf', 100_000), pos('b', 'equity_mf', 100_000)],
      SALE,
    );
    expect(e.exemptionUsed.toNumber()).toBe(125_000);
    expect(e.estimatedTax.toNumber()).toBe(9375);
  });

  test('ten positions still get one allowance between them', () => {
    const many = Array.from({ length: 10 }, (_, i) => pos(`p${i}`, 'equity_etf', 100_000));
    const e = estimatePortfolioTax(many, SALE);
    expect(e.exemptionUsed.toNumber()).toBe(125_000);
    // ₹10,00,000 gain − ₹1,25,000 = ₹8,75,000 at 12.5%.
    expect(e.estimatedTax.toNumber()).toBe(109_375);
  });

  test('the allowance is spent largest gain first, whatever the input order', () => {
    const forwards = estimatePortfolioTax(
      [pos('small', 'equity_etf', 20_000), pos('big', 'equity_etf', 400_000)], SALE);
    const backwards = estimatePortfolioTax(
      [pos('big', 'equity_etf', 400_000), pos('small', 'equity_etf', 20_000)], SALE);
    expect(forwards.estimatedTax.toNumber()).toBe(backwards.estimatedTax.toNumber());
    expect(forwards.rows.find((r) => r.id === 'big')!.exemptionUsed.toNumber()).toBe(125_000);
    expect(forwards.rows.find((r) => r.id === 'small')!.exemptionUsed.toNumber()).toBe(0);
  });

  test('a short-term gain never touches the long-term allowance', () => {
    const e = estimatePortfolioTax([pos('a', 'equity_etf', 100_000, BOUGHT_SHORT)], SALE);
    expect(e.exemptionUsed.toNumber()).toBe(0);
    expect(e.estimatedTax.toNumber()).toBe(20_000); // 20% STCG
  });

  test('an asset class with no allowance does not draw on equity\'s', () => {
    const e = estimatePortfolioTax(
      [pos('gold', 'gold_etf', 200_000), pos('eq', 'equity_etf', 100_000)], SALE,
    );
    // Gold is taxed on its whole gain; equity still has its own ₹1.25 L.
    expect(e.rows.find((r) => r.id === 'gold')!.exemptionUsed.toNumber()).toBe(0);
    expect(e.rows.find((r) => r.id === 'eq')!.exemptionUsed.toNumber()).toBe(100_000);
  });

  test('a loss consumes no allowance', () => {
    const e = estimatePortfolioTax([pos('a', 'equity_etf', -50_000)], SALE);
    expect(e.exemptionUsed.toNumber()).toBe(0);
    expect(e.estimatedTax.toNumber()).toBe(0);
  });
});

describe('foreign equity is not Indian equity (QQQ and friends)', () => {
  // A US-listed ETF pays no STT, so section 112A's concessions do not apply to
  // it. Filed as `equity_etf` it would claim a 12-month long-term threshold and
  // a share of the ₹1.25 L exemption, and come out materially under-taxed.
  const BOUGHT_13M = new Date(2025, 6, 9);  // 13 months before SALE
  const BOUGHT_25M = new Date(2024, 6, 9);  // 25 months before SALE

  test('13 months is still SHORT term — the trap that made this a separate type', () => {
    // The same holding period on an Indian ETF would be long term.
    expect(computeGain('equity_etf', BOUGHT_13M, SALE, D('100000'), D('200000')).gainType)
      .toBe('long_term');
    expect(computeGain('foreign_equity', BOUGHT_13M, SALE, D('100000'), D('200000')).gainType)
      .toBe('short_term');
  });

  test('24 months qualifies it as long term at 12.5%', () => {
    const r = computeGain('foreign_equity', BOUGHT_25M, SALE, D('100000'), D('200000'));
    expect(r.gainType).toBe('long_term');
    expect(r.rate).toBe(12.5);
  });

  test('a short-term foreign gain is taxed at slab, not at 20%', () => {
    const r = computeGain('foreign_equity', BOUGHT_13M, SALE, D('100000'), D('200000'));
    expect(r.isSlab).toBe(true);
    expect(r.rateLabel).toBe('As per your tax slab');
  });

  test('it draws NOTHING from the ₹1.25 L equity allowance', () => {
    // The load-bearing assertion. Both positions are long term with a gain; the
    // exemption belongs to the Indian one alone.
    const e = estimatePortfolioTax([
      { id: 'qqq', assetType: 'foreign_equity', firstPurchase: BOUGHT_25M, buyValue: D('100000'), saleValue: D('400000') },
      { id: 'nifty', assetType: 'equity_etf', firstPurchase: BOUGHT_25M, buyValue: D('100000'), saleValue: D('300000') },
    ], SALE);
    expect(e.rows.find((r) => r.id === 'qqq')!.exemptionUsed.toString()).toBe('0');
    expect(e.rows.find((r) => r.id === 'nifty')!.exemptionUsed.toString()).toBe('125000');
    expect(e.exemptionUsed.toString()).toBe('125000');
  });

  test('long-term foreign gain is taxed on the whole gain', () => {
    const e = estimatePortfolioTax(
      [pos('qqq', 'foreign_equity', 300_000, BOUGHT_25M)], SALE,
    );
    // 300,000 at 12.5%, no exemption.
    expect(e.estimatedTax.toString()).toBe('37500');
  });

  test('a short-term foreign gain is separated out, not counted as zero tax', () => {
    const e = estimatePortfolioTax(
      [pos('qqq', 'foreign_equity', 200_000, BOUGHT_13M)], SALE,
    );
    expect(e.estimatedTax.toString()).toBe('0');
    expect(e.slabGain.toString()).toBe('200000');
    expect(e.slabCount).toBe(1);
  });

  test('a pre-July-2024 disposal uses the older 20% rate', () => {
    const r = computeGain('foreign_equity', new Date(2021, 0, 1), new Date(2023, 5, 1), D('0'), D('100000'));
    expect(r.rate).toBe(20);
    expect(r.ruleSet).toContain('before');
  });
});

describe('slab-rate assets are reported, not silently zero', () => {
  test('their gain is separated out rather than counted as no tax', () => {
    // Debt funds, bonds, FDs and NPS contributed ₹0 to the headline with
    // nothing on screen saying why.
    const e = estimatePortfolioTax(
      [pos('debt', 'debt_mf', 80_000), pos('fd', 'fd', 20_000)], SALE,
    );
    expect(e.slabCount).toBe(2);
    expect(e.slabGain.toNumber()).toBe(100_000);
    expect(e.estimatedTax.toNumber()).toBe(0);
  });

  test('a slab asset at a loss is not counted as an unestimated gain', () => {
    const e = estimatePortfolioTax([pos('debt', 'debt_mf', -10_000)], SALE);
    expect(e.slabCount).toBe(0);
    expect(e.slabGain.toNumber()).toBe(0);
  });

  test('slab assets report the label rather than a made-up rate', () => {
    expect(computeGain('debt_mf', BOUGHT_LONG, SALE, D('100'), D('200')).rateLabel)
      .toBe('As per your tax slab');
  });
});

describe('rules are versioned by the date of the disposal', () => {
  test('a sale after 23 Jul 2024 uses the 12.5% equity rate', () => {
    const r = computeGain('equity_etf', BOUGHT_LONG, SALE, D('0'), D('1000000'));
    expect(r.rate).toBe(12.5);
    expect(r.ruleSet).toContain('FY25');
  });

  test('a sale before it uses the rate that was in force then', () => {
    // Taxing a 2023 disposal under 2024 rules is wrong in both directions and
    // there was no way to express the difference at all.
    const old = new Date(2023, 5, 1);
    const r = computeGain('equity_etf', new Date(2021, 5, 1), old, D('0'), D('1000000'));
    expect(r.rate).toBe(10);
    expect(r.ruleSet).toContain('before');
  });

  test('every estimate can name the rule set that priced it', () => {
    const e = estimatePortfolioTax([pos('a', 'equity_etf', 500_000)], SALE);
    expect(e.ruleSet).toBeTruthy();
    expect(e.ruleSchemaVersion).toBeGreaterThan(0);
  });

  test('rule sets are ordered newest first so lookup takes the first match', () => {
    for (let i = 1; i < TAX_RULE_SETS.length; i++) {
      expect(TAX_RULE_SETS[i - 1].effectiveFrom).toBeGreaterThan(TAX_RULE_SETS[i].effectiveFrom);
    }
    expect(rulesFor(new Date(0)).effectiveFrom).toBe(0);
  });
});

describe('exempt and non-appreciating assets', () => {
  test('PPF reports tax-free rather than a rate', () => {
    expect(computeGain('ppf_epf', BOUGHT_LONG, SALE, D('100000'), D('180000')).estimatedTax.toNumber())
      .toBe(0);
    expect(computeGain('ppf_epf', BOUGHT_LONG, SALE, D('100000'), D('180000')).rateLabel)
      .toBe('Tax-free (exempt)');
  });

  test('crypto is flat 30% with no long-term concession', () => {
    const r = computeGain('crypto', BOUGHT_LONG, SALE, D('100000'), D('200000'));
    expect(r.rate).toBe(30);
    expect(r.estimatedTax.toNumber()).toBe(30_000);
  });
});
