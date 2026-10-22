import 'package:decimal/decimal.dart';

/// A stored exchange rate (PRD §12C). [rate] = how many [quoteCurrency] units
/// per 1 [baseCurrency] unit.
class FxRate {
  const FxRate({
    required this.baseCurrency,
    required this.quoteCurrency,
    required this.rate,
    required this.source, // 'ecb' | 'manual'
    required this.fetchedAt,
  });

  final String baseCurrency;
  final String quoteCurrency;
  final Decimal rate;
  final String source;
  final DateTime fetchedAt;
}
