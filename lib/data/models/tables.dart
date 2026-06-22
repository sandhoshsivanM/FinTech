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
