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

  static const _defaultEndpoint = 'https://www.amfiindia.com/spages/NAVAll.txt';

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

  /// Parses the AMFI NAVAll format.
  ///
  /// The file is semicolon-delimited with interleaved AMC and scheme-type
  /// headings, so any line that is not a data row is skipped:
  ///
  ///   Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
  ///   119551;INF209K01157;INF209K01165;Aditya Birla ...;123.4567;30-Jul-2026
  ///
  /// Static and pure so it can be tested without any network access.
  static Map<String, AmfiNav> parse(String body) {
    final out = <String, AmfiNav>{};

    for (final rawLine in body.split('\n')) {
      final line = rawLine.trim();
      if (line.isEmpty) continue;

      final parts = line.split(';');
      // Data rows have 6 fields; headings and AMC names do not.
      if (parts.length < 5) continue;

      final schemeCode = parts[0].trim();
      // The header row starts with the literal "Scheme Code".
      if (schemeCode.isEmpty || int.tryParse(schemeCode) == null) continue;

      final navRaw = parts[4].trim();
      final nav = _decimal(navRaw);
      // Suspended or newly launched schemes carry "N.A." — skipped rather than
      // recorded as zero, which would read as a 100% loss.
      if (nav == null || nav <= Decimal.zero) continue;

      final isin = _firstNonEmpty([parts[1].trim(), parts[2].trim()]);

      out[schemeCode] = AmfiNav(
        schemeCode: schemeCode,
        schemeName: parts[3].trim(),
        nav: nav,
        isin: isin,
        date: parts.length > 5 ? _date(parts[5].trim()) : null,
      );
    }

    return out;
  }

  void close() => _client.close();

  static String? _firstNonEmpty(List<String> values) {
    for (final v in values) {
      if (v.isNotEmpty && v != '-') return v;
    }
    return null;
  }

  static Decimal? _decimal(String raw) {
    if (raw.isEmpty) return null;
    try {
      return Decimal.parse(raw);
    } on FormatException {
      return null; // "N.A." and friends
    }
  }

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

class AmfiUnavailableException implements Exception {
  const AmfiUnavailableException(this.message);
  final String message;
  @override
  String toString() => 'AmfiUnavailableException: $message';
}
