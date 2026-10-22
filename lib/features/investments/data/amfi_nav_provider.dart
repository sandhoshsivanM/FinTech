import 'package:decimal/decimal.dart';
import 'package:http/http.dart' as http;

/// A parsed NAV row from AMFI's daily file.
class AmfiNav {
  const AmfiNav({
    required this.schemeCode,
    required this.schemeName,
    required this.nav,
    this.isin,
    this.date,
  });

  final String schemeCode;
  final String schemeName;
  final Decimal nav;
  final String? isin;
  final DateTime? date;
}

/// Fetches mutual-fund NAVs from AMFI's free daily file.
///
/// Why this instead of a per-scheme API:
///   * Privacy. One request downloads the NAV for EVERY scheme in India, so it
///     reveals nothing about which funds you hold. A per-scheme lookup would
///     hand the provider your entire portfolio, one request at a time.
///   * Coverage and cost. It is free, needs no API key, and covers every AMC.
///   * Scale. The existing equity providers issue one sequential HTTP request
///     per ticker, which dies at AlphaVantage's 25-per-day cap and is hopeless
///     for hundreds of schemes. This is a single request regardless of how many
///     funds you own.
///
/// Deliberately NOT wired to run automatically: it is a network call, and this
/// app only touches the network when the user asks it to.
class AmfiNavProvider {
  AmfiNavProvider({http.Client? client, Uri? endpoint})
      : _client = client ?? http.Client(),
        _endpoint = endpoint ?? Uri.parse(_defaultEndpoint);

  /// AMFI moved the file to its portal in 2026. The old www address now
  /// answers with a redirect (still followed by package:http, one round trip
  /// slower), so the portal address is used directly.
  static const _defaultEndpoint =
      'https://portal.amfiindia.com/spages/NAVAll.txt';

  final http.Client _client;
  final Uri _endpoint;

  String get providerName => 'AMFI';

  /// Downloads and parses the whole NAV file, keyed by AMFI scheme code.
  Future<Map<String, AmfiNav>> fetchAll() async {
    final response = await _client.get(_endpoint);
    if (response.statusCode != 200) {
      throw AmfiUnavailableException(
          'AMFI returned HTTP ${response.statusCode}');
    }
    return parse(response.body);
  }

  /// A real row is ~200 characters; anything this long is not one.
  static const maxLineLength = 2048;

  /// Parses the AMFI NAVAll format.
  ///
  /// The file is semicolon-delimited with interleaved AMC and scheme-type
  /// headings, so any line that is not a data row is skipped.
  ///
  /// Columns are found from the **header row**, never assumed by position.
  /// AMFI changed the file in 2026 from six columns to eight:
  ///
  ///   Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date
  ///   135762;INF846K01WO1;-;Axis Children's Fund;Direct Plan;Growth Option;28.9452;21-Oct-2026
  ///
  /// which moved the NAV from the fifth field to the seventh. The old
  /// fixed-position parser then read "Direct Plan" as the NAV and silently
  /// dropped every row, so no fund price refreshed. A file without a header
  /// falls back to the original six-column layout; a header this parser
  /// doesn't recognise yields no rows, so a refresh reports nothing rather
  /// than prices read from the wrong column.
  ///
  /// Mirrors backend/services/MarketData/Khazana.MarketData.Domain/
  /// AmfiNavParser.cs; both read contracts/fixtures/amfi/navall_sample.txt in
  /// their tests. One deliberate difference: this parser keeps a row with no
  /// date (date null), the server skips it because it stores a dated series.
  ///
  /// Static and pure so it can be tested without any network access.
  static Map<String, AmfiNav> parse(String body) {
    final out = <String, AmfiNav>{};
    _AmfiLayout? layout = _AmfiLayout.legacy;

    for (final rawLine in body.split('\n')) {
      if (rawLine.length > maxLineLength) continue;
      final line = rawLine.trim().replaceFirst('﻿', '');
      if (line.isEmpty) continue;

      final parts = line.split(';');
      if (parts.any((f) => f.trim().toLowerCase() == 'scheme code')) {
        layout = _AmfiLayout.fromHeader(parts);
        continue;
      }
      final cols = layout;
      if (cols == null) continue;
      // Data rows have every required column; headings and AMC names do not.
      if (parts.length < cols.requiredFields) continue;

      final schemeCode = parts[cols.code].trim();
      if (!_digits.hasMatch(schemeCode)) continue;

      final nav = _decimal(parts[cols.nav].trim());
      // Suspended or newly launched schemes carry "N.A." — skipped rather than
      // recorded as zero, which would read as a 100% loss.
      if (nav == null || nav <= Decimal.zero) continue;

      out[schemeCode] = AmfiNav(
        schemeCode: schemeCode,
        schemeName: _name(parts, cols),
        nav: nav,
        isin: _firstNonEmpty(
            [parts[cols.isin1].trim(), parts[cols.isin2].trim()]),
        date: parts.length > cols.date ? _date(parts[cols.date].trim()) : null,
      );
    }

    return out;
  }

  static final _digits = RegExp(r'^\d+$');
  static final _plainDecimal = RegExp(r'^\d+(\.\d+)?$');

  /// The 2026 layout splits "Fund - Direct Plan - Growth" into three columns;
  /// they are joined back so one scheme code still reads as one product.
  static String _name(List<String> parts, _AmfiLayout cols) {
    var name = parts[cols.name].trim();
    for (final i in [cols.plan, cols.option]) {
      if (i == null || i >= parts.length) continue;
      final extra = parts[i].trim();
      if (extra.isNotEmpty) name += ' - $extra';
    }
    return name;
  }

  void close() => _client.close();

  static String? _firstNonEmpty(List<String> values) {
    for (final v in values) {
      if (v.isNotEmpty && v != '-') return v;
    }
    return null;
  }

  /// Plain decimals only: "N.A.", exponents ("1e5") and thousands separators
  /// are refused rather than guessed at — the file comes from the internet.
  static Decimal? _decimal(String raw) =>
      _plainDecimal.hasMatch(raw) ? Decimal.parse(raw) : null;

  static DateTime? _date(String raw) {
    // AMFI emits dd-MMM-yyyy.
    const months = {
      'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
      'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    };
    final parts = raw.split('-');
    if (parts.length != 3) return null;
    final day = int.tryParse(parts[0]);
    final month = months[parts[1].toLowerCase()];
    final year = int.tryParse(parts[2]);
    if (day == null || month == null || year == null) return null;
    return DateTime(year, month, day);
  }
}

/// Where each field sits in a row of the NAV file.
class _AmfiLayout {
  const _AmfiLayout({
    required this.code,
    required this.isin1,
    required this.isin2,
    required this.name,
    required this.nav,
    required this.date,
    this.plan,
    this.option,
  });

  /// The original six-column file, used when no header has been seen.
  static const legacy = _AmfiLayout(
      code: 0, isin1: 1, isin2: 2, name: 3, nav: 4, date: 5);

  final int code, isin1, isin2, name, nav, date;
  final int? plan, option;

  /// Every column except the date must be present (a missing date is
  /// tolerated, as it always was).
  int get requiredFields =>
      [code, isin1, isin2, name, nav].reduce((a, b) => a > b ? a : b) + 1;

  /// Maps a header row to column positions, or null when a required column is
  /// missing — better no rows than rows read from the wrong columns.
  static _AmfiLayout? fromHeader(List<String> header) {
    final names = [for (final h in header) h.trim().toLowerCase()];
    int find(String n) => names.indexOf(n);
    final isins = [
      for (var i = 0; i < names.length; i++)
        if (names[i].contains('isin')) i,
    ];
    final code = find('scheme code');
    final name = find('scheme name');
    final nav = find('net asset value');
    final date = find('date');
    final plan = find('plan');
    final option = find('option');
    if (code < 0 || name < 0 || nav < 0 || date < 0 || isins.length < 2) {
      return null;
    }
    return _AmfiLayout(
      code: code,
      isin1: isins[0],
      isin2: isins[1],
      name: name,
      nav: nav,
      date: date,
      plan: plan < 0 ? null : plan,
      option: option < 0 ? null : option,
    );
  }
}

class AmfiUnavailableException implements Exception {
  const AmfiUnavailableException(this.message);
  final String message;
  @override
  String toString() => 'AmfiUnavailableException: $message';
}
