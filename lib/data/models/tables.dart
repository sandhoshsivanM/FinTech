import 'package:decimal/decimal.dart';
import 'package:drift/drift.dart';

import '../database/converters.dart';

/// Drift table definitions (PRD §3B `lib/data/models/`).
/// Money columns are TEXT via [DecimalConverter] (PRD §2).

@DataClassName('CategoryRow')
class Categories extends Table {
  TextColumn get id => text()();
  TextColumn get vaultId => text()();
  TextColumn get name => text()();
  IntColumn get iconCodepoint => integer().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('TransactionRow')
class Transactions extends Table {
  TextColumn get id => text()();
  TextColumn get vaultId => text()();

  /// Always positive; the [type] column carries the sign.
  TextColumn get amount => text().map(const DecimalConverter())();

  /// 'expense' | 'income'.
  TextColumn get type => text()();

  TextColumn get categoryId => text().references(Categories, #id)();
  TextColumn get merchant => text().nullable()();
  TextColumn get note => text().nullable()();

  /// Double-entry header (PRD §16): the money account (cash/bank/credit) this
  /// entry moves. Nullable for pre-v3 rows until the migration backfills them.
  TextColumn get accountId => text().nullable()();

  /// Receipt attachment — sandbox file path (PRD §11 local media).
  TextColumn get attachmentRef => text().nullable()();

  /// Transaction date and creation time (Unix ms).
  IntColumn get date => integer()();
  IntColumn get createdAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Budget per category per vault (PRD §7B). Spent is computed on query — there
/// is intentionally no stored `spent` column (PRD §7C).
@DataClassName('BudgetRow')
class Budgets extends Table {
  TextColumn get id => text()();
  TextColumn get vaultId => text()();
  TextColumn get categoryId => text().references(Categories, #id)();

  /// ENUM: monthly (only in v1 — PRD §7B).
  TextColumn get periodType => text().withDefault(const Constant('monthly'))();

  /// Monthly limit in vault currency, Decimal as TEXT.
  TextColumn get amountLimit => text().map(const DecimalConverter())();

  BoolColumn get rolloverEnabled =>
      boolean().withDefault(const Constant(false))();

  /// Default 90 (PRD §7B). Range 1–100.
  IntColumn get alertThresholdPct =>
      integer().withDefault(const Constant(90))();

  IntColumn get createdAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Portfolio holdings (PRD §14 portfolio import). Money as TEXT (Decimal).
@DataClassName('HoldingRow')
class Holdings extends Table {
  TextColumn get id => text()();
  TextColumn get vaultId => text()();
  TextColumn get symbol => text()();
  TextColumn get exchange => text().withDefault(const Constant('NSE'))();
  TextColumn get quantity => text().map(const DecimalConverter())();
  TextColumn get avgCost => text().map(const DecimalConverter())();
  IntColumn get firstPurchaseDate => integer()(); // Unix ms
  TextColumn get assetType =>
      text().withDefault(const Constant('equity_etf'))();
  TextColumn get currency => text().withDefault(const Constant('INR'))();
  TextColumn get lastPrice => text().map(const DecimalConverter()).nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Liabilities — credit cards and loans (PRD §14 liabilities ledger).
@DataClassName('LiabilityRow')
class Liabilities extends Table {
  TextColumn get id => text()();
  TextColumn get vaultId => text()();
  TextColumn get name => text()();
  TextColumn get kind => text()(); // 'credit_card' | 'loan'
  TextColumn get principal => text().map(const DecimalConverter())();
  TextColumn get aprPct => text().map(const DecimalConverter())();
  IntColumn get termMonths => integer().nullable()(); // for loans/EMIs
  IntColumn get createdAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Goals (PRD §8B) and their contribution ledger.
@DataClassName('GoalRow')
class Goals extends Table {
  TextColumn get id => text()();
  TextColumn get vaultId => text()();
  TextColumn get name => text()();
  TextColumn get goalType => text()();
  TextColumn get targetAmount => text().map(const DecimalConverter())();
  TextColumn get currentAmount => text().map(const DecimalConverter())();
  IntColumn get targetDate => integer().nullable()();
  TextColumn get notes => text().nullable()();
  BoolColumn get isAchieved => boolean().withDefault(const Constant(false))();
  IntColumn get createdAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('GoalContributionRow')
class GoalContributions extends Table {
  TextColumn get id => text()();
  TextColumn get goalId => text().references(Goals, #id)();
  TextColumn get amount => text().map(const DecimalConverter())();
  TextColumn get note => text().nullable()();
  IntColumn get contributedAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Recurring transaction rules (PRD §14, Phase 3).
@DataClassName('RecurringRuleRow')
class RecurringRules extends Table {
  TextColumn get id => text()();
  TextColumn get vaultId => text()();
  TextColumn get amount => text().map(const DecimalConverter())();
  TextColumn get type => text()(); // expense | income
  TextColumn get categoryId => text().references(Categories, #id)();
  TextColumn get merchant => text().nullable()();
  TextColumn get note => text().nullable()();
  TextColumn get frequency => text()(); // daily|weekly|monthly|yearly
  IntColumn get nextRun => integer()(); // Unix ms
  BoolColumn get active => boolean().withDefault(const Constant(true))();

  @override
  Set<Column> get primaryKey => {id};
}

/// Stored FX rates (PRD §12C). All historical entries retained (no delete).
@DataClassName('FxRateRow')
class FxRates extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get baseCurrency => text()();
  TextColumn get quoteCurrency => text()();
  TextColumn get rate => text().map(const DecimalConverter())();
  TextColumn get source => text()(); // 'ecb' | 'manual'
  IntColumn get fetchedAt => integer()();
}

/// Transaction dedup fingerprints for bank statement import (PRD §13C).
@DataClassName('TxnFingerprintRow')
class TransactionFingerprints extends Table {
  TextColumn get vaultId => text()();
  TextColumn get fingerprint => text()();

  @override
  Set<Column> get primaryKey => {vaultId, fingerprint};
}

/// Learned merchant → category aliases (PRD §8 early Phase 2, §14 merchant
/// alias learning).
@DataClassName('MerchantAliasRow')
class MerchantAliases extends Table {
  TextColumn get id => text()();
  TextColumn get vaultId => text()();
  TextColumn get merchantPattern => text()();
  TextColumn get categoryId => text().references(Categories, #id)();
  IntColumn get hitCount => integer().withDefault(const Constant(1))();

  @override
  Set<Column> get primaryKey => {id};
}

/// Shared helper for an empty Decimal-typed expression default if needed.
Expression<String> decimalLiteral(Decimal d) => Constant(d.toString());

/// Insurance policies (parity with web app — coverage + gap analysis).
@DataClassName('InsuranceRow')
class Insurances extends Table {
  TextColumn get id => text()();
  TextColumn get vaultId => text()();
  TextColumn get name => text()();
  TextColumn get type => text()(); // life | health | term | vehicle | home | other
  TextColumn get provider => text().nullable()();
  TextColumn get coverAmount => text().map(const DecimalConverter())();
  TextColumn get premium => text().map(const DecimalConverter())();
  IntColumn get renewalDate => integer().nullable()(); // Unix ms
  IntColumn get createdAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Daily net-worth snapshots (real history, not derived from cash flow alone).
@DataClassName('NetWorthSnapshotRow')
class NetWorthSnapshots extends Table {
  TextColumn get id => text()(); // snap-<vault>-<yyyy-mm-dd>
  TextColumn get vaultId => text()();
  IntColumn get date => integer()(); // Unix ms
  TextColumn get netWorth => text().map(const DecimalConverter())();
  TextColumn get cash => text().map(const DecimalConverter())();
  TextColumn get investments => text().map(const DecimalConverter())();
  TextColumn get liabilities => text().map(const DecimalConverter())();

  /// The health score on this day, 0-100. **Nullable on purpose**: a day where
  /// nothing was tracked has no score, and storing 0 would turn "we could not
  /// judge this" into "you scored nothing" the moment it is read back into the
  /// Score screen's history chart.
  IntColumn get healthScore => integer().nullable()();

  /// How much of the score's weight was tracked that day, 0-100. Without it a
  /// history point cannot be read honestly — 70 out of four categories and 70
  /// out of two are not the same number.
  IntColumn get healthTrackedWeight => integer().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Chart of accounts for double-entry bookkeeping (PRD §16). [openingBalance] is
/// a natural magnitude; the sign is derived from [type] in the ledger math.
@DataClassName('AccountRow')
class Accounts extends Table {
  TextColumn get id => text()();
  TextColumn get vaultId => text()();
  TextColumn get name => text()();
  TextColumn get type => text()(); // asset | liability | income | expense | equity
  TextColumn get subtype => text().withDefault(const Constant('cash'))();
  TextColumn get currency => text().withDefault(const Constant('INR'))();
  TextColumn get openingBalance =>
      text().map(const DecimalConverter()).withDefault(const Constant('0'))();
  BoolColumn get archived => boolean().withDefault(const Constant(false))();
  IntColumn get createdAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Journal postings — the authoritative double-entry ledger. [amount] is
/// debit-signed; postings sharing [entryId] sum to zero (PRD §16).
@DataClassName('PostingRow')
class Postings extends Table {
  TextColumn get id => text()();
  TextColumn get vaultId => text()();
  TextColumn get entryId => text().references(Transactions, #id)();
  TextColumn get accountId => text().references(Accounts, #id)();
  TextColumn get amount => text().map(const DecimalConverter())();

  @override
  Set<Column> get primaryKey => {id};
}

/// Auto-captured transaction drafts from the SMS / notification parser, awaiting
/// review. Stores extracted values only — never the raw message text (PRD §11
/// zero-telemetry privacy boundary).
@DataClassName('PendingCaptureRow')
class PendingCaptures extends Table {
  TextColumn get id => text()();
  TextColumn get vaultId => text()();
  TextColumn get amount => text().map(const DecimalConverter())();
  TextColumn get type => text()(); // expense | income
  TextColumn get merchant => text().nullable()();
  IntColumn get occurredAt => integer()(); // Unix ms
  TextColumn get source => text()(); // sms | notification
  BoolColumn get uncategorized => boolean().withDefault(const Constant(true))();
  TextColumn get fingerprint => text()();
  IntColumn get capturedAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

// ---------------------------------------------------------------------------
// Lot-level portfolio model (v4)
// ---------------------------------------------------------------------------
//
// Why these exist: [Holdings] stores one aggregated row per symbol with a single
// avgCost, which makes true profit-and-loss impossible — there is no per-lot cost
// basis, no realised/unrealised split, no dated price, and no sector to roll up
// by. These six tables supply that. Money stays Decimal-in-TEXT (PRD §2: double
// is banned for money).
//
// [Holdings] is retained for now and is backfilled into [Instruments]/[Trades] by
// the v4 migration. It is superseded and should be treated as read-only legacy
// until the UI finishes moving over.

/// One row per security ever held. Identity, classification, and benchmark link.
///
/// Mutual funds have no ticker, so [symbol] and [exchange] are nullable and the
/// natural key is [isin] or ([schemeCode], folio) — see [Trades.folioNumber].
@DataClassName('InstrumentRow')
class Instruments extends Table {
  TextColumn get id => text()();
  TextColumn get vaultId => text()();

  /// Matches `AssetType.key`.
  TextColumn get kind => text()();
  TextColumn get name => text()();

  TextColumn get symbol => text().nullable()();
  TextColumn get isin => text().nullable()();
  TextColumn get exchange => text().nullable()();

  /// Mutual-fund identity.
  TextColumn get amcName => text().nullable()();
  TextColumn get schemeCode => text().nullable()();

  /// Classification from the bundled instrument master.
  TextColumn get sectorCode => text().nullable()();
  TextColumn get industryCode => text().nullable()();
  TextColumn get marketCapBand => text().nullable()(); // large | mid | small

  /// User corrections. These win over the bundled values and are never
  /// overwritten when the bundled asset is upgraded.
  TextColumn get sectorOverride => text().nullable()();
  TextColumn get industryOverride => text().nullable()();

  TextColumn get currency => text().withDefault(const Constant('INR'))();
  TextColumn get benchmarkIndexCode => text().nullable()();
  IntColumn get createdAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Every buy and sell. The source of truth for cost basis and realised P&L.
///
/// Open lots are derived from buys and matched against sells FIFO, so this table
/// must never be collapsed into an average.
@DataClassName('TradeRow')
class Trades extends Table {
  TextColumn get id => text()();
  TextColumn get vaultId => text()();
  TextColumn get instrumentId => text().references(Instruments, #id)();

  /// Broker / demat account this trade belongs to. Nullable because legacy
  /// backfilled rows and quick manual entries may not name one.
  TextColumn get accountId => text().nullable().references(Accounts, #id)();

  TextColumn get side => text()(); // buy | sell
  TextColumn get quantity => text().map(const DecimalConverter())();
  TextColumn get pricePerUnit => text().map(const DecimalConverter())();

  /// Charges, broken out so cost basis matches the broker's own figure.
  /// Cost basis = quantity × pricePerUnit + these.
  TextColumn get brokerage =>
      text().map(const DecimalConverter()).withDefault(const Constant('0'))();
  TextColumn get stt =>
      text().map(const DecimalConverter()).withDefault(const Constant('0'))();
  TextColumn get stampDuty =>
      text().map(const DecimalConverter()).withDefault(const Constant('0'))();
  TextColumn get gst =>
      text().map(const DecimalConverter()).withDefault(const Constant('0'))();
  TextColumn get otherCharges =>
      text().map(const DecimalConverter()).withDefault(const Constant('0'))();

  IntColumn get tradeDate => integer()(); // Unix ms
  TextColumn get folioNumber => text().nullable()();

  /// manual | csv | cas | cams | api
  TextColumn get source => text().withDefault(const Constant('manual'))();

  /// Parser confidence 0-100; null for hand-entered rows.
  IntColumn get confidence => integer().nullable()();

  /// False until the user has confirmed an imported or backfilled row. Nothing
  /// unreviewed should be presented as an authoritative number.
  BoolColumn get isReviewed =>
      boolean().withDefault(const Constant(false))();

  IntColumn get createdAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Dated price series. A series rather than a single column so P&L can state how
/// stale it is, and so trends and XIRR have history to work with.
@DataClassName('InstrumentPriceRow')
class InstrumentPrices extends Table {
  TextColumn get id => text()();
  TextColumn get vaultId => text()();
  TextColumn get instrumentId => text().references(Instruments, #id)();
  IntColumn get asOf => integer()(); // Unix ms
  TextColumn get price => text().map(const DecimalConverter())();

  /// manual | amfi | yahoo | alphavantage | twelvedata | cache
  TextColumn get source => text()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Dividends and mutual-fund payouts. Counted as inflows for XIRR and reported
/// separately from capital P&L.
@DataClassName('DividendRow')
class Dividends extends Table {
  TextColumn get id => text()();
  TextColumn get vaultId => text()();
  TextColumn get instrumentId => text().references(Instruments, #id)();
  IntColumn get paidOn => integer()(); // Unix ms
  TextColumn get amount => text().map(const DecimalConverter())();
  TextColumn get taxDeducted =>
      text().map(const DecimalConverter()).withDefault(const Constant('0'))();
  TextColumn get kind => text().withDefault(const Constant('dividend'))();

  /// The income transaction this was posted as, so cash flow and the portfolio
  /// view never disagree.
  TextColumn get txnId => text().nullable().references(Transactions, #id)();

  @override
  Set<Column> get primaryKey => {id};
}

/// Mutual-fund look-through: which underlying securities a scheme holds, and at
/// what weight. Populated from the bundled AMC portfolio disclosures; used to
/// detect the same stock held via several funds.
@DataClassName('FundHoldingRow')
class FundHoldings extends Table {
  TextColumn get id => text()();
  TextColumn get schemeCode => text()();
  TextColumn get underlyingIsin => text()();

  /// Weight in basis points (1% = 100), so no floating point is involved.
  IntColumn get weightBps => integer()();
  IntColumn get asOf => integer()(); // Unix ms

  @override
  Set<Column> get primaryKey => {id};
}

/// Benchmark index closes, for returns comparison. Bundled and refreshed on the
/// same explicit user-initiated path as prices.
@DataClassName('BenchmarkPointRow')
class BenchmarkSeries extends Table {
  TextColumn get id => text()();
  TextColumn get indexCode => text()(); // e.g. NIFTY50
  IntColumn get onDate => integer()(); // Unix ms
  TextColumn get closeValue => text().map(const DecimalConverter())();

  @override
  Set<Column> get primaryKey => {id};
}
