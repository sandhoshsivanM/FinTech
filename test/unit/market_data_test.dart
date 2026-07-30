import 'package:decimal/decimal.dart';
import 'package:khazana/domain/services/market_data.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeProvider implements MarketDataProvider {
  _FakeProvider(this.providerName,
      {required this.available, this.prices, this.throws = false});
  @override
  final String providerName;
  final bool available;
  final Map<String, Decimal>? prices;
  final bool throws;

  @override
  Future<bool> isAvailable() async => available;

  @override
  Future<Map<String, Decimal>> fetchPrices(List<String> tickers) async {
    if (throws) throw Exception('boom');
    return prices ?? {};
  }
}

void main() {
  final infy = {'INFY.NS': Decimal.parse('1600')};

  test('uses the first available provider', () async {
    final svc = MarketDataService([
      _FakeProvider('Yahoo', available: true, prices: infy),
      _FakeProvider('Alpha', available: true, prices: {}),
    ]);
    expect(await svc.fetchPrices(['INFY.NS']), infy);
    expect(await svc.activeProvider(), 'Yahoo');
  });

  test('falls through when a provider is unavailable', () async {
    final svc = MarketDataService([
      _FakeProvider('Yahoo', available: false),
      _FakeProvider('Alpha', available: true, prices: infy),
    ]);
    expect(await svc.fetchPrices(['INFY.NS']), infy);
  });

  test('falls through when a provider throws (PRD §9A)', () async {
    final svc = MarketDataService([
      _FakeProvider('Yahoo', available: true, throws: true),
      _FakeProvider('Cached', available: true, prices: infy),
    ]);
    expect(await svc.fetchPrices(['INFY.NS']), infy);
  });

  test('throws MarketDataUnavailable when all fail', () async {
    final svc = MarketDataService([
      _FakeProvider('Yahoo', available: false),
      _FakeProvider('Alpha', available: true, throws: true),
    ]);
    expect(() => svc.fetchPrices(['INFY.NS']),
        throwsA(isA<MarketDataUnavailableException>()));
  });
}
