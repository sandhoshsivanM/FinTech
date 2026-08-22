import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/domain/entitlement/entitlement.dart';
import 'package:khazana/domain/entitlement/feature_gate.dart';
import 'package:khazana/domain/entitlement/pro_feature.dart';

/// The Free/Pro split, and the promises inside it.
///
/// `docs/pro-gates.json` is the contract shared with the web client. It is
/// loaded here and by `webapp/src/lib/entitlement/gates.test.ts`, so the two
/// clients cannot quietly come to disagree about what money buys — the same
/// anti-drift device already used for `test/fixtures/health_cases.json`.
///
/// The half of this file that matters most is the negative half. A comment
/// saying "never gate backup" is worth nothing in two years; a test that fails
/// the build is worth something.
void main() {
  final spec = jsonDecode(
    File('docs/pro-gates.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  // JSON has no comments, so the spec uses `$`-prefixed keys to explain
  // itself. They are documentation, not features.
  final features = Map<String, dynamic>.fromEntries(
    (spec['features'] as Map<String, dynamic>)
        .entries
        .where((e) => !e.key.startsWith(r'$')),
  );
  final alwaysFreeSpec =
      ((spec['alwaysFree'] as Map)['features'] as List).cast<String>();

  const free = Entitlement.free;
  const pro = Entitlement(isPro: true, source: ProSource.appStore);

  group('the promises that must never be broken', () {
    test('every always-free feature is allowed on the free tier', () {
      for (final f in kAlwaysFree) {
        expect(
          gateFor(f, free).allowed,
          isTrue,
          reason: '$f must never be gated. Backup, restore, a plain CSV dump, '
              'erase-all-data, the lock and the diagnostics are promises in '
              'writing — nothing that gets a user\'s own data out of the app, '
              'or keeps it safe, is ever behind a payment.',
        );
      }
    });

    test('always-free features report alwaysFree, not merely included', () {
      // The distinction is load-bearing: `includedInFree` is a product decision
      // that could reasonably change, `alwaysFree` is a commitment that cannot.
      for (final f in kAlwaysFree) {
        expect(gateFor(f, free).reason, GateReason.alwaysFree);
      }
    });

    test('no always-free feature is also listed as Pro', () {
      expect(kAlwaysFree.intersection(kProFeatures), isEmpty);
    });

    test('the ledger is uncapped — there is no transaction limit to find', () {
      // A capped ledger reports wrong totals, and every derived number (net
      // worth, budgets, the health score) inherits the lie. If a cap is ever
      // added, it will need a constant, and this test is where to argue first.
      expect(gateFor(ProFeature.manualEntry, free).allowed, isTrue);
      expect(ProAllowances.freeProfiles, 1);
      expect(ProAllowances.freeCommittedImports, 1);
    });
  });

  group('agreement with docs/pro-gates.json', () {
    test('every enum value appears in the spec', () {
      for (final f in ProFeature.values) {
        expect(features.containsKey(f.name), isTrue,
            reason: '${f.name} is missing from docs/pro-gates.json');
      }
    });

    test('every spec key appears in the enum', () {
      for (final key in features.keys) {
        expect(ProFeature.values.map((f) => f.name), contains(key),
            reason: '$key is in the spec but has no ProFeature');
      }
    });

    test('the tier of every feature matches the spec', () {
      for (final entry in features.entries) {
        final feature =
            ProFeature.values.firstWhere((f) => f.name == entry.key);
        final tier = (entry.value as Map)['tier'] as String;
        final allowedOnFree = gateFor(feature, free).allowed;

        expect(allowedOnFree, tier == 'free',
            reason: '${entry.key}: spec says "$tier" but the gate '
                '${allowedOnFree ? "allows" : "denies"} it on the free tier');
      }
    });

    test('the always-free list matches the spec exactly', () {
      expect(
        kAlwaysFree.map((f) => f.name).toSet(),
        alwaysFreeSpec.toSet(),
      );
    });
  });

  group('Pro unlocks everything', () {
    test('no feature is denied to a Pro entitlement', () {
      for (final f in ProFeature.values) {
        expect(gateFor(f, pro).allowed, isTrue, reason: '$f denied to Pro');
      }
    });

    test('Pro features report unlocked rather than free', () {
      expect(gateFor(ProFeature.taxCentre, pro).reason, GateReason.unlocked);
    });
  });

  group('free tier', () {
    test('Pro features are denied with needsPro', () {
      for (final f in kProFeatures) {
        final d = gateFor(f, free);
        expect(d.allowed, isFalse, reason: '$f should need Pro');
        expect(d.reason, GateReason.needsPro);
      }
    });

    test('ordinary free features are included, not "always free"', () {
      expect(gateFor(ProFeature.dashboard, free).reason,
          GateReason.includedInFree);
    });
  });

  group('counted allowances', () {
    test('the first import is free, the second needs Pro', () {
      expect(gateForImport(free, used: 0).allowed, isTrue);

      final second = gateForImport(free, used: 1);
      expect(second.allowed, isFalse);
      // Not `needsPro`: it *was* available a moment ago. Saying "this is a Pro
      // feature" to someone who just used their free import is untrue, and
      // reads as a bait-and-switch.
      expect(second.reason, GateReason.allowanceUsed);
    });

    test('Pro imports are unlimited', () {
      expect(gateForImport(pro, used: 99).allowed, isTrue);
    });

    test('the first profile is free, the second needs Pro', () {
      expect(gateForProfile(free, existing: 0).allowed, isTrue);
      expect(gateForProfile(free, existing: 1).reason,
          GateReason.allowanceUsed);
      expect(gateForProfile(pro, existing: 12).allowed, isTrue);
    });
  });
}
