import 'dart:convert';

import 'package:decimal/decimal.dart';
import 'package:http/http.dart' as http;

import '../../../domain/services/market_data.dart';

/// Yahoo Finance (unofficial, no API key) — primary provider (PRD §9B).
/// The request URL contains only ticker symbols — zero user data (PRD §9B).
class YahooFinanceProvider implements MarketDataProvider {
  YahooFinanceProvider({http.Client? client}) : _client = client ?? http.Client();
  final http.Client _client;

  @override
  String get providerName => 'Yahoo Finance';

  @override
  Future<bool> isAvailable() async => true;

  @override
  Future<Map<String, Decimal>> fetchPrices(List<String> tickers) async {
    final out = <String, Decimal>{};
    for (final t in tickers) {
      final uri = Uri.parse(
          'https://query1.finance.yahoo.com/v8/finance/chart/$t?interval=1d&range=1d');
      final res = await _client.get(uri);
      if (res.statusCode != 200) continue;
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      final result = (json['chart']?['result'] as List?)?.firstOrNull;
      final price = result?['meta']?['regularMarketPrice'];
      if (price != null) {
        final d = Decimal.tryParse(price.toString());
        if (d != null) out[t] = d;
      }
    }
    if (out.isEmpty) throw Exception('Yahoo returned no prices');
    return out;
  }
}

/// AlphaVantage — fallback (PRD §9B). 25 req/day free; user supplies the key.
class AlphaVantageProvider implements MarketDataProvider {
  AlphaVantageProvider(this.apiKey, {http.Client? client})
      : _client = client ?? http.Client();
  final String? apiKey;
  final http.Client _client;

  @override
  String get providerName => 'AlphaVantage';

  @override
  Future<bool> isAvailable() async => apiKey != null && apiKey!.isNotEmpty;

  @override
  Future<Map<String, Decimal>> fetchPrices(List<String> tickers) async {
    final out = <String, Decimal>{};
    for (final t in tickers) {
      final uri = Uri.parse(
          'https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=$t&apikey=$apiKey');
      final res = await _client.get(uri);
      if (res.statusCode != 200) continue;
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      final price = json['Global Quote']?['05. price'];
      final d = price == null ? null : Decimal.tryParse(price.toString());
      if (d != null) out[t] = d;
    }
    if (out.isEmpty) throw Exception('AlphaVantage returned no prices');
    return out;
  }
}

/// TwelveData — fallback (PRD §9B). 8 req/min free; user supplies the key.
class TwelveDataProvider implements MarketDataProvider {
  TwelveDataProvider(this.apiKey, {http.Client? client})
      : _client = client ?? http.Client();
  final String? apiKey;
  final http.Client _client;

  @override
  String get providerName => 'TwelveData';

  @override
  Future<bool> isAvailable() async => apiKey != null && apiKey!.isNotEmpty;

  @override
  Future<Map<String, Decimal>> fetchPrices(List<String> tickers) async {
    final out = <String, Decimal>{};
    for (final t in tickers) {
      final uri = Uri.parse(
          'https://api.twelvedata.com/price?symbol=$t&apikey=$apiKey');
      final res = await _client.get(uri);
      if (res.statusCode != 200) continue;
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      final d = json['price'] == null
          ? null
          : Decimal.tryParse(json['price'].toString());
      if (d != null) out[t] = d;
    }
    if (out.isEmpty) throw Exception('TwelveData returned no prices');
    return out;
  }
}

/// Last-resort cache (PRD §9B): always returns the last successfully fetched
/// prices. Never throws after the first fetch.
class CachedPriceProvider implements MarketDataProvider {
  CachedPriceProvider(this._cache);
  final Map<String, Decimal> _cache;

  @override
  String get providerName => 'Cached';

  @override
  Future<bool> isAvailable() async => _cache.isNotEmpty;

  @override
  Future<Map<String, Decimal>> fetchPrices(List<String> tickers) async {
    return {
      for (final t in tickers)
        if (_cache.containsKey(t)) t: _cache[t]!,
    };
  }
}
