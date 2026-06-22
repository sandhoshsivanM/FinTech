import 'package:decimal/decimal.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/data_providers.dart';
import '../../../data/database/app_database.dart';
import '../../../domain/entities/fx_rate.dart';

/// Streams stored FX rates for the Currency settings screen (PRD §12C).
final fxRatesProvider = FutureProvider<List<FxRate>>((ref) async {
  final db = ref.watch(databaseProvider);
  final rows = await db.fxRateDao.allRates();
  return rows
      .map((r) => FxRate(
            baseCurrency: r.baseCurrency,
            quoteCurrency: r.quoteCurrency,
            rate: r.rate,
            source: r.source,
            fetchedAt: DateTime.fromMillisecondsSinceEpoch(r.fetchedAt),
          ))
      .toList();
});

final fxActionsProvider = Provider<FxActions>((ref) => FxActions(ref));

class FxActions {
  FxActions(this._ref);
  final Ref _ref;

  /// Adds a manual rate (PRD §12B fallback). [rate] = quote units per 1 base.
  Future<void> addManual(
      String base, String quote, Decimal rate, int nowMs) async {
    final db = _ref.read(databaseProvider);
    await db.fxRateDao.insertRate(FxRatesCompanion(
      baseCurrency: Value(base.toUpperCase()),
      quoteCurrency: Value(quote.toUpperCase()),
      rate: Value(rate),
      source: const Value('manual'),
      fetchedAt: Value(nowMs),
    ));
    _ref.invalidate(fxRatesProvider);
  }
}
