import 'dart:convert';

import 'package:decimal/decimal.dart';

import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/data_providers.dart';
import '../../../domain/services/market_data.dart';
import '../../../domain/services/portfolio_diff.dart';
import '../../../domain/services/tax_rule_engine.dart';
import '../data/price_providers.dart';
import '../../../core/security/secure_storage.dart';
import 'portfolio_providers.dart';

const _secureStorage = appSecureStorage;

/// Builds the market-data fallback chain using stored API keys (PRD §9B), with
/// a cache seeded from the last price recorded for each instrument.
///
/// The cache used to be seeded from `Holdings.lastPrice`, a column with no
/// timestamp — so the last-resort provider could return a price of unknown age
/// as though it were current. `InstrumentPrices` rows carry an `asOf`, which is
/// what makes the staleness the UI shows a real number.
final marketDataServiceProvider =
    FutureProvider<MarketDataService>((ref) async {
  final avKey = await _secureStorage.read(key: 'mkt_alphavantage_key');
  final tdKey = await _secureStorage.read(key: 'mkt_twelvedata_key');

  final repo = ref.watch(portfolioRepositoryProvider);
  final vaultId = ref.watch(currentVaultIdProvider);
  final instruments = await repo.instruments(vaultId);
  final latest = await repo.latestPrices(vaultId);
  final cache = <String, Decimal>{};
  for (final i in instruments) {
    final ticker = i.tickerSymbol;
    final p = latest[i.id];
    if (ticker != null && p != null) cache[ticker] = p.price;
  }

  // Priority order (PRD §9B). User-configurable order is a settings concern.
  return MarketDataService([
    YahooFinanceProvider(),
    AlphaVantageProvider(avKey),
    TwelveDataProvider(tdKey),
    CachedPriceProvider(cache),
  ]);
});

final portfolioDiffEngineProvider =
    Provider<PortfolioDiffEngine>((ref) => const PortfolioDiffEngine());

/// Loads + parses the bundled tax config (PRD §6A). Re-reads on next launch
/// after the JSON is updated — no code change needed for rate changes.
final taxRuleEngineProvider = FutureProvider<TaxRuleEngine>((ref) async {
  final raw = await rootBundle.loadString('assets/tax_rules.json');
  return TaxRuleEngine(
      TaxRules.fromJson(jsonDecode(raw) as Map<String, dynamic>));
});
