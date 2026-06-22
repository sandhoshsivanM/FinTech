import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

import '../../../core/di/data_providers.dart';
import '../../../domain/entities/holding.dart';
import '../../../domain/services/market_data.dart';
import '../../../domain/services/portfolio_diff.dart';
import '../../../domain/services/tax_rule_engine.dart';
import '../../import/broker_parser.dart';
import '../data/price_providers.dart';

const _uuid = Uuid();

const _secureStorage = FlutterSecureStorage(
  iOptions: IOSOptions(
    accessibility: KeychainAccessibility.first_unlock_this_device,
  ),
);

/// Builds the provider fallback chain using stored API keys (PRD §9B) and a
/// cache seeded from current holdings' last known prices.
final marketDataServiceProvider =
    FutureProvider<MarketDataService>((ref) async {
  final avKey = await _secureStorage.read(key: 'mkt_alphavantage_key');
  final tdKey = await _secureStorage.read(key: 'mkt_twelvedata_key');
  final holdings = ref.read(holdingListProvider).valueOrNull ?? const [];
  final cache = {
    for (final h in holdings)
      if (h.lastPrice != null) h.tickerSymbol: h.lastPrice!,
  };
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

/// Streams the vault's holdings.
final holdingListProvider = StreamProvider<List<Holding>>((ref) {
  return ref
      .watch(holdingRepositoryProvider)
      .watch(ref.watch(currentVaultIdProvider));
});

/// Aggregate portfolio totals (PRD §14 holdings dashboard).
class PortfolioTotals {
  const PortfolioTotals({required this.invested, required this.market});
  final dynamic invested; // Decimal
  final dynamic market; // Decimal
}

final portfolioImportProvider =
    Provider<PortfolioImporter>((ref) => PortfolioImporter(ref));

class PortfolioImporter {
  PortfolioImporter(this._ref);
  final Ref _ref;

  /// Parses [bytes] with [parser] and reconciles against current holdings.
  Future<PortfolioDiff> preview(IBrokerParser parser, Uint8List bytes) async {
    final staged = parser.parse(bytes);
    final existing = await _ref
        .read(holdingRepositoryProvider)
        .getAll(_ref.read(currentVaultIdProvider));
    return _ref.read(portfolioDiffEngineProvider).diff(existing, staged);
  }

  /// Applies a previewed diff: inserts added, updates changed (idempotent —
  /// unchanged rows are skipped). PRD §14/§16.
  Future<void> apply(PortfolioDiff diff) async {
    final repo = _ref.read(holdingRepositoryProvider);
    final vaultId = _ref.read(currentVaultIdProvider);
    final now = DateTime.now();
    for (final c in diff.added) {
      await repo.save(Holding(
        id: _uuid.v4(),
        vaultId: vaultId,
        symbol: c.staged.symbol,
        exchange: c.staged.exchange,
        quantity: c.staged.quantity,
        avgCost: c.staged.avgCost,
        firstPurchaseDate: now,
        assetType: c.staged.assetType,
      ));
    }
    for (final c in diff.changed) {
      final existing = c.existing!;
      await repo.save(existing.copyWith(
        quantity: c.staged.quantity,
        avgCost: c.staged.avgCost,
      ));
    }
  }

  /// Fetches live prices through the fallback chain and updates holdings
  /// (PRD §9). Returns the provider that answered, or null on total failure.
  Future<String?> refreshPrices() async {
    final repo = _ref.read(holdingRepositoryProvider);
    final vaultId = _ref.read(currentVaultIdProvider);
    final holdings = await repo.getAll(vaultId);
    if (holdings.isEmpty) return null;
    final service = await _ref.read(marketDataServiceProvider.future);
    final tickers = holdings.map((h) => h.tickerSymbol).toList();
    try {
      final prices = await service.fetchPrices(tickers);
      for (final h in holdings) {
        final p = prices[h.tickerSymbol];
        if (p != null) await repo.save(h.copyWith(lastPrice: p));
      }
      return await service.activeProvider();
    } on MarketDataUnavailableException {
      return null;
    }
  }
}
