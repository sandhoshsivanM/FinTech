// Domain entity shapes. Money fields are Decimal strings (serialized); convert
// with D() at use. Mirrors the Flutter app's entities.

/**
 * What a transaction *is*, in accounting terms (Hardening Plan §3.2).
 *
 * `investment` is the third kind because buying a holding is not spending. It
 * moves cash out of a money account and into an asset you still own, so net
 * worth is unchanged — whereas an expense destroys the money. Modelling it as
 * an expense, which is what "Investment" being an ordinary spend category
 * amounted to, inflated every budget, every expense total and the savings rate,
 * and made a month where someone invested well look like a month where they
 * overspent badly.
 *
 * Transfers are deliberately NOT here: they are a separate `Transfer` entity,
 * because a movement between two of your own accounts has two endpoints and one
 * amount, which this shape cannot express.
 */
export type TxnType = 'expense' | 'income' | 'investment';

/** The kinds that reduce spendable cash. Both leave the money account. */
export const CASH_OUT_TYPES: readonly TxnType[] = ['expense', 'investment'];

/**
 * The only kind budgets and expense reporting may count.
 *
 * Exported so the rule lives in one place: every consumer that means "spending"
 * asks here rather than writing `type === 'expense'` and quietly disagreeing
 * with the next screen along.
 */
export const isSpending = (t: TxnType): boolean => t === 'expense';

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
  /**
   * When this entry was last corrected. Absent means never edited.
   *
   * Not an audit trail — the previous values are gone. It exists so a reader
   * can tell a record that has been changed since it was captured from one
   * that has not, which matters when a figure disagrees with a statement.
   */
  updatedAt?: number;
  // Double-entry header (PRD §16): the money account the spend/income moves, and
  // an optional receipt attachment. Postings remain the authoritative ledger.
  accountId?: string | null;
  attachmentRef?: string | null; // record id on web, sandbox path on mobile
  /**
   * Ticked off against a bank statement.
   *
   * Reconciliation is the difference between "my book says X" and "my bank
   * says X" — without a per-entry mark there is no way to find *which* entries
   * explain a gap, which is why it was previously done by hand in a
   * spreadsheet. Absent means never reconciled, not "not cleared".
   */
  cleared?: boolean;
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
  /**
   * Saved so far. When `accountId` is set the store substitutes the linked
   * account's balance here on load, so readers never need to know which kind
   * of goal they have; the stored value is then a stale leftover, not truth.
   */
  currentAmount: string;
  targetDate?: number | null;
  notes?: string | null;
  /**
   * The account holding this goal's money. An emergency fund lives in a real
   * bank account — tracking it twice guarantees the two drift apart.
   */
  accountId?: string | null;
}

// Keys must match Dart's AssetType.key and the entries in assets/tax_rules.json.
export type AssetType =
  | 'equity_etf' | 'equity_mf' | 'debt_mf' | 'gold_etf' | 'bond' | 'cash'
  | 'real_estate' | 'crypto' | 'fd' | 'ppf_epf' | 'nps'
  | 'ssy' | 'sgb' | 'ulip';

/** Provenance of a recorded price. See `Holding.priceSource`. */
export type PriceSource = 'manual' | 'import';

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

  // --- Presentation & classification, all optional -------------------------
  // Every field below is optional so an existing vault keeps loading unchanged;
  // absent means "not recorded", which the UI must render as such rather than
  // as a zero. Sector/cap fall back to the bundled instrument master when
  // unset — these overrides exist for instruments the master does not cover.
  /** Company or scheme name. Shown instead of the bare ticker where present. */
  name?: string | null;
  /** Previous close, for the day-change column. Money field: a Decimal string. */
  previousClose?: string | null;
  /**
   * When `lastPrice`/`previousClose` were recorded (epoch ms). There is no
   * price feed, so a price is only ever as fresh as the last import — this is
   * what lets the day-change card name the day it is measuring, instead of
   * implying "now". Absent means the prices predate this field.
   */
  priceAsOf?: number | null;
  /**
   * Where `lastPrice` came from.
   *
   * A hand-typed price and one read out of a broker export were previously
   * indistinguishable, so nothing could weigh them against each other or tell
   * the user which they were looking at (§7.1). Absent means unrecorded, which
   * is not the same as manual.
   */
  priceSource?: PriceSource | null;
  /** Overrides the instrument-master sector lookup. */
  sector?: string | null;
  /** ISO 3166-1 alpha-2, e.g. 'IN'. Drives the country allocation. */
  country?: string | null;
  /** Overrides the instrument-master market-cap band. */
  marketCapBand?: 'large' | 'mid' | 'small' | null;

  // --- Fixed income -------------------------------------------------------
  // A bond, FD, PPF or SSY is not `quantity × price`: it is principal plus the
  // interest earned so far. Without these fields such a holding valued at cost
  // forever and reported exactly ₹0 return for its whole life — the return was
  // not mis-displayed, it was unrepresentable.
  //
  // Principal is not stored again here: it is `quantity × avgCost`, the same
  // figure every other asset type uses, so the two can never disagree.
  // --- Currency -----------------------------------------------------------
  // Every amount used to be assumed INR and converted only for display. A US
  // holding bought through Vested or Stockal is genuinely priced in dollars,
  // so storing its cost as if it were rupees baked in an error that compounds
  // silently and can never be recovered from the record.
  //
  // Absent means INR, so existing holdings are unchanged and no migration
  // rewrites anything.
  /** ISO 4217 of `avgCost` and `lastPrice`, e.g. 'USD'. Absent means INR. */
  currency?: string | null;
  /**
   * Units of INR per one unit of `currency` on the purchase date.
   *
   * Kept so cost and market value convert at their own rates: converting a
   * 2019 purchase at today's rate reports an FX movement as if it were a
   * capital gain. Absent falls back to the current rate, and the UI says the
   * figure is approximate rather than implying precision it does not have.
   */
  fxRateAtPurchase?: string | null;

  /** Annual rate as a percentage, e.g. '7.1'. Decimal string. */
  couponRatePct?: string | null;
  /** Epoch ms. Interest stops accruing here. */
  maturityDate?: number | null;
  /**
   * How the interest is paid.
   *
   * `cumulative` compounds and is collected at maturity (a standard FD, PPF).
   * The rest pay out periodically, so the principal stays put and only the
   * interest since the last payout is unrealised.
   */
  payoutFrequency?: 'cumulative' | 'monthly' | 'quarterly' | 'half_yearly' | 'annual' | null;
}

// ---- Watchlist: instruments tracked but not owned --------------------------
export interface WatchItem {
  id: string;
  vaultId: string;
  profileId?: string;
  symbol: string;
  exchange: string;
  name?: string | null;
  /** Last recorded price. Entered by hand — there is no price feed. */
  lastPrice?: string | null;
  /** The price the user is watching for. Money field: a Decimal string. */
  targetPrice?: string | null;
  note?: string | null;
  addedAt: number;
}

// ---- Dividends -------------------------------------------------------------
export type DividendKind = 'dividend' | 'interest' | 'bonus' | 'buyback';
export interface Dividend {
  id: string;
  vaultId: string;
  profileId?: string;
  symbol: string;
  kind: DividendKind;
  /** Total received (or expected). Money field: a Decimal string. */
  amount: string;
  /** Per-share payout, when known. */
  perShare?: string | null;
  /** Epoch ms. `payDate` in the future means this is still expected. */
  exDate?: number | null;
  payDate: number;
  /** False until the money actually landed. */
  received: boolean;
}

// ---- Purchase lots ---------------------------------------------------------
/**
 * One dated purchase of a holding.
 *
 * A `Holding` carries a single `avgCost` and one `firstPurchaseDate`, which is
 * enough to value a position and not enough to tax it. Buy the same stock in
 * March and again in November, sell in December, and the gain is part
 * short-term and part long-term — a single average cannot express that, so the
 * Tax Centre was producing a confident number that could not be right.
 *
 * Lots are additive and optional. A holding with none behaves exactly as
 * before via a synthetic lot derived from its own fields, so nothing changes
 * until real lots are recorded. The invariant that keeps the two honest: the
 * lots of a holding must sum to its quantity, and their weighted cost must
 * equal its average cost.
 */
export interface HoldingLot {
  id: string;
  vaultId: string;
  profileId?: string;
  /** The position this purchase belongs to. */
  holdingId: string;
  /** Units bought in this tranche. */
  quantity: string;
  /** Price paid per unit, excluding charges. */
  costPerUnit: string;
  /** Epoch ms. Drives the holding period, so it decides STCG vs LTCG. */
  purchaseDate: number;
  note?: string | null;
}

// ---- Import batches --------------------------------------------------------
/**
 * One run of the importer, so it can be undone.
 *
 * An import is the only action in the app that writes hundreds of records at
 * once, and it had no reverse. A file with the wrong account, the wrong sign
 * convention, or the wrong profile left the user re-entering data by hand or
 * restoring a backup — assuming they had one. Recording which ids a run
 * created makes the mistake cheap.
 *
 * Only *created* ids are listed. An import that updated an existing holding is
 * not reversed: undo removes what the run added, it does not resurrect a prior
 * value it never captured. The UI says so rather than implying a full rewind.
 */
export interface ImportBatch {
  id: string;
  vaultId: string;
  profileId?: string;
  /** Epoch ms. */
  at: number;
  /** File the rows came from, for recognising the run later. */
  filename: string;
  /** 'transactions' | 'holdings' — what the run was importing. */
  kind: 'transactions' | 'holdings';
  /** Records this run created, as `type:id` pairs. */
  created: { type: string; id: string }[];
  /** Records this run overwrote. Counted, reported, and not reversible. */
  updatedCount: number;
  /** True once the batch has been rolled back. Kept for the history list. */
  undone?: boolean;
}

// ---- Alerts ----------------------------------------------------------------
/**
 * What kind of thing an alert watches (Hardening Plan §5.2).
 *
 * Separate from `kind` below, which is the comparison. Conflating the two —
 * which is what a single flat enum did — meant nothing could say "this is a
 * market alert, and market alerts are only as fresh as your last price import".
 */
export type AlertType = 'FINANCIAL' | 'SCHEDULED' | 'MARKET';

export type AlertKind = 'price_above' | 'price_below' | 'weight_above' | 'budget_over' | 'renewal_due';

/**
 * Where an alert is in its life (§5.3).
 *
 * Three states, deliberately: the original plan rejected a five-state lifecycle
 * and it was right to. `ARMED` is watching, `TRIGGERED` means the condition
 * held and the user has not acknowledged it, `DISMISSED` means they have. A
 * dismissed alert re-arms once its condition stops holding, so a budget you
 * fixed can warn you again next month.
 */
export type AlertState = 'ARMED' | 'TRIGGERED' | 'DISMISSED';

export const ALERT_TYPE_OF: Record<AlertKind, AlertType> = {
  price_above: 'MARKET',
  price_below: 'MARKET',
  weight_above: 'MARKET',
  budget_over: 'FINANCIAL',
  renewal_due: 'SCHEDULED',
};

export interface Alert {
  id: string;
  vaultId: string;
  profileId?: string;
  kind: AlertKind;
  /** Ticker for price/weight alerts; category id for budget_over; unset otherwise. */
  symbol?: string | null;
  label: string;
  /** Comparison threshold. Money for prices, percent for weights and budgets, days for renewals. */
  threshold: string;
  active: boolean;
  createdAt: number;

  /**
   * Where this alert stands. Absent on records written before §5, which are
   * read as ARMED — the safe default, since it means "watching".
   */
  state?: AlertState;
  /**
   * When the rule was last actually checked.
   *
   * The honesty field. Khazana has no server and no background worker, so a
   * rule is only evaluated while the app is open. Showing when that last
   * happened is the difference between an alert surface and a promise the app
   * cannot keep.
   */
  lastEvaluatedAt?: number | null;
  /** Epoch ms of the last time this alert's condition held. */
  lastTriggeredAt?: number | null;
  /**
   * How old the data behind the last evaluation was.
   *
   * Only meaningful for MARKET alerts: a price alert evaluated just now against
   * a price imported last Tuesday is not a current market alert, and §7.1 says
   * it must not pretend to be one.
   */
  dataAsOf?: number | null;
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
  /** Account the generated transactions move. Falls back to Cash when unset. */
  accountId?: string | null;
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
  entryId: string; // the Txn or Transfer this leg belongs to
  accountId: string;
  amount: string; // debit-signed (debit +, credit −); entry-wide sum == 0
}

/**
 * Money moved between two of your own accounts — salary account to emergency
 * fund, say.
 *
 * Deliberately NOT a third `TxnType`. Two dozen places across the domain and
 * the pages branch on `type === 'income'` as a binary, so a transfer wearing a
 * Txn's clothes would be counted as spending by budgets, cash-flow reports,
 * the health score and the safety net — the emergency fund would look like an
 * expense every month it was funded. A separate record cannot be miscounted by
 * code that never loads it.
 *
 * Its postings debit the destination and credit the source, so the entry
 * balances and net worth is unchanged, which is the truth: moving your own
 * money neither earns nor spends it.
 */
export interface Transfer {
  id: string;
  vaultId: string;
  profileId?: string;
  amount: string; // positive magnitude
  fromAccountId: string;
  toAccountId: string;
  date: number; // epoch ms
  note?: string | null;
  createdAt: number;
  /**
   * When this entry was last corrected. Absent means never edited.
   *
   * Not an audit trail — the previous values are gone. It exists so a reader
   * can tell a record that has been changed since it was captured from one
   * that has not, which matters when a figure disagrees with a statement.
   */
  updatedAt?: number;
  /** Ticked off against a bank statement — see `Txn.cleared`. */
  cleared?: boolean;
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
  transfer: 'transfer',
  pendingCapture: 'pendingCapture',
  attachment: 'attachment',
  watchItem: 'watchItem',
  dividend: 'dividend',
  alert: 'alert',
  importBatch: 'importBatch',
  lot: 'lot',
} as const;

// Entity types that are scoped to the active profile (category & profile are vault-wide).
export const PROFILE_SCOPED: string[] = [
  STORE.txn, STORE.budget, STORE.goal, STORE.holding,
  STORE.liability, STORE.recurring, STORE.insurance, STORE.snapshot,
  STORE.account, STORE.posting, STORE.transfer, STORE.pendingCapture, STORE.attachment,
  STORE.watchItem, STORE.dividend, STORE.alert, STORE.importBatch, STORE.lot,
];
