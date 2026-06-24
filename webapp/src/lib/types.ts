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

export type AssetType =
  | 'equity_etf' | 'debt_mf' | 'gold_etf' | 'real_estate'
  | 'crypto' | 'fd' | 'ppf_epf' | 'nps';

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
} as const;

// Entity types that are scoped to the active profile (category & profile are vault-wide).
export const PROFILE_SCOPED: string[] = [
  STORE.txn, STORE.budget, STORE.goal, STORE.holding,
  STORE.liability, STORE.recurring, STORE.insurance, STORE.snapshot,
];
