// Domain entity shapes. Money fields are Decimal strings (serialized); convert
// with D() at use. Mirrors the Flutter app's entities.

export type TxnType = 'expense' | 'income';

// ---- Profiles (data-isolated: self / spouse / business) ----
export type ProfileKind = 'self' | 'spouse' | 'business';
export interface Profile {
  id: string;
  vaultId: string;
  name: string;
  kind: ProfileKind;
  createdAt: number;
}

export interface Txn {
  id: string;
  vaultId: string;
  profileId?: string;
  amount: string;
  type: TxnType;
  categoryId: string;
  merchant?: string | null;
  note?: string | null;
  date: number; // epoch ms
  createdAt: number;
  // Double-entry header (PRD §16): the money account the spend/income moves, and
  // an optional receipt attachment. Postings remain the authoritative ledger.
  accountId?: string | null;
  attachmentRef?: string | null; // record id on web, sandbox path on mobile
}

export interface Category {
  id: string;
  vaultId: string;
  name: string;
  icon?: string | null; // lucide icon name
}

export interface Budget {
  id: string;
  vaultId: string;
  profileId?: string;
  categoryId: string;
  amountLimit: string;
  rolloverEnabled: boolean;
  alertThresholdPct: number;
}

export type GoalType =
  | 'emergency_fund' | 'house' | 'vehicle' | 'vacation' | 'education' | 'custom';

export interface Goal {
  id: string;
  vaultId: string;
  profileId?: string;
  name: string;
  goalType: GoalType;
  targetAmount: string;
  currentAmount: string;
  targetDate?: number | null;
  notes?: string | null;
}

// Keys must match Dart's AssetType.key and the entries in assets/tax_rules.json.
export type AssetType =
  | 'equity_etf' | 'equity_mf' | 'debt_mf' | 'gold_etf' | 'bond' | 'cash'
  | 'real_estate' | 'crypto' | 'fd' | 'ppf_epf' | 'nps'
  | 'ssy' | 'sgb' | 'ulip';

export interface Holding {
  id: string;
  vaultId: string;
  profileId?: string;
  symbol: string;
  exchange: string; // 'NSE' | 'BSE'
  quantity: string;
  avgCost: string;
  lastPrice?: string | null;
  assetType: AssetType;
  firstPurchaseDate?: number | null; // epoch ms — for XIRR & LTCG/STCG holding period
}

export type LiabilityKind = 'credit_card' | 'loan';

export interface Liability {
  id: string;
  vaultId: string;
  profileId?: string;
  name: string;
  kind: LiabilityKind;
  principal: string;
  aprPct: string;
  termMonths?: number | null;
  creditLimit?: string | null;
}

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurringRule {
  id: string;
  vaultId: string;
  profileId?: string;
  amount: string;
  type: TxnType;
  categoryId: string;
  merchant?: string | null;
  frequency: Frequency;
  nextRun: number;
}

// ---- Insurance (policies + coverage-gap analysis) ----
export type InsuranceType = 'life' | 'health' | 'term' | 'vehicle' | 'home' | 'other';
export interface Insurance {
  id: string;
  vaultId: string;
  profileId?: string;
  name: string;        // e.g. "HDFC Click 2 Protect"
  type: InsuranceType;
  provider?: string | null;
  coverAmount: string; // sum assured
  premium: string;     // annual premium
  renewalDate?: number | null;
}

// ---- Double-entry accounting (chart of accounts + balanced postings, PRD §16) ----
export type AccountType = 'asset' | 'liability' | 'income' | 'expense' | 'equity';
export interface Account {
  id: string;
  vaultId: string;
  profileId?: string;
  name: string;
  type: AccountType;
  // cash | bank | credit_card | loan | investment | manual_asset | income | expense | equity
  subtype: string;
  currency?: string;
  openingBalance: string; // natural magnitude (≥ 0); sign derived from type
  archived?: boolean;
}

export interface Posting {
  id: string;
  vaultId: string;
  profileId?: string;
  entryId: string; // the Txn this leg belongs to
  accountId: string;
  amount: string; // debit-signed (debit +, credit −); entry-wide sum == 0
}

// ---- Auto-capture drafts (SMS / notification parser, parsed values only) ----
export type CaptureSource = 'sms' | 'notification';
export interface PendingCapture {
  id: string;
  vaultId: string;
  profileId?: string;
  amount: string;
  type: TxnType;
  merchant?: string | null;
  occurredAt: number; // epoch ms
  source: CaptureSource;
  uncategorized: boolean;
  fingerprint: string; // SHA-256 dedup key
  capturedAt: number;
}

// ---- Net-worth history snapshot (real, not derived) ----
export interface NetWorthSnapshot {
  id: string;          // `snapshot:YYYY-MM-DD:profileId`
  vaultId: string;
  profileId?: string;
  date: number;        // epoch ms (day)
  netWorth: string;
  cash: string;
  investments: string;
  liabilities: string;
  /**
   * Health score on this day, 0-100. Optional and nullable on purpose: a day
   * where nothing was tracked has no score, and storing 0 would turn "we could
   * not judge this" into "you scored nothing" the moment the Score page reads
   * it back into the history chart. Mirrors the nullable column added in
   * Drift schema v5.
   */
  healthScore?: number | null;
  /** Share of the score's weight that was tracked that day, 0-100. */
  healthTrackedWeight?: number | null;
}

export const STORE = {
  txn: 'txn',
  category: 'category',
  budget: 'budget',
  goal: 'goal',
  holding: 'holding',
  liability: 'liability',
  recurring: 'recurring',
  profile: 'profile',
  insurance: 'insurance',
  snapshot: 'snapshot',
  account: 'account',
  posting: 'posting',
  pendingCapture: 'pendingCapture',
  attachment: 'attachment',
} as const;

// Entity types that are scoped to the active profile (category & profile are vault-wide).
export const PROFILE_SCOPED: string[] = [
  STORE.txn, STORE.budget, STORE.goal, STORE.holding,
  STORE.liability, STORE.recurring, STORE.insurance, STORE.snapshot,
  STORE.account, STORE.posting, STORE.pendingCapture, STORE.attachment,
];
