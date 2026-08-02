import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:khazana/core/security/biometric_gate.dart';
import 'package:khazana/core/security/key_derivation_service.dart';
import 'package:khazana/core/security/secure_key_store.dart';
import 'package:khazana/core/security/vault_credential_store.dart';
import 'package:khazana/core/security/vault_state.dart';
import 'package:khazana/core/security/vault_unlock_notifier.dart';

/// Opening the vault without a PIN.
///
/// This deliberately gives up the property the rest of the security code is
/// built around — no key at rest — so the parts that stop it being worse than
/// asked for are the ones worth pinning: it cannot be switched on without a
/// verified PIN, a key that no longer fits must fall through to the PIN rather
/// than opening onto a corrupt database, and a half-applied change must leave
/// the lock ON rather than removing the protection while still asking.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  VaultUnlockNotifier build() => VaultUnlockNotifier(
        keyStore: _UnusedKeyStore(),
        credentials: VaultCredentialStore(),
        kdf: const KeyDerivationService(),
        biometric: _NoBiometric(),
      );

  Future<VaultUnlockNotifier> withVault(String pin) async {
    final n = build();
    await n.createVault(pin);
    return n;
  }

  test('a fresh vault still asks for a PIN', () async {
    await (await withVault('1234')).enableLock();
    final n = build();
    await n.initialize();
    expect(n.state, isA<VaultLocked>());
  });

  test('once turned off, a later launch opens straight up', () async {
    final first = await withVault('1234');
    expect(await first.disableLock(), isTrue);

    final next = build();
    await next.initialize();
    expect(next.state, isA<VaultUnlocked>(),
        reason: 'the whole point is that no PIN screen appears');
  });

  test('it cannot be turned off from a locked vault', () async {
    // Otherwise anyone at the lock screen could remove the lock without ever
    // proving they know the PIN.
    await withVault('1234');
    final locked = build();
    await locked.initialize();
    expect(locked.state, isA<VaultLocked>());
    expect(await locked.disableLock(), isFalse);

    final again = build();
    await again.initialize();
    expect(again.state, isA<VaultLocked>());
  });

  test('turning it back on removes the stored key', () async {
    final n = await withVault('1234');
    await n.disableLock();
    await n.enableLock();

    final store = VaultCredentialStore();
    expect(await store.readDeviceKey('default'), isNull);

    final next = build();
    await next.initialize();
    expect(next.state, isA<VaultLocked>());
  });

  test('a stored key that no longer fits falls through to the PIN', () async {
    // A restored backup carries a different salt, so yesterday's key opens
    // nothing. Trusting it blindly would hand SQLCipher a wrong key and surface
    // as "file is not a database" — the vault reading as destroyed when it is
    // intact.
    final n = await withVault('1234');
    await n.disableLock();
    await VaultCredentialStore()
        .storeDeviceKey('default', Uint8List(32)); // not the real key

    final next = build();
    await next.initialize();
    expect(next.state, isA<VaultLocked>());
  });

  test('backgrounding does not re-lock, but pressing Lock does', () async {
    final n = await withVault('1234');
    await n.disableLock();

    await n.lock();
    expect(n.state, isA<VaultUnlocked>(),
        reason: 'a PIN screen on every app switch is the friction being '
            'removed');

    await n.lock(force: true);
    expect(n.state, isA<VaultLocked>(),
        reason: 'a control that does nothing is worse than no control');
  });

  test('with the lock on, backgrounding still locks', () async {
    final n = await withVault('1234');
    await n.lock();
    expect(n.state, isA<VaultLocked>());
  });

  test('unlocking with the wrong PIN does not remember anything', () async {
    final n = await withVault('1234');
    await n.disableLock();
    await n.enableLock();

    final locked = build();
    await locked.initialize();
    await locked.unlockWithPin('9999');
    expect(locked.state, isNot(isA<VaultUnlocked>()));
    expect(await VaultCredentialStore().readDeviceKey('default'), isNull);
  });
}

/// Fails on every call. Its silence proves the keychain stays off this path —
/// it is the thing whose prompts made the PIN screen unbearable in the first
/// place.
class _UnusedKeyStore implements SecureKeyStore {
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('the keychain must not be touched here');
}

class _NoBiometric implements BiometricGate {
  @override
  Future<bool> isAvailable() async => false;

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName} not used by this test');
}
