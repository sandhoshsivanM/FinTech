import 'dart:convert';

import 'package:decimal/decimal.dart';
import 'package:http/http.dart' as http;

/// Thrown when the rate source cannot be reached or returns something unusable.
class FxUnavailableException implements Exception {
  const FxUnavailableException(this.message);
  final String message;
  @override
  String toString() => 'FX rates unavailable: $message';
}

/// Fetches reference exchange rates from Frankfurter, a free wrapper over the
/// European Central Bank's daily reference rates.
///
/// Why this source:
///   * **Free, no key, no sign-up**, matching the free-tier-first rule the rest
///     of the pricing pipeline follows.
///   * **One request returns every currency**, so it reveals nothing about
///     which currencies you actually hold — the same privacy property that made
///     AMFI's whole-file download the right choice for fund NAVs. A
///     per-currency endpoint would leak your portfolio's shape one call at a
///     time.
///   * **ECB reference rates**, published once per working day. That is a
///     genuine limitation and the UI must not imply otherwise: these are daily
///     reference rates, not live dealing rates, and they do not move on
///     weekends or ECB holidays.
///
/// Like every other network call in this app, nothing here runs automatically.
class FxRateProvider {
  FxRateProvider({http.Client? client, Uri Function(String)? endpoint})
      : _client = client ?? http.Client(),
        _endpoint = endpoint ?? _defaultEndpoint;

  static Uri _defaultEndpoint(String base) =>
      Uri.parse('https://api.frankfurter.dev/v1/latest?base=$base');

  final http.Client _client;
  final Uri Function(String) _endpoint;

  String get providerName => 'ECB (Frankfurter)';

  /// Rates expressed as **quote units per 1 [base] unit**, matching
  /// [FxRate.rate]'s documented direction.
  ///
  /// Returns the date the source published, not the time of the request. A
  /// Saturday fetch returns Friday's rates, and calling that "just now" would
  /// be the same lie as stamping a mutual-fund NAV with the fetch time.
  Future<({Map<String, Decimal> rates, DateTime asOf})> fetch(
      String base) async {
    final http.Response response;
    try {
      response = await _client.get(_endpoint(base.toUpperCase()));
    } on Object catch (e) {
      throw FxUnavailableException('$e');
    }
    if (response.statusCode != 200) {
      throw FxUnavailableException('HTTP ${response.statusCode}');
    }

    final Map<String, dynamic> body;
    try {
      body = jsonDecode(response.body) as Map<String, dynamic>;
    } on Object {
      throw const FxUnavailableException('malformed response');
    }

    final raw = body['rates'];
    if (raw is! Map) {
      throw const FxUnavailableException('no rates in response');
    }

    final rates = <String, Decimal>{};
    for (final entry in raw.entries) {
      final value = entry.value;
      // Parsed via toString so a JSON double never becomes binary-float money.
      final parsed = Decimal.tryParse(value.toString());
      // A zero or negative rate is not a rate. Skipping beats storing a divisor
      // that would silently zero out a currency's contribution to net worth.
      if (parsed == null || parsed <= Decimal.zero) continue;
      rates[entry.key.toString().toUpperCase()] = parsed;
    }
    if (rates.isEmpty) {
      throw const FxUnavailableException('no usable rates in response');
    }

    final asOf = DateTime.tryParse((body['date'] ?? '').toString());
    return (rates: rates, asOf: asOf ?? DateTime.now());
  }
}
