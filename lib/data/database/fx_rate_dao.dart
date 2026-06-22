import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'app_database.dart';

part 'fx_rate_dao.g.dart';

/// FX rates store (PRD §12C). Historical entries are retained (no delete) so
/// XIRR / capital gains can use the rate at the transaction date (PRD §12D).
@DriftAccessor(tables: [FxRates])
class FxRateDao extends DatabaseAccessor<AppDatabase> with _$FxRateDaoMixin {
  FxRateDao(super.db);

  Future<void> insertRate(FxRatesCompanion row) => into(fxRates).insert(row);

  Future<List<FxRateRow>> allRates() =>
      (select(fxRates)..orderBy([(r) => OrderingTerm.desc(r.fetchedAt)])).get();

  /// Latest rate for a (base, quote) pair.
  Future<FxRateRow?> latest(String base, String quote) {
    return (select(fxRates)
          ..where((r) =>
              r.baseCurrency.equals(base) & r.quoteCurrency.equals(quote))
          ..orderBy([(r) => OrderingTerm.desc(r.fetchedAt)])
          ..limit(1))
        .getSingleOrNull();
  }

  /// Rate effective on/just before [atMs] (historical lookup).
  Future<FxRateRow?> asOf(String base, String quote, int atMs) {
    return (select(fxRates)
          ..where((r) =>
              r.baseCurrency.equals(base) &
              r.quoteCurrency.equals(quote) &
              r.fetchedAt.isSmallerOrEqualValue(atMs))
          ..orderBy([(r) => OrderingTerm.desc(r.fetchedAt)])
          ..limit(1))
        .getSingleOrNull();
  }
}
