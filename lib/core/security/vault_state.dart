import 'vault_session.dart';

/// Vault unlock state (PRD §3C: sealed state with Loading/Data/Error variants;
/// §14 auth failure cascade).
sealed class VaultState {
  const VaultState();
}

/// No vault has been created yet — show the setup flow.
class VaultUninitialized extends VaultState {
  const VaultUninitialized();
}

/// Vault exists but is locked. Tracks the failure cascade counters (PRD §4B):
/// after [maxBiometricFailures] biometric fails the UI forces PIN entry.
class VaultLocked extends VaultState {
  const VaultLocked({
    this.biometricFailures = 0,
    this.pinFailures = 0,
    this.biometricAvailable = false,
    this.lastError,
  });

  final int biometricFailures;
  final int pinFailures;
  final bool biometricAvailable;
  final String? lastError;

  /// PRD §14: 3 biometric fails → PIN only.
  bool get biometricExhausted => biometricFailures >= 3;

  VaultLocked copyWith({
    int? biometricFailures,
    int? pinFailures,
    bool? biometricAvailable,
    String? lastError,
  }) {
    return VaultLocked(
      biometricFailures: biometricFailures ?? this.biometricFailures,
      pinFailures: pinFailures ?? this.pinFailures,
      biometricAvailable: biometricAvailable ?? this.biometricAvailable,
      lastError: lastError,
    );
  }
}

/// Authentication / key derivation in progress.
class VaultUnlocking extends VaultState {
  const VaultUnlocking();
}

/// Vault is unlocked; [session] carries the derived key for the DB layer.
class VaultUnlocked extends VaultState {
  const VaultUnlocked(this.session);
  final VaultSession session;
}

/// Too many PIN failures (PRD §4B: 5 fails → 30s cooldown). Input disabled
/// until [until].
class VaultCooldown extends VaultState {
  const VaultCooldown({required this.until});
  final DateTime until;
}
