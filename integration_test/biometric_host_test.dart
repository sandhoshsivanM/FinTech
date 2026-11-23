import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:local_auth/local_auth.dart';

/// Device-only. Run on an emulator with NO screen lock:
///
///   flutter test integration_test/biometric_host_test.dart --flavor play
///
/// local_auth checks that the host activity is a FragmentActivity before it
/// looks at the device. On a plain FlutterActivity it answers
/// no_fragment_activity, which is why biometric unlock failed on every phone.
/// With no screen lock the fixed build gets past that check and is told
/// NotAvailable instead, without showing a prompt that would wait for a finger.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  // No app.main(): the test already runs inside MainActivity, which is what
  // local_auth inspects.
  testWidgets('the biometric prompt can attach to MainActivity', (tester) async {
    String? code;
    try {
      await LocalAuthentication().authenticate(localizedReason: 'test');
    } on PlatformException catch (e) {
      code = e.code;
    }
    expect(code, isNot('no_fragment_activity'),
        reason: 'MainActivity must extend FlutterFragmentActivity');
    expect(code, 'NotAvailable',
        reason: 'run this on a device with no screen lock');
  });
}
