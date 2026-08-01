import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'package:khazana/domain/services/currency_converter.dart';
import 'package:khazana/features/settings/data/fx_rate_provider.dart';

/// The live FX source, and the direction rates point in.
///
/// Direction is the thing worth testing: a rate used the wrong way round does
/// not crash, it just reports a net worth off by the square of the exchange
/// rate — which for USD/INR is a factor of roughly 7,700.
void main() {
  Decimal d(String s) => Decimal.parse(s);

  const body = '''
{"amount":1.0,"base":"INR","date":"2026-05-29",
 "rates":{"USD":0.012,"EUR":0.011,"GBP":0.0094,"AED":0.044}}
''';

  group('FxRateProvider', () {
    test('parses rates as quote-per-base', () async {
      final result =
          await FxRateProvider(client: _FakeClient(body)).fetch('INR');
      expect(result.rates['USD'], d('0.012'));
      expect(result.rates, hasLength(4));
    });

    test('dates the rates from the source, not the fetch time', () async {
      // ECB publishes per working day. A Sunday fetch returns Friday's rates,
      // and stamping "now" would claim a freshness they do not have.
      final result =
          await FxRateProvider(client: _FakeClient(body)).fetch('INR');
      expect(result.asOf, DateTime.parse('2026-05-29'));
    });

    test('fetches every currency in one request', () async {
      // Both a scale property and a privacy one: a per-currency endpoint would
      // reveal which currencies the user holds, one call at a time.
      final client = _FakeClient(body);
      await FxRateProvider(client: client).fetch('INR');
      expect(client.calls, 1);
    });

    test('parses through strings so money never becomes a binary float',
        () async {
      final result = await FxRateProvider(
        client: _FakeClient(
            '{"date":"2026-05-29","rates":{"USD":0.1234567890123}}'),
      ).fetch('INR');
      expect(result.rates['USD'].toString(), '0.1234567890123');
    });

    test('drops zero and negative rates rather than storing a bad divisor',
        () async {
      final result = await FxRateProvider(
        client: _FakeClient(
            '{"date":"2026-05-29","rates":{"USD":0.012,"XXX":0,"YYY":-1}}'),
      ).fetch('INR');
      expect(result.rates.keys, ['USD']);
    });

    test('an HTTP error is reported, not swallowed', () async {
      expect(
        () => FxRateProvider(client: _FakeClient('', status: 503)).fetch('INR'),
        throwsA(isA<FxUnavailableException>()),
      );
    });

    test('a response with no usable rates throws', () async {
      expect(
        () => FxRateProvider(client: _FakeClient('{"rates":{}}')).fetch('INR'),
        throwsA(isA<FxUnavailableException>()),
      );
    });

    test('malformed JSON throws rather than returning empty', () async {
      expect(
        () => FxRateProvider(client: _FakeClient('not json')).fetch('INR'),
        throwsA(isA<FxUnavailableException>()),
      );
    });
  });

  group('CurrencyConverter', () {
    const converter = CurrencyConverter();

    test('converts foreign amounts into the base', () {
      // rateLookup returns BASE units per 1 FOREIGN unit. 1 USD = 83 INR.
      final result = converter.netWorth(
        [Money2(d('100'), 'USD'), Money2(d('5000'), 'INR')],
        'INR',
        (c) => c == 'USD' ? d('83') : null,
      );
      expect(result.total, d('13300')); // 8300 + 5000
      expect(result.missingRates, isEmpty);
    });

    test('a missing rate is reported, not silently treated as parity', () {
      // The dangerous failure: 100 USD counted as 100 INR would understate net
      // worth by 99%, and look perfectly plausible.
      final result = converter.netWorth(
        [Money2(d('100'), 'USD'), Money2(d('5000'), 'INR')],
        'INR',
        (_) => null,
      );
      expect(result.total, d('5000'));
      expect(result.missingRates, {'USD'});
    });

    test('base-currency amounts need no rate at all', () {
      final result = converter.netWorth(
        [Money2(d('5000'), 'INR')],
        'INR',
        (_) => throw StateError('should not be consulted'),
      );
      expect(result.total, d('5000'));
    });

    test('subtotals are kept per currency', () {
      final result = converter.netWorth(
        [Money2(d('100'), 'USD'), Money2(d('50'), 'USD'), Money2(d('1'), 'INR')],
        'INR',
        (c) => c == 'USD' ? d('83') : null,
      );
      expect(result.perCurrency['USD'], d('12450'));
      expect(result.perCurrency['INR'], d('1'));
    });
  });
}

/// Serves a fixed body and counts requests.
class _FakeClient extends http.BaseClient {
  _FakeClient(this.body, {this.status = 200});

  final String body;
  final int status;
  int calls = 0;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    calls++;
    return http.StreamedResponse(
      Stream.value(body.codeUnits),
      status,
      request: request,
    );
  }
}
