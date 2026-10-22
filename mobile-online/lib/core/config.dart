// Build-time settings (--dart-define), fixed per build like the web app's.
import 'dart:io' show Platform;

/// The gateway this build talks to. The default is the local Aspire gateway as
/// seen from an Android emulator (10.0.2.2) or an iOS/macOS simulator.
Uri gatewayUrl() {
  const configured = String.fromEnvironment('KHAZANA_GATEWAY_URL');
  if (configured.isNotEmpty) return Uri.parse(configured);
  return Uri.parse(Platform.isAndroid ? 'http://10.0.2.2:5196' : 'http://localhost:5196');
}

/// The development sign-in exists only in local and test backends; a
/// production build never shows it.
const devSignIn = bool.fromEnvironment('KHAZANA_DEV_SIGN_IN');

/// The platform name Identity records for this device.
String platformName() => Platform.isAndroid ? 'android' : (Platform.isIOS ? 'ios' : 'macos');
