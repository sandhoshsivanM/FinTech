import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../security/biometric_gate.dart';
import '../security/key_derivation_service.dart';
import '../security/secure_key_store.dart';
import '../security/vault_registry.dart';
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

final vaultRegistryProvider = Provider<VaultRegistry>((ref) {
  return VaultRegistry();
});

/// The list of known vaults for the switcher (PRD §14 vault switcher).
final vaultListProvider = FutureProvider<List<VaultInfo>>((ref) {
  // Re-reads when the unlock state changes (e.g. after a new vault is created).
  ref.watch(vaultUnlockProvider);
  return ref.watch(vaultRegistryProvider).list();
});

/// Which vault the unlock gate currently targets. Changing it locks and
/// re-points the unlock flow (re-auth on switch).
final selectedVaultProvider =
    StateProvider<VaultInfo>((ref) => const VaultInfo(id: 'default', name: 'My Vault'));

/// The vault unlock state machine. The router redirects off this (PRD §3 gate).
/// Rebuilds when [selectedVaultProvider] changes → forces re-auth on switch.
final vaultUnlockProvider =
    StateNotifierProvider<VaultUnlockNotifier, VaultState>((ref) {
  final selected = ref.watch(selectedVaultProvider);
  final notifier = VaultUnlockNotifier(
    keyStore: ref.watch(secureKeyStoreProvider),
    kdf: ref.watch(keyDerivationServiceProvider),
    biometric: ref.watch(biometricGateProvider),
    registry: ref.watch(vaultRegistryProvider),
    vaultId: selected.id,
    vaultName: selected.name,
  );
  // Kick off existence check on first read.
  notifier.initialize();
  return notifier;
});
