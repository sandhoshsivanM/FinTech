import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_domain/entities/holding.dart';
import 'package:khazana_domain/services/asset_hints.dart';

/// Twin of `webapp/src/domain/assetHints.test.ts`. Both run the cases in
/// `test/fixtures/asset_hint_cases.json`.
void main() {
  final fixture =
      jsonDecode(File('test/fixtures/asset_hint_cases.json').readAsStringSync())
          as Map<String, dynamic>;

  test('the two copies of the fixture are byte-identical', () {
    // If this fails, copy test/fixtures/asset_hint_cases.json over
    // webapp/src/domain/__fixtures__/asset_hint_cases.json.
    expect(
      File(
        'webapp/src/domain/__fixtures__/asset_hint_cases.json',
      ).readAsBytesSync(),
      File('test/fixtures/asset_hint_cases.json').readAsBytesSync(),
    );
  });

  group('suggestAssetType', () {
    for (final c in (fixture['cases'] as List).cast<Map<String, dynamic>>()) {
      test(c['name'], () {
        expect(
          suggestAssetType(c['symbol'] as String, c['title'] as String)?.key,
          c['expect'],
        );
      });
    }
  });

  group('misfiledAs', () {
    for (final c
        in (fixture['misfiled'] as List).cast<Map<String, dynamic>>()) {
      test(c['name'], () {
        expect(
          misfiledAs(
            AssetType.fromKey(c['type'] as String),
            c['symbol'] as String,
            c['title'] as String,
          )?.key,
          c['expect'],
        );
      });
    }
  });
}
