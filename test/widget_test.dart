// Branding regression guard.
//
// This file used to be the stock `flutter create` counter test, pumping a
// `MyApp` widget that never existed in this codebase — so it could not compile
// and `flutter test` failed on it. Replaced with assertions that protect the
// rebrand invariants instead.

import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/core/branding.dart';

void main() {
  group('branding', () {
    test('product name is Khazana', () {
      expect(kAppName, 'Khazana');
    });

    test('backup extension stays .ftos', () {
      // FROZEN: paired with the 0x46544F53 ("FTOS") magic in the backup header.
      // Changing this makes every existing backup unrestorable.
      expect(kBackupExtension, '.ftos');
    });

    test('tagline is present', () {
      expect(kAppTagline, isNotEmpty);
    });
  });
}
