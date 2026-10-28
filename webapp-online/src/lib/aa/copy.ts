// Words and choices for the link screen, kept out of the page so tests can use them.
import { Building2, Landmark, PiggyBank, Shield, TrendingUp, Wallet } from 'lucide-react';
import { describe } from '@/components/ui';
import type { ImportReport } from './link';

/** What the user picks, and the AA FI types each choice asks for. */
export const DATA_GROUPS = [
  { key: 'bank', label: 'Bank accounts', hint: 'Savings and current accounts, with transactions', icon: Landmark, types: ['DEPOSIT'] },
  { key: 'deposits', label: 'Fixed & recurring deposits', hint: 'FDs and RDs at your banks', icon: PiggyBank, types: ['TERM_DEPOSIT', 'RECURRING_DEPOSIT'] },
  { key: 'funds', label: 'Mutual funds', hint: 'Folios from CAMS and KFintech', icon: TrendingUp, types: ['MUTUAL_FUNDS'] },
  { key: 'stocks', label: 'Stocks & demat', hint: 'Shares and ETFs in your demat accounts', icon: Building2, types: ['EQUITIES', 'ETF'] },
  { key: 'retirement', label: 'NPS & EPF/PPF', hint: 'Pension and provident fund balances', icon: Wallet, types: ['NPS', 'EPF', 'PPF'] },
  { key: 'insurance', label: 'Insurance', hint: 'Life, term and health policies', icon: Shield, types: ['INSURANCE_POLICIES'] },
] as const;

export const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: 'Bank accounts', TERM_DEPOSIT: 'FDs', RECURRING_DEPOSIT: 'RDs', MUTUAL_FUNDS: 'Mutual funds', EQUITIES: 'Stocks',
  ETF: 'ETFs', NPS: 'NPS', EPF: 'EPF', PPF: 'PPF', INSURANCE_POLICIES: 'Insurance',
};

/** The words a person needs, not a status code. */
export function linkError(e: unknown): string {
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
  switch (code) {
    case 'too_many': return 'You have the most links open that one account can have. Revoke one you no longer use first.';
    case 'consent_inactive': return 'This link is not active, so nothing can be fetched. Approve it at your Account Aggregator, or link again.';
    case 'provider_unavailable': return 'The Account Aggregator could not be reached. Nothing was changed; try again in a few minutes.';
    case 'invalid_request': return 'That request was refused. Check the mobile number and what you chose to link.';
    case 'not_found': return 'That link no longer exists.';
    default: return describe(e);
  }
}

export function importSummary(r: ImportReport): string {
  if (r.payloads === 0) return r.failed ? '' : 'Nothing new to import.';
  const parts = [
    r.accounts && `${r.accounts} account${r.accounts === 1 ? '' : 's'}`,
    r.txns && `${r.txns} transaction${r.txns === 1 ? '' : 's'}`,
    r.holdings && `${r.holdings} holding${r.holdings === 1 ? '' : 's'}`,
    r.policies && `${r.policies} polic${r.policies === 1 ? 'y' : 'ies'}`,
  ].filter(Boolean);
  const dup = r.skippedDuplicates ? ` ${r.skippedDuplicates} already captured from SMS were skipped.` : '';
  return `Imported ${parts.length ? parts.join(', ') : 'your latest data'}.${dup}`;
}

