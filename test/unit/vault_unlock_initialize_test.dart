import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/core/security/biometric_gate.dart';
import 'package:khazana/core/security/key_derivation_service.dart';
import 'package:khazana/core/security/secure_key_store.dart';
import 'package:khazana/core/security/vault_credential_store.dart';
import 'package:khazana/core/security/vault_state.dart';
import 'package:khazana/core/security/vault_unlock_notifier.dart';

/// `initialize()` runs on every cold start, beginning from [VaultUnlocking],
/// which the unlock gate renders as a spinner.
///
/// So every path out of it has to reach a state the user can act from. It
/// previously had no error handling at all: an unreadable keychain — routine on
/// a build whose code signature the keychain ACL does not recognise — threw,
/// the state never moved, and the app sat on an infinite spinner with no
/// explanation and no way forward.
void main() {
  VaultUnlockNotifier notifierWith({
    required VaultCredentialStore credentials,
    BiometricGate? biometric,
  }) =>
      VaultUnlockNotifier(
        // The keychain is not on the launch path at all now, so a store that
        // throws on any call proves it: if initialize() touched it, every test
        // here would fail.
        keyStore: _ExplodingKeyStore(),
        credentials: credentials,
        kdf: const KeyDerivationService(),
        biometric: biometric ?? _FakeBiometric(available: false),
      );

  test('starts on the spinner state, so a stuck initialize is visible', () {
    // Pins the premise of every other test here.
    final n = notifierWith(credentials: _FakeCredentials(exists: false));
    expect(n.state, isA<VaultUnlocking>());
  });

  test('no vault → setup', () async {
    final n = notifierWith(credentials: _FakeCredentials(exists: false));
    await n.initialize();
    expect(n.state, isA<VaultUninitialized>());
  });

  test('vault present → locked, with biometric availability resolved',
      () async {
    final n = notifierWith(
      credentials: _FakeCredentials(exists: true, biometric: true),
      biometric: _FakeBiometric(available: true),
    );
    await n.initialize();
    expect(n.state, isA<VaultLocked>());
    expect((n.state as VaultLocked).biometricAvailable, isTrue);
  });

  group('when local settings cannot be read', () {
    test('it leaves the spinner instead of hanging', () async {
      final n = notifierWith(credentials: _FakeCredentials(throwOnExists: true));
      await n.initialize();
      expect(n.state, isNot(isA<VaultUnlocking>()),
          reason: 'an infinite spinner is the bug this guards');
    });

    test('it lands on locked, NOT uninitialized', () async {
      // The dangerous alternative: offering to create a vault when one may
      // already exist. Creating over it rewrites the salt and key, and the old
      // database becomes permanently undecryptable.
      final n = notifierWith(credentials: _FakeCredentials(throwOnExists: true));
      await n.initialize();
      expect(n.state, isA<VaultLocked>());
      expect(n.state, isNot(isA<VaultUninitialized>()));
    });

    test('it explains itself, and says the data is untouched', () async {
      final n = notifierWith(credentials: _FakeCredentials(throwOnExists: true));
      await n.initialize();
      final message = (n.state as VaultLocked).lastError;
      expect(message, isNotNull);
      expect(message!.toLowerCase(), contains('not been touched'));
    });
  });

  test('biometric stays off until the user opts in', () async {
    // The default is PIN-only, so no keychain and no OS prompt.
    final n = notifierWith(credentials: _FakeCredentials(exists: true));
    await n.initialize();
    expect((n.state as VaultLocked).biometricAvailable, isFalse);
  });

  test('a failing biometric probe does not block PIN entry', () async {
    // Otherwise a broken or unpermitted sensor locks the user out entirely.
    final n = notifierWith(
      credentials: _FakeCredentials(exists: true, biometric: true),
      biometric: _FakeBiometric(throws: true),
    );
    await n.initialize();
    expect(n.state, isA<VaultLocked>());
    expect((n.state as VaultLocked).biometricAvailable, isFalse);
  });
}

class _FakeCredentials implements VaultCredentialStore {
  _FakeCredentials({
    this.exists = false,
    this.throwOnExists = false,
    this.biometric = false,
  });

  final bool exists;
  final bool throwOnExists;
  final bool biometric;

  @override
  Future<bool> vaultExists(String vaultId) async {
    if (throwOnExists) {
      throw StateError('preferences unavailable');
    }
    return exists;
  }

  @override
  Future<bool> biometricEnabled(String vaultId) async => biometric;

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName} not used by this test');
}

/// Fails on every call. Its silence during these tests is the assertion that
/// the keychain is off the launch path.
class _ExplodingKeyStore implements SecureKeyStore {
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('the keychain must not be touched on launch');
}

class _FakeBiometric implements BiometricGate {
  _FakeBiometric({this.available = false, this.throws = false});

  final bool available;
  final bool throws;

  @override
  Future<bool> isAvailable() async {
    if (throws) throw StateError('no biometric hardware');
    return available;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName} not used by this test');
}
