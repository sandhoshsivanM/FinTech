import 'package:local_auth/local_auth.dart';

/// Thin wrapper over local_auth so the unlock state machine is testable
/// without the plugin (PRD §2 biometrics, §14 fallback).
class BiometricGate {
  BiometricGate([LocalAuthentication? auth])
      : _auth = auth ?? LocalAuthentication();

  final LocalAuthentication _auth;

  /// Whether the device can attempt biometric auth at all.
  Future<bool> isAvailable() async {
    try {
      final supported = await _auth.isDeviceSupported();
      final canCheck = await _auth.canCheckBiometrics;
      return supported && canCheck;
    } on Exception {
      return false;
    }
  }

  /// Prompts for biometrics. Returns true on success, false on user failure.
  /// PRD §14: device PIN is allowed as a system fallback here.
  Future<bool> authenticate() async {
    try {
      return await _auth.authenticate(
        localizedReason: 'Unlock your Khazana vault',
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
        ),
      );
    } on Exception {
      return false;
    }
  }
}
