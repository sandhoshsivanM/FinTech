import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'biometric_gate.dart';
import 'key_derivation_service.dart';
import 'secure_key_store.dart';
import 'vault_registry.dart';
import 'vault_session.dart';
import 'vault_state.dart';

/// Drives vault setup, unlock, and the auth failure cascade (PRD §14, §4B).
///
/// Cascade rules:
///  - 3 biometric failures → PIN only (tracked via [VaultLocked.biometricExhausted]).
///  - 5 PIN failures → 30s cooldown ([VaultCooldown]); input re-enabled after.
class VaultUnlockNotifier extends StateNotifier<VaultState> {
  VaultUnlockNotifier({
    required SecureKeyStore keyStore,
    required KeyDerivationService kdf,
    required BiometricGate biometric,
    VaultRegistry? registry,
    this.vaultId = 'default',
    this.vaultName = 'My Vault',
  })  : _keyStore = keyStore,
        _kdf = kdf,
        _biometric = biometric,
        _registry = registry,
        super(const VaultUnlocking());

  final SecureKeyStore _keyStore;
  final KeyDerivationService _kdf;
  final BiometricGate _biometric;
  final VaultRegistry? _registry;
  final String vaultId;
  final String vaultName;

  static const int maxPinFailures = 5;
  static const Duration cooldown = Duration(seconds: 30);

  Timer? _cooldownTimer;

  /// Determines whether to show setup or unlock on launch.
  ///
  /// Every failure path here must land on a state the user can act from. This
  /// method runs on every cold start and begins from [VaultUnlocking], so an
  /// uncaught throw leaves the app on a spinner with no way forward and no
  /// explanation — which is exactly what an unreadable keychain used to do.
  Future<void> initialize() async {
    final bool exists;
    try {
      exists = await _keyStore.vaultExists(vaultId);
    } on Object catch (e) {
      // The keychain could not be read, so whether a vault exists is UNKNOWN.
      //
      // Falling back to [VaultUninitialized] would offer to create one, and
      // creating over an existing vault rewrites its salt and key — the old
      // database would become permanently undecryptable. Locked-with-an-error
      // is the conservative choice: it explains itself, it lets the user retry,
      // and it cannot destroy anything.
      state = VaultLocked(lastError: _keychainMessage(e));
      return;
    }

    if (!exists) {
      state = const VaultUninitialized();
      return;
    }

    // A biometric probe must never gate entry either: PIN entry has to remain
    // reachable when the hardware or its permission is unavailable.
    var bioAvailable = false;
    try {
      bioAvailable = await _biometric.isAvailable();
    } on Object {
      bioAvailable = false;
    }
    state = VaultLocked(biometricAvailable: bioAvailable);
  }

  /// Turns a storage failure into something a user can act on.
  static String _keychainMessage(Object error) =>
      'Could not read the keychain, so Khazana cannot tell whether a vault '
      'exists on this device. Your data has not been touched. ($error)';

  /// First-run vault creation. Derives and stores the key, then unlocks.
  Future<void> createVault(String pin) async {
    state = const VaultUnlocking();
    try {
      final salt = await _keyStore.createSalt(vaultId);
      final key = await _kdf.deriveKeyAsync(pin: pin, salt: salt);
      await _keyStore.storeDerivedKey(vaultId, key);
      await _registry?.register(VaultInfo(id: vaultId, name: vaultName));
      state = VaultUnlocked(VaultSession(vaultId: vaultId, key: key));
    } on Object catch (e) {
      // Never leave the user stuck on a spinner.
      state = VaultUninitialized(error: 'Could not create vault: $e');
    }
  }

  /// PIN unlock. Re-derives the key and compares to the stored key.
  Future<void> unlockWithPin(String pin) async {
    final current = state;
    if (current is VaultCooldown && DateTime.now().isBefore(current.until)) {
      return; // input disabled during cooldown
    }
    final locked = current is VaultLocked ? current : const VaultLocked();
    state = const VaultUnlocking();

    try {
      final salt = await _keyStore.readSalt(vaultId);
      final stored = await _keyStore.readDerivedKey(vaultId);
      if (salt == null || stored == null) {
        state = const VaultUninitialized();
        return;
      }

      final derived = await _kdf.deriveKeyAsync(pin: pin, salt: salt);
      if (_constantTimeEquals(derived, stored)) {
        state = VaultUnlocked(VaultSession(vaultId: vaultId, key: derived));
        return;
      }

      final failures = locked.pinFailures + 1;
      if (failures >= maxPinFailures) {
        _startCooldown();
      } else {
        state = locked.copyWith(
          pinFailures: failures,
          lastError: 'Incorrect PIN. ${maxPinFailures - failures} attempts left.',
        );
      }
    } on Object catch (e) {
      state = locked.copyWith(lastError: 'Unlock failed: $e');
    }
  }

  /// Biometric unlock. On success reads the stored key; on failure advances the
  /// cascade toward PIN-only.
  Future<void> unlockWithBiometric() async {
    final current = state;
    final locked = current is VaultLocked ? current : const VaultLocked();
    if (locked.biometricExhausted) return;

    final ok = await _biometric.authenticate();
    if (!ok) {
      state = locked.copyWith(
        biometricFailures: locked.biometricFailures + 1,
        lastError: 'Biometric failed. Use your PIN.',
      );
      return;
    }

    final key = await _keyStore.readDerivedKey(vaultId);
    if (key == null) {
      state = locked.copyWith(lastError: 'No stored key. Use your PIN.');
      return;
    }
    state = VaultUnlocked(VaultSession(vaultId: vaultId, key: key));
  }

  /// Re-lock the vault (PRD: re-lock on app backgrounding).
  Future<void> lock() async {
    _cooldownTimer?.cancel();
    final bioAvailable = await _biometric.isAvailable();
    state = VaultLocked(biometricAvailable: bioAvailable);
  }

  void _startCooldown() {
    final until = DateTime.now().add(cooldown);
    state = VaultCooldown(until: until);
    _cooldownTimer?.cancel();
    _cooldownTimer = Timer(cooldown, () async {
      final bioAvailable = await _biometric.isAvailable();
      // Reset PIN failures after cooldown (PRD §4B: input re-enabled).
      state = VaultLocked(biometricAvailable: bioAvailable);
    });
  }

  static bool _constantTimeEquals(Uint8List a, Uint8List b) {
    if (a.length != b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a[i] ^ b[i];
    }
    return diff == 0;
  }

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    super.dispose();
  }
}
