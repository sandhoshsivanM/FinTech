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

  @override
  Set<Column> get primaryKey => {id};
}
