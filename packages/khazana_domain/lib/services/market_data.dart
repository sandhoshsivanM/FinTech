import 'package:decimal/decimal.dart';

/// Thrown when every provider in the chain fails (PRD §9A).
class MarketDataUnavailableException implements Exception {
  const MarketDataUnavailableException();
  @override
  String toString() => 'No market data provider was available.';
}

/// A source of live prices (PRD §9A). Implementations live in the data layer
/// and perform the actual IO; this interface is pure.
abstract interface class MarketDataProvider {
  String get providerName;
  Future<bool> isAvailable();

  /// Returns ticker → price. Tickers carry the NSE (.NS) / BSE (.BO) suffix.
  Future<Map<String, Decimal>> fetchPrices(List<String> tickers);
}

/// Tries providers in priority order, falling through on failure (PRD §9A).
/// Mirrors the PRD's reference implementation.
class MarketDataService {
  MarketDataService(this._providers);

  final List<MarketDataProvider> _providers; // ordered by priority

  Future<Map<String, Decimal>> fetchPrices(List<String> tickers) async {
    for (final provider in _providers) {
      if (await provider.isAvailable()) {
        try {
          return await provider.fetchPrices(tickers);
        } on Exception {
          continue; // try the next provider
        }
      }
    }
    throw const MarketDataUnavailableException();
  }

  /// Which provider currently answers (for the UI "source" label).
  Future<String?> activeProvider() async {
    for (final p in _providers) {
      if (await p.isAvailable()) return p.providerName;
    }
    return null;
  }
}
