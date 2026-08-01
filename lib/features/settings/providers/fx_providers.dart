import 'package:decimal/decimal.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/di/data_providers.dart';
import '../../../data/database/app_database.dart';
import '../../../domain/entities/fx_rate.dart';
import '../../../domain/services/currency_converter.dart';
import '../data/fx_rate_provider.dart';

/// The currency every total is reported in. Defaults to INR.
///
/// A preference rather than a vault row: it is a display choice, not financial
/// data, and it must be readable before the vault is unlocked.
const kBaseCurrencyKey = 'base_currency';
const kDefaultBaseCurrency = 'INR';

final baseCurrencyProvider =
    NotifierProvider<BaseCurrencyNotifier, String>(BaseCurrencyNotifier.new);

class BaseCurrencyNotifier extends Notifier<String> {
  @override
  String build() {
    _load();
    return kDefaultBaseCurrency;
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(kBaseCurrencyKey);
    if (stored != null && stored.isNotEmpty) state = stored;
  }

  Future<void> set(String code) async {
    final normalised = code.trim().toUpperCase();
    if (normalised.isEmpty) return;
    state = normalised;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(kBaseCurrencyKey, normalised);
  }
}

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

/// Looks up "how many base units per 1 foreign unit", for [CurrencyConverter].
///
/// Rates are stored as quote-per-base. Converting a foreign amount INTO the
/// base therefore needs the reciprocal, and a stored base→foreign row is used
/// in reverse rather than demanding the user enter both directions by hand.
final fxLookupProvider = Provider<Decimal? Function(String)>((ref) {
  final base = ref.watch(baseCurrencyProvider);
  final rates = ref.watch(fxRatesProvider).valueOrNull ?? const <FxRate>[];

  return (String foreign) {
    final f = foreign.toUpperCase();
    if (f == base) return Decimal.one;

    // Newest first, so a fresh live rate wins over an older manual one.
    final sorted = [...rates]
      ..sort((a, b) => b.fetchedAt.compareTo(a.fetchedAt));

    for (final r in sorted) {
      // foreign → base, stored directly.
      if (r.baseCurrency == f && r.quoteCurrency == base) return r.rate;
      // base → foreign, used in reverse.
      if (r.baseCurrency == base &&
          r.quoteCurrency == f &&
          r.rate > Decimal.zero) {
        return (Decimal.one / r.rate).toDecimal(scaleOnInfinitePrecision: 12);
      }
    }
    return null;
  };
});

/// The converter, ready to use. Its existence here is the fix for the defect
/// where `currency_converter.dart` was fully written, fully tested, and
/// imported by nothing.
final currencyConverterProvider =
    Provider<CurrencyConverter>((ref) => const CurrencyConverter());

/// Outcome of a live refresh, for the UI to report honestly.
class FxRefreshResult {
  const FxRefreshResult({
    required this.updated,
    required this.asOf,
    required this.source,
  });

  final int updated;

  /// The date the source published. For ECB reference rates that is the last
  /// working day, which on a weekend is not today.
  final DateTime asOf;

  final String source;
}

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

  /// Fetches every rate against the base currency in one request.
  ///
  /// User-initiated only, like every other network call here. Rows are stamped
  /// with the source's publication date rather than the fetch time, so the
  /// screen can say "as of Friday" on a Sunday instead of implying the rate is
  /// current.
  Future<FxRefreshResult> refreshLive({FxRateProvider? provider}) async {
    final base = _ref.read(baseCurrencyProvider);
    final source = provider ?? FxRateProvider();
    final result = await source.fetch(base);

    final db = _ref.read(databaseProvider);
    final stamp = result.asOf.millisecondsSinceEpoch;
    for (final entry in result.rates.entries) {
      await db.fxRateDao.insertRate(FxRatesCompanion(
        baseCurrency: Value(base),
        quoteCurrency: Value(entry.key),
        rate: Value(entry.value),
        source: const Value('ecb'),
        fetchedAt: Value(stamp),
      ));
    }
    _ref.invalidate(fxRatesProvider);
    return FxRefreshResult(
      updated: result.rates.length,
      asOf: result.asOf,
      source: source.providerName,
    );
  }
}
