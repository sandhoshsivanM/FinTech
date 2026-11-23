import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Biometric unlock on Android needs MainActivity to be a FragmentActivity.
///
/// local_auth shows Android's BiometricPrompt, which can only attach to a
/// FragmentActivity. On a plain FlutterActivity every authenticate() call
/// fails with no_fragment_activity before any prompt appears. Nothing fails
/// at build time and nothing crashes, so the only symptom was testers seeing
/// "Biometric failed" every time. This test is the build-time check.
void main() {
  test('MainActivity extends FlutterFragmentActivity', () {
    final src = File(
      'android/app/src/main/kotlin/com/khazana/app/MainActivity.kt',
    ).readAsStringSync();
    expect(
      RegExp(r'class MainActivity\s*:\s*FlutterFragmentActivity\(\)')
          .hasMatch(src),
      isTrue,
      reason: 'MainActivity must extend FlutterFragmentActivity, or biometric '
          'unlock fails on every Android phone (local_auth: no_fragment_activity)',
    );
  });
}
