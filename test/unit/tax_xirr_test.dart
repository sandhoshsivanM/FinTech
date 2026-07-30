import 'package:decimal/decimal.dart';
import 'package:khazana/domain/entities/holding.dart';
import 'package:khazana/domain/services/tax_rule_engine.dart';
import 'package:khazana/domain/services/xirr_calculator.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  // Mirrors assets/tax_rules.json (PRD §6A).
  final rules = TaxRules.fromJson({
    'schema_version': 3,
    'effective_from': '2024-07-23',
    'rules': {
      'equity_etf': {
        'stcg_rate': 20.0,
        'ltcg_rate': 12.5,
        'ltcg_threshold_months': 12,
        'ltcg_exemption_inr': 125000,
      },
      'debt_mf': {
        'stcg_rate': 'slab',
        'ltcg_rate': 'slab',
        'ltcg_threshold_months': 24,
        'ltcg_exemption_inr': 0,
      },
    },
  });
  final engine = TaxRuleEngine(rules);

  group('TaxRuleEngine (PRD §6)', () {
    test('equity held >12m is long-term, applies 12.5% above 1.25L exemption', () {
      final r = engine.computeGain(
        assetType: AssetType.equityEtf,
        firstPurchaseDate: DateTime(2024, 1, 1),
        saleDate: DateTime(2026, 1, 1), // 24 months
        buyValue: Decimal.parse('100000'),
        saleValue: Decimal.parse('300000'), // gain 200000
      );
      expect(r.gainType, GainType.longTerm);
      expect(r.applicableRate, 12.5);
      // taxable = 200000 - 125000 = 75000 → 12.5% = 9375
      expect(r.estimatedTax, Decimal.parse('9375.00'));
    });

    test('equity held <12m is short-term at 20%', () {
      final r = engine.computeGain(
        assetType: AssetType.equityEtf,
        firstPurchaseDate: DateTime(2026, 1, 1),
        saleDate: DateTime(2026, 6, 1), // 5 months
        buyValue: Decimal.parse('100000'),
        saleValue: Decimal.parse('110000'), // gain 10000
      );
      expect(r.gainType, GainType.shortTerm);
      expect(r.applicableRate, 20.0);
      expect(r.estimatedTax, Decimal.parse('2000.00'));
    });

    test('slab-rated asset reports no numeric rate (PRD §6B: do not guess)', () {
      final r = engine.computeGain(
        assetType: AssetType.debtMf,
        firstPurchaseDate: DateTime(2024, 1, 1),
        saleDate: DateTime(2026, 6, 1),
        buyValue: Decimal.parse('100000'),
        saleValue: Decimal.parse('150000'),
      );
      expect(r.isSlab, isTrue);
      expect(r.rateLabel, 'As per your tax slab');
      expect(r.estimatedTax, Decimal.zero); // not guessed
    });

    test('loss → zero tax', () {
      final r = engine.computeGain(
        assetType: AssetType.equityEtf,
        firstPurchaseDate: DateTime(2026, 1, 1),
        saleDate: DateTime(2026, 3, 1),
        buyValue: Decimal.parse('100000'),
        saleValue: Decimal.parse('80000'),
      );
      expect(r.estimatedTax, Decimal.zero);
    });
  });

  group('XIRR', () {
    test('one year, 10% gain ≈ 10%', () {
      const calc = XirrCalculator();
      final r = calc.compute([
        CashFlow(DateTime(2025, 1, 1), Decimal.parse('-100000')),
        CashFlow(DateTime(2026, 1, 1), Decimal.parse('110000')),
      ]);
      expect(r, isNotNull);
      expect(r!, closeTo(0.10, 0.01));
    });

    test('returns null without both inflow and outflow', () {
      const calc = XirrCalculator();
      expect(
          calc.compute([
            CashFlow(DateTime(2025, 1, 1), Decimal.parse('-100')),
            CashFlow(DateTime(2026, 1, 1), Decimal.parse('-100')),
          ]),
          isNull);
    });
  });
}
