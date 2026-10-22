// Khazana is free for everyone. There is no Pro tier, no paywall, no licence
// key and no in-app purchase, so nothing in the app may be gated.
//
// This replaces the old "backup, restore, export and erase are always free"
// invariant: with no gate left, the invariant is simply that nothing is gated.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/core/router/nav_sections.dart';
import 'package:khazana/presentation/desktop_shell.dart';

/// Anything a paywall would say or link to.
final _paywall = RegExp(
  r'\bPro\b|paywall|licen[cs]e key|unlock|upgrade|/app/pro',
  caseSensitive: false,
);

void main() {
  test('no navigation entry points at a paywall', () {
    for (final item in avatarMenu) {
      expect(item.label, isNot(matches(_paywall)), reason: item.route);
      expect(item.route, isNot(matches(_paywall)));
    }
    for (final route in [...desktopSidebarRoutes, ...phoneReachableRoutes]) {
      expect(route, isNot(matches(_paywall)));
    }
  });

  test('no source file gates, licenses or sells anything', () {
    final banned = RegExp(
      r'ProGate|ProBadge|entitlement_providers|isProProvider|gateProvider|'
      r'pro_feature|feature_gate|pro_copy|kOffersPro|in_app_purchase|'
      r"Khazana Pro|'/app/pro'",
    );
    final offenders = <String>[
      for (final f in Directory('lib').listSync(recursive: true))
        if (f is File &&
            f.path.endsWith('.dart') &&
            banned.hasMatch(f.readAsStringSync()))
          f.path,
    ];
    expect(offenders, isEmpty);
    expect(Directory('lib/features/pro').existsSync(), isFalse);
    expect(Directory('packages/khazana_domain/lib/entitlement').existsSync(), isFalse);
  });

  test('the app ships no billing library', () {
    // Removing in_app_purchase is also what keeps
    // com.android.vending.BILLING out of the merged Android manifest.
    expect(
      File('pubspec.yaml').readAsStringSync(),
      isNot(contains('in_app_purchase')),
    );
    expect(
      File('android/app/src/main/AndroidManifest.xml').readAsStringSync(),
      isNot(contains('BILLING')),
    );
  });
}
