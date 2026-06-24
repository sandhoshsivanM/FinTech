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

export const TAX_RULES: Record<AssetType, Rule> = {
  equity_etf: { stcgRate: 20, ltcgRate: 12.5, ltcgThresholdMonths: 12, ltcgExemption: '125000' },
  debt_mf: { stcgRate: null, ltcgRate: null, ltcgThresholdMonths: 24, ltcgExemption: '0' },
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
