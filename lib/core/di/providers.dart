import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../security/biometric_gate.dart';
import '../security/key_derivation_service.dart';
import '../security/secure_key_store.dart';
import '../security/vault_state.dart';
import '../security/vault_unlock_notifier.dart';

/// Composition root (PRD §3B `lib/core/` DI setup). Concrete implementations
/// are bound here; UI and feature providers depend only on these.

final secureKeyStoreProvider = Provider<SecureKeyStore>((ref) {
  return SecureKeyStore();
});

final keyDerivationServiceProvider = Provider<KeyDerivationService>((ref) {
  return const KeyDerivationService();
});

final biometricGateProvider = Provider<BiometricGate>((ref) {
  return BiometricGate();
});

/// The vault unlock state machine. The router redirects off this (PRD §3 gate).
final vaultUnlockProvider =
    StateNotifierProvider<VaultUnlockNotifier, VaultState>((ref) {
  final notifier = VaultUnlockNotifier(
    keyStore: ref.watch(secureKeyStoreProvider),
    kdf: ref.watch(keyDerivationServiceProvider),
    biometric: ref.watch(biometricGateProvider),
  );
  // Kick off existence check on first read.
  notifier.initialize();
  return notifier;
});
