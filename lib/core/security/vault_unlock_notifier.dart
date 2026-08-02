import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'biometric_gate.dart';
import 'key_derivation_service.dart';
import 'secure_key_store.dart';
import 'vault_credential_store.dart';
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
    required VaultCredentialStore credentials,
    required KeyDerivationService kdf,
    required BiometricGate biometric,
    VaultRegistry? registry,
    this.vaultId = 'default',
    this.vaultName = 'My Vault',
  })  : _keyStore = keyStore,
        _credentials = credentials,
        _kdf = kdf,
        _biometric = biometric,
        _registry = registry,
        super(const VaultUnlocking());

  /// Only touched when the user has opted into biometric unlock. The PIN path
  /// never reads it, which is what keeps the keychain — and its access prompt —
  /// off the launch path entirely.
  final SecureKeyStore _keyStore;

  final VaultCredentialStore _credentials;
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
      // Preferences, not the keychain. This is the whole point: launching the
      // app must never trigger an OS keychain prompt.
      exists = await _credentials.vaultExists(vaultId);
    } on Object catch (e) {
      // Existence is unknown. Falling back to [VaultUninitialized] would offer
      // to create a vault, and creating over an existing one rewrites its salt,
      // leaving the old database permanently undecryptable. Locked-with-an-
      // error explains itself, allows a retry, and cannot destroy anything.
      state = VaultLocked(
        lastError: 'Could not read local settings, so Khazana cannot tell '
            'whether a vault exists. Your data has not been touched. ($e)',
      );
      return;
    }

    if (!exists) {
      state = const VaultUninitialized();
      return;
    }

    // Opening without a PIN, when the user has asked for that. The stored key
    // is still verified rather than trusted: a key that no longer decrypts this
    // vault must fall through to the PIN, or a restored backup would open onto
    // SQLITE_NOTADB with no way back.
    try {
      if (await _credentials.lockDisabled(vaultId)) {
        final key = await _credentials.readDeviceKey(vaultId);
        if (key != null && await _credentials.verify(vaultId, key)) {
          state = VaultUnlocked(VaultSession(vaultId: vaultId, key: key));
          return;
        }
      }
    } on Object {
      // Fall through to the lock screen. An unreadable preference must never
      // be the reason someone cannot reach their own data.
    }

    state = VaultLocked(biometricAvailable: await _biometricOffered());
  }

  /// Whether to show the biometric button: the user has opted in AND the
  /// hardware is actually usable.
  ///
  /// Both checks are guarded — a broken sensor, a withdrawn permission or an
  /// unreadable preference must never make PIN entry unreachable.
  Future<bool> _biometricOffered() async {
    try {
      if (!await _credentials.biometricEnabled(vaultId)) return false;
      return await _biometric.isAvailable();
    } on Object {
      return false;
    }
  }

  /// First-run vault creation. Derives and stores the key, then unlocks.
  Future<void> createVault(String pin) async {
    state = const VaultUnlocking();
    try {
      final salt = await _credentials.createSalt(vaultId);
      final key = await _kdf.deriveKeyAsync(pin: pin, salt: salt);
      // Only a hash of the key is written. The key itself stays in memory, so
      // there is no key at rest for anyone — including a thief with the disk —
      // to find.
      await _credentials.storeVerifier(vaultId, key);
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
      final salt = await _credentials.readSalt(vaultId);
      if (salt == null) {
        state = const VaultUninitialized();
        return;
      }

      final derived = await _kdf.deriveKeyAsync(pin: pin, salt: salt);
      if (await _credentials.verify(vaultId, derived)) {
        // If the lock is already off, this is the one PIN entry that turns it
        // off for good: the key could not be stored before, because until now
        // nothing had derived it.
        try {
          if (await _credentials.lockDisabled(vaultId)) {
            await _credentials.storeDeviceKey(vaultId, derived);
          }
        } on Object {
          // Unlocking succeeded; failing to remember it is not worth refusing.
        }
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

    if (!await _credentials.biometricEnabled(vaultId)) {
      state = locked.copyWith(
          lastError: 'Biometric unlock is off. Turn it on in Settings.');
      return;
    }

    final ok = await _biometric.authenticate();
    if (!ok) {
      state = locked.copyWith(
        biometricFailures: locked.biometricFailures + 1,
        lastError: 'Biometric failed. Use your PIN.',
      );
      return;
    }

    final Uint8List? key;
    try {
      key = await _keyStore.readDerivedKey(vaultId);
    } on Object {
      // The keychain refused. PIN entry still works, so say so instead of
      // stranding the user.
      state = locked.copyWith(
          lastError: 'Could not read the saved key. Use your PIN.');
      return;
    }
    if (key == null) {
      state = locked.copyWith(lastError: 'No stored key. Use your PIN.');
      return;
    }
    state = VaultUnlocked(VaultSession(vaultId: vaultId, key: key));
  }

  /// Turns biometric unlock on, storing the key in the OS keychain.
  ///
  /// This is the ONLY path that writes the key to the keychain, and it runs
  /// only when the user asks for it — so the one-off OS permission prompt lands
  /// on a deliberate action they can connect it to, rather than ambushing them
  /// at launch.
  ///
  /// Requires an unlocked vault: the key comes from the live session, so
  /// enabling this can never be done by someone who has not already
  /// authenticated.
  Future<bool> enableBiometricUnlock() async {
    final current = state;
    if (current is! VaultUnlocked) return false;
    try {
      await _keyStore.storeDerivedKey(vaultId, current.session.key);
      await _credentials.setBiometricEnabled(vaultId, true);
      return true;
    } on Object {
      // Leave the flag off, so a failed write cannot advertise an unlock method
      // that will not work.
      await _credentials.setBiometricEnabled(vaultId, false);
      return false;
    }
  }

  /// Turns biometric unlock off and removes the stored key.
  Future<void> disableBiometricUnlock() async {
    await _credentials.setBiometricEnabled(vaultId, false);
    try {
      await _keyStore.deleteVault(vaultId);
    } on Object {
      // The flag is already off, so the key is unreachable either way.
    }
  }

  /// Stops asking for a PIN on this device.
  ///
  /// Writes the live session key to local preferences. Requires an unlocked
  /// vault, so it can only ever be done by someone who has already
  /// authenticated — the same rule biometric enrolment follows.
  Future<bool> disableLock() async {
    final current = state;
    if (current is! VaultUnlocked) return false;
    try {
      await _credentials.storeDeviceKey(vaultId, current.session.key);
      await _credentials.setLockDisabled(vaultId, true);
      return true;
    } on Object {
      // Leave the lock ON. A half-applied change that stores the key without
      // recording the setting is the worst of both: the protection is gone and
      // the user is still asked for a PIN, so they never learn it happened.
      await _credentials.clearDeviceKey(vaultId);
      await _credentials.setLockDisabled(vaultId, false);
      return false;
    }
  }

  /// Puts the PIN back, and removes the stored key.
  Future<void> enableLock() async {
    await _credentials.setLockDisabled(vaultId, false);
    await _credentials.clearDeviceKey(vaultId);
  }

  Future<bool> lockIsDisabled() => _credentials.lockDisabled(vaultId);

  /// Re-lock the vault (PRD: re-lock on app backgrounding).
  ///
  /// [force] distinguishes the user pressing "Lock vault" from the app being
  /// backgrounded. With the lock turned off, backgrounding must not throw up a
  /// PIN screen — that is the friction being removed — but an explicit press
  /// still locks, because a control that does nothing is worse than no control.
  Future<void> lock({bool force = false}) async {
    _cooldownTimer?.cancel();
    if (!force) {
      try {
        if (await _credentials.lockDisabled(vaultId)) return;
      } on Object {
        // Unreadable setting: lock. Erring toward locked is the safe direction.
      }
    }
    state = VaultLocked(biometricAvailable: await _biometricOffered());
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


  @override
  void dispose() {
    _cooldownTimer?.cancel();
    super.dispose();
  }
}
