import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';

import '../branding.dart';

/// Why a biometric prompt did not unlock.
enum BiometricFailure {
  /// The prompt ran and the user cancelled it or did not match.
  rejected,
  notEnrolled,
  noScreenLock,
  lockedOut,
  permanentlyLockedOut,
  notAvailable,

  /// The prompt could not be shown at all (for example, a host activity that
  /// is not a FragmentActivity). A bug, not a user problem.
  couldNotStart,
}

/// The outcome of one biometric prompt.
class BiometricResult {
  const BiometricResult.success() : failure = null;
  const BiometricResult.failed(BiometricFailure this.failure);

  final BiometricFailure? failure;

  bool get ok => failure == null;

  /// Whether this counts toward the three tries before PIN-only. Only a
  /// prompt the user actually saw does; a phone with no fingerprint set up
  /// should not burn tries it never had.
  bool get countsAsAttempt => failure == BiometricFailure.rejected;

  /// What to tell the user. Always offers the PIN, which always works.
  String get message => switch (failure) {
        null => '',
        BiometricFailure.rejected => 'Biometric failed. Use your PIN.',
        BiometricFailure.notEnrolled =>
          'No fingerprint or face is set up on this phone. Add one in the '
              "phone's settings, or use your PIN.",
        BiometricFailure.noScreenLock =>
          'This phone has no screen lock, so biometrics are off. Use your PIN.',
        BiometricFailure.lockedOut =>
          'Too many tries. Wait 30 seconds, or use your PIN.',
        BiometricFailure.permanentlyLockedOut =>
          'Biometrics are locked. Unlock the phone with its screen lock, then '
              'try again, or use your PIN.',
        BiometricFailure.notAvailable =>
          'Biometrics are not available on this phone. Use your PIN.',
        BiometricFailure.couldNotStart =>
          'Biometrics could not start. Use your PIN.',
      };

  /// What to tell the user when turning biometric unlock on did not work.
  String get setupMessage => switch (failure) {
        null => 'Biometric unlock is on.',
        BiometricFailure.rejected =>
          'The biometric check did not pass, so biometric unlock stays off.',
        BiometricFailure.notEnrolled =>
          'No fingerprint or face is set up on this phone. Add one in the '
              "phone's settings, then turn this on.",
        BiometricFailure.noScreenLock =>
          'Set a screen lock on this phone first, then turn this on.',
        BiometricFailure.lockedOut =>
          'Too many tries. Wait 30 seconds, then try again.',
        BiometricFailure.permanentlyLockedOut =>
          'Biometrics are locked. Unlock the phone with its screen lock, then '
              'try again.',
        BiometricFailure.notAvailable =>
          'Biometrics are not available on this phone.',
        BiometricFailure.couldNotStart =>
          'Could not set up biometric unlock, so it stays off.',
      };
}

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

  /// Shows the system prompt. PRD §14: the device PIN is allowed as a system
  /// fallback here.
  ///
  /// Never throws. Platform errors used to be swallowed into a plain `false`,
  /// which made a setup bug (no_fragment_activity: the prompt never appeared)
  /// read as "Biometric failed" on every phone. They are now told apart.
  Future<BiometricResult> authenticate() async {
    try {
      final ok = await _auth.authenticate(
        localizedReason: 'Unlock your $kAppName vault',
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
        ),
      );
      return ok
          ? const BiometricResult.success()
          : const BiometricResult.failed(BiometricFailure.rejected);
    } on PlatformException catch (e) {
      debugPrint('BiometricGate: ${e.code}');
      return BiometricResult.failed(failureFor(e.code));
    } on Exception catch (e) {
      debugPrint('BiometricGate: $e');
      return const BiometricResult.failed(BiometricFailure.couldNotStart);
    }
  }

  /// local_auth's PlatformException codes (Android and iOS share these).
  @visibleForTesting
  static BiometricFailure failureFor(String code) => switch (code) {
        'NotEnrolled' => BiometricFailure.notEnrolled,
        'PasscodeNotSet' => BiometricFailure.noScreenLock,
        'LockedOut' => BiometricFailure.lockedOut,
        'PermanentlyLockedOut' => BiometricFailure.permanentlyLockedOut,
        'NotAvailable' || 'OtherOperatingSystem' => BiometricFailure.notAvailable,
        _ => BiometricFailure.couldNotStart,
      };
}
