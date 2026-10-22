import 'package:decimal/decimal.dart';

import '../entities/holding.dart';

/// A per-asset-class tax rule (PRD §6A). A 'slab' rate means "as per the user's
/// income slab" — the engine must NOT guess a number (PRD §6B).
class TaxRule {
  const TaxRule({
    required this.stcgRate,
    required this.ltcgRate,
    required this.ltcgThresholdMonths,
    required this.ltcgExemptionInr,
  });

  final double? stcgRate; // null ⇒ slab
  final double? ltcgRate; // null ⇒ slab
  final int ltcgThresholdMonths;
  final Decimal ltcgExemptionInr;

  factory TaxRule.fromJson(Map<String, dynamic> j) => TaxRule(
        stcgRate: _rate(j['stcg_rate']),
        ltcgRate: _rate(j['ltcg_rate']),
        ltcgThresholdMonths: (j['ltcg_threshold_months'] as num).toInt(),
        ltcgExemptionInr:
            Decimal.parse((j['ltcg_exemption_inr'] ?? 0).toString()),
      );

  static double? _rate(Object? v) =>
      (v is num) ? v.toDouble() : null; // "slab" → null
}

/// The versioned tax config (PRD §6A tax_rules.json).
class TaxRules {
  const TaxRules({
    required this.schemaVersion,
    required this.effectiveFrom,
    required this.rules,
  });

  final int schemaVersion;
  final String effectiveFrom;
  final Map<String, TaxRule> rules;

  factory TaxRules.fromJson(Map<String, dynamic> j) => TaxRules(
        schemaVersion: (j['schema_version'] as num).toInt(),
        effectiveFrom: j['effective_from'] as String,
        rules: (j['rules'] as Map<String, dynamic>).map(
          (k, v) => MapEntry(k, TaxRule.fromJson(v as Map<String, dynamic>)),
        ),
      );
}

enum GainType { shortTerm, longTerm }

class GainResult {
  const GainResult({
    required this.gainAmount,
    required this.gainType,
    required this.applicableRate, // null ⇒ slab
    required this.estimatedTax,
  });

  final Decimal gainAmount;
  final GainType gainType;
  final double? applicableRate;
  final Decimal estimatedTax;

  bool get isSlab => applicableRate == null;
  String get rateLabel =>
      isSlab ? 'As per your tax slab' : '${applicableRate!.toStringAsFixed(1)}%';
}

/// Capital-gains engine driven by a versioned config (PRD §6). Pure Dart —
/// rates can change by editing tax_rules.json with no code change.
class TaxRuleEngine {
  const TaxRuleEngine(this.rules);
  final TaxRules rules;

  /// Whole months between two dates (rounds down).
  static int monthsBetween(DateTime from, DateTime to) {
    var months = (to.year - from.year) * 12 + (to.month - from.month);
    if (to.day < from.day) months -= 1;
    return months < 0 ? 0 : months;
  }

  GainResult computeGain({
    required AssetType assetType,
    required DateTime firstPurchaseDate,
    required DateTime saleDate,
    required Decimal buyValue,
    required Decimal saleValue,
  }) {
    final rule = rules.rules[assetType.key] ??
        rules.rules['equity_etf']!; // safe default
    final months = monthsBetween(firstPurchaseDate, saleDate);
    final isLong = months >= rule.ltcgThresholdMonths;
    final gainType = isLong ? GainType.longTerm : GainType.shortTerm;
    final gain = saleValue - buyValue;
    final rate = isLong ? rule.ltcgRate : rule.stcgRate;

    Decimal tax = Decimal.zero;
    if (rate != null && gain > Decimal.zero) {
      final exemption = isLong ? rule.ltcgExemptionInr : Decimal.zero;
      final taxable = gain - exemption;
      if (taxable > Decimal.zero) {
        final t = taxable.toDouble() * rate / 100.0;
        tax = Decimal.parse(t.toStringAsFixed(2));
      }
    }
    return GainResult(
      gainAmount: gain,
      gainType: gainType,
      applicableRate: rate,
      estimatedTax: tax,
    );
  }
}
