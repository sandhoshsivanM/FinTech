import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/domain/entities/asset_group.dart';
import 'package:khazana/domain/entities/holding.dart';
import 'package:khazana/domain/services/tax_rule_engine.dart';

/// Guards the three couplings that make [AssetType] load-bearing. Each of these
/// used to be able to break silently.
void main() {
  group('AssetType.fromKey', () {
    test('parses every declared key', () {
      for (final t in AssetType.values) {
        expect(AssetType.fromKey(t.key), t, reason: 'round-trip for ${t.key}');
      }
    });

    test('throws on an unknown key instead of falling back to equity', () {
      // Regression: this previously returned AssetType.equityEtf, so a row
      // written by a newer build was read back as equity and taxed wrongly.
      expect(() => AssetType.fromKey('no_such_type'), throwsArgumentError);
      expect(() => AssetType.fromKey(''), throwsArgumentError);
    });

    test('tryFromKey returns null on an unknown key', () {
      expect(AssetType.tryFromKey('no_such_type'), isNull);
      expect(AssetType.tryFromKey('equity_mf'), AssetType.equityMf);
    });

    test('keys are unique', () {
      final keys = AssetType.values.map((t) => t.key).toList();
      expect(keys.toSet().length, keys.length);
    });
  });

  group('assets/tax_rules.json', () {
    // Read the shipped asset directly — rootBundle would need a binding, and
    // the point of this test is to check the REAL file, not a fixture.
    final json = jsonDecode(File('assets/tax_rules.json').readAsStringSync())
        as Map<String, dynamic>;
    final rules = TaxRules.fromJson(json);

    test('has a rule for every AssetType', () {
      for (final t in AssetType.values) {
        expect(rules.rules.containsKey(t.key), isTrue,
            reason: 'assets/tax_rules.json is missing a rule for "${t.key}" — '
                'gain computation would throw for this asset type');
      }
    });

    test('has no rule for an unknown asset type', () {
      final known = AssetType.values.map((t) => t.key).toSet();
      expect(rules.rules.keys.where((k) => !known.contains(k)), isEmpty,
          reason: 'orphaned rule key(s) — no AssetType maps to them');
    });

    test('equity MF is taxed like equity, not like debt', () {
      final equity = rules.rules[AssetType.equityEtf.key]!;
      final equityMf = rules.rules[AssetType.equityMf.key]!;
      expect(equityMf.stcgRate, equity.stcgRate);
      expect(equityMf.ltcgRate, equity.ltcgRate);
      expect(equityMf.ltcgThresholdMonths, equity.ltcgThresholdMonths);
      expect(equityMf.ltcgExemptionInr, equity.ltcgExemptionInr);
    });

    test('cash attracts no capital gain', () {
      final cash = rules.rules[AssetType.cash.key]!;
      expect(cash.stcgRate, 0.0);
      expect(cash.ltcgRate, 0.0);
    });
  });

  group('AssetGroup', () {
    test('maps every AssetType to a group', () {
      for (final t in AssetType.values) {
        expect(() => AssetGroup.of(t), returnsNormally);
      }
    });

    test('every group is reachable from at least one AssetType', () {
      final reached = AssetType.values.map(AssetGroup.of).toSet();
      expect(reached, containsAll(AssetGroup.values));
    });

    test('equity types group together, debt types group together', () {
      expect(AssetGroup.of(AssetType.equityEtf), AssetGroup.equity);
      expect(AssetGroup.of(AssetType.equityMf), AssetGroup.equity);
      expect(AssetGroup.of(AssetType.debtMf), AssetGroup.debt);
      expect(AssetGroup.of(AssetType.bond), AssetGroup.debt);
    });

    test('render order covers every group exactly once', () {
      // The palette only clears the colourblind gates on this fixed adjacency,
      // so the order must stay complete and duplicate-free.
      expect(kAssetGroupOrder.length, AssetGroup.values.length);
      expect(kAssetGroupOrder.toSet().length, kAssetGroupOrder.length);
    });
  });
}
