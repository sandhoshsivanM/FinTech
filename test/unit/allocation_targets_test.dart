import 'dart:convert';
import 'dart:io';

import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_domain/entities/asset_group.dart';
import 'package:khazana_domain/entities/holding.dart';
import 'package:khazana_domain/services/allocation_targets.dart';

/// Twin of `webapp/src/domain/allocation.test.ts`. Both run the cases in
/// `test/fixtures/allocation_cases.json`.
void main() {
  final fixture = jsonDecode(
          File('test/fixtures/allocation_cases.json').readAsStringSync())
      as Map<String, dynamic>;

  AssetGroup groupOf(String k) => AssetGroup.values.byName(_camel(k));
  Map<AssetGroup, int> targets(Map raw) =>
      {for (final e in raw.entries) groupOf(e.key as String): e.value as int};
  Decimal d(Object? v) => Decimal.parse(v as String);

  test('the two copies of the fixture are byte-identical', () {
    // If this fails, copy test/fixtures/allocation_cases.json over
    // webapp/src/domain/__fixtures__/allocation_cases.json.
    expect(
      File('webapp/src/domain/__fixtures__/allocation_cases.json')
          .readAsBytesSync(),
      File('test/fixtures/allocation_cases.json').readAsBytesSync(),
    );
  });

  for (final c in (fixture['cases'] as List).cast<Map<String, dynamic>>()) {
    test(c['name'], () {
      final r = targetVsActual(
        [
          for (final h in (c['holdings'] as List).cast<Map>())
            AllocationInput(AssetType.fromKey(h['type'] as String), d(h['value'])),
        ],
        targets(c['targets'] as Map),
        tolerance: Decimal.fromInt((c['tolerance'] as int?) ?? 2),
      );
      final e = c['expect'] as Map<String, dynamic>;
      expect(r.total, d(e['total']));
      expect(r.targetsTotal, e['targetsTotal']);
      expect(r.hasTargets, e['hasTargets']);
      expect(suggestTargets(r), targets(e['suggested'] as Map));

      final rows = (e['rows'] as List).cast<Map<String, dynamic>>();
      expect(r.rows.map((x) => x.group.name),
          rows.map((x) => _camel(x['group'] as String)));
      for (var i = 0; i < rows.length; i++) {
        final want = rows[i], got = r.rows[i];
        final at = '${want['group']}';
        expect(got.value, d(want['value']), reason: at);
        expect(got.actualPct, d(want['actualPct']), reason: at);
        expect(got.targetPct, want['targetPct'], reason: at);
        expect(got.targetValue, d(want['targetValue']), reason: at);
        expect(got.gapPct, d(want['gapPct']), reason: at);
        expect(got.status.key, want['status'], reason: at);
        expect(got.amount, d(want['amount']), reason: at);
        final kids = (want['children'] as List).cast<Map<String, dynamic>>();
        expect(got.children.map((k) => k.type.key), kids.map((k) => k['type']),
            reason: at);
        for (var j = 0; j < kids.length; j++) {
          expect(got.children[j].value, d(kids[j]['value']), reason: at);
          expect(got.children[j].actualPct, d(kids[j]['actualPct']), reason: at);
          expect(got.children[j].count, kids[j]['count'], reason: at);
        }
      }
    });
  }

  group('validateTargets', () {
    test('accepts targets totalling 100', () {
      expect(validateTargets({AssetGroup.equity: 70, AssetGroup.debt: 30}),
          isNull);
    });
    test('names the total when it is not 100', () {
      expect(validateTargets({AssetGroup.equity: 70, AssetGroup.debt: 20}),
          'Targets add up to 90%. They must total 100%.');
    });
    test('rejects a negative target', () {
      expect(
          validateTargets({AssetGroup.equity: 110, AssetGroup.debt: -10}),
          isNotNull);
    });
  });

  test('digital gold and silver sit in the Gold & commodities group', () {
    expect(AssetGroup.of(AssetType.digitalGold), AssetGroup.gold);
    expect(AssetGroup.of(AssetType.silver), AssetGroup.gold);
    expect(AssetGroup.gold.label, 'Gold & commodities');
  });
}

String _camel(String snake) {
  final p = snake.split('_');
  return p.first + p.skip(1).map((s) => s[0].toUpperCase() + s.substring(1)).join();
}
