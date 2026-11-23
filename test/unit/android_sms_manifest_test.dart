import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Requesting READ_SMS / RECEIVE_SMS makes Google Play assume the app needs
/// telephony. Unless the manifest says the feature is optional, Play hides the
/// app from every device without a SIM: 1.1.0+3 lost 4,541 device models
/// (tablets, Chromebooks) that way. SMS capture is an optional extra, so the
/// feature must stay required="false".
void main() {
  test('telephony is declared optional next to the SMS permissions', () {
    final src = File('android/app/src/sms/AndroidManifest.xml').readAsStringSync();
    expect(src, contains('android.permission.READ_SMS'));
    expect(
      RegExp(r'<uses-feature\s+android:name="android\.hardware\.telephony"\s+'
              r'android:required="false"\s*/>')
          .hasMatch(src),
      isTrue,
      reason: 'without required="false", Play drops every device that has no '
          'telephony (tablets, Chromebooks) from the app',
    );
  });

  test('MainActivity checks the device can receive SMS', () {
    final src = File(
      'android/app/src/main/kotlin/com/khazana/app/MainActivity.kt',
    ).readAsStringSync();
    expect(src, contains('PackageManager.FEATURE_TELEPHONY'));
    expect(src, contains('"isSmsCaptureAvailable" -> result.success(smsUsable())'));
  });
}
