import 'package:decimal/decimal.dart';

/// A money amount tagged with its currency.
class Money2 {
  const Money2(this.amount, this.currency);
  final Decimal amount;
  final String currency;
}

/// Cross-currency net worth result (PRD §12D).
class NetWorthInBase {
  const NetWorthInBase({
    required this.baseCurrency,
    required this.total,
    required this.perCurrency,
    required this.missingRates,
  });

  final String baseCurrency;
  final Decimal total;
  final Map<String, Decimal> perCurrency; // currency → base-converted subtotal
  final Set<String> missingRates; // currencies with no rate available
}

/// Pure-Dart currency math (PRD §12D). Rate lookup is injected so the FX
/// source (ECB / manual) stays in the data layer.
class CurrencyConverter {
  const CurrencyConverter();

  /// PRD §12D step 2: base_amount = foreign_amount × rate, where [rate] is the
  /// number of base-currency units per 1 unit of the foreign currency.
  Decimal toBase(Decimal foreignAmount, Decimal foreignToBaseRate) =>
      foreignAmount * foreignToBaseRate;

  /// Converts a mixed-currency set of amounts to [baseCurrency].
  /// [rateLookup] returns base-per-1-foreign, or null if unavailable.
  NetWorthInBase netWorth(
    List<Money2> amounts,
    String baseCurrency,
    Decimal? Function(String foreignCurrency) rateLookup,
  ) {
    var total = Decimal.zero;
    final per = <String, Decimal>{};
    final missing = <String>{};

    for (final m in amounts) {
      if (m.currency == baseCurrency) {
        total += m.amount;
        per[baseCurrency] = (per[baseCurrency] ?? Decimal.zero) + m.amount;
        continue;
      }
      final rate = rateLookup(m.currency);
      if (rate == null) {
        missing.add(m.currency);
        continue; // displayed as '— ' with a tooltip (PRD §12D step 3)
      }
      final converted = toBase(m.amount, rate);
      total += converted;
      per[m.currency] = (per[m.currency] ?? Decimal.zero) + converted;
    }
    return NetWorthInBase(
      baseCurrency: baseCurrency,
      total: total,
      perCurrency: per,
      missingRates: missing,
    );
  }
}
