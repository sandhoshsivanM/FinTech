// Capital-gains tax engine (PRD §6 / WealthCare). Config-driven; 'slab' rates
// are not guessed. Mirrors the Flutter TaxRuleEngine.
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type { AssetType } from '@/lib/types';

interface Rule {
  stcgRate: number | null; // null = 'slab'
  ltcgRate: number | null;
  ltcgThresholdMonths: number;
  ltcgExemption: string;
}

// Must stay in sync with assets/tax_rules.json on the Flutter side — the Dart
// test test/unit/asset_type_test.dart asserts every AssetType has a rule there,
// and TypeScript's Record<AssetType, Rule> enforces the same completeness here.
export const TAX_RULES: Record<AssetType, Rule> = {
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

export type GainType = 'short_term' | 'long_term';
export interface GainResult {
  gain: Decimal; gainType: GainType; rate: number | null; isSlab: boolean; estimatedTax: Decimal;
  rateLabel: string;
}

function monthsBetween(from: Date, to: Date): number {
  let m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) m -= 1;
  return Math.max(0, m);
}

export function computeGain(
  assetType: AssetType, firstPurchase: Date, saleDate: Date, buyValue: Decimal, saleValue: Decimal,
): GainResult {
  const rule = TAX_RULES[assetType];
  const months = monthsBetween(firstPurchase, saleDate);
  const isLong = months >= rule.ltcgThresholdMonths;
  const gainType: GainType = isLong ? 'long_term' : 'short_term';
  const gain = saleValue.minus(buyValue);
  const rate = isLong ? rule.ltcgRate : rule.stcgRate;
  let tax = ZERO;
  if (rate != null && gain.gt(0)) {
    const exemption = isLong ? D(rule.ltcgExemption) : ZERO;
    const taxable = gain.minus(exemption);
    if (taxable.gt(0)) tax = D((taxable.toNumber() * rate / 100).toFixed(2));
  }
  return {
    gain, gainType, rate, isSlab: rate == null, estimatedTax: tax,
    rateLabel: rate == null ? 'As per your tax slab' : rate === 0 ? 'Tax-free (exempt)' : `${rate.toFixed(1)}%`,
  };
}
