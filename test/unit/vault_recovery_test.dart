import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:khazana/core/security/biometric_gate.dart';
import 'package:khazana/core/security/key_derivation_service.dart';
import 'package:khazana/core/security/secure_key_store.dart';
import 'package:khazana/core/security/vault_credential_store.dart';
import 'package:khazana/core/security/vault_file_probe.dart';
import 'package:khazana/core/security/vault_state.dart';
import 'package:khazana/core/security/vault_unlock_notifier.dart';

/// The data-loss incident, as tests.
///
/// Commit 2e10543 moved the salt and verifier from the keychain into
/// preferences without migrating them. Updated installs found empty
/// preferences, offered "Set up your vault", and setup wrote a new salt over a
/// database that was still on disk — permanently unreadable from then on.
///
/// Two rules come out of that, and every test here holds one of them:
///   1. A database on disk means a returning user. Setup is never offered over
///      it, and never allowed to run over it.
///   2. A returning user can get back in with the PIN they always had, using
///      the salt the old build left in the keychain — proven against the file
///      itself before anything is written.

class _MockKeyStore extends Mock implements SecureKeyStore {}

class _MockCredentials extends Mock implements VaultCredentialStore {}

class _MockKdf extends Mock implements KeyDerivationService {}

class _MockBiometric extends Mock implements BiometricGate {}

/// A database whose key is fixed. [opensWith] answers like SQLCipher would.
class _FakeProbe implements VaultFileProbe {
  _FakeProbe({this.data = true, this.fileKey, this.throwOnHasData = false});
  final bool data;
  final Uint8List? fileKey;
  final bool throwOnHasData;
  bool setAsideCalled = false;
  bool throwOnSetAside = false;

  @override
  Future<bool> hasData(String vaultId) async {
    if (throwOnHasData) throw Exception('documents directory unavailable');
    return data;
  }

  @override
  Future<bool> opensWith(String vaultId, Uint8List key) async =>
      fileKey != null && _same(key, fileKey!);

  @override
  Future<String?> setAside(String vaultId) async {
    if (throwOnSetAside) throw Exception('rename failed');
    setAsideCalled = true;
    return '/docs/vault_$vaultId.db.set-aside-1';
  }
}

bool _same(Uint8List a, Uint8List b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

Uint8List _bytes(int v) => Uint8List.fromList(List.filled(32, v));

void main() {
  late _MockKeyStore keyStore;
  late _MockCredentials credentials;
  late _MockKdf kdf;
  late _MockBiometric biometric;

  // The salt the database was created with (kept in the old keychain), and
  // the one a post-update "setup" wrote into preferences.
  final legacySalt = _bytes(1);
  final newSalt = _bytes(2);
  // Keys are a pure function of (pin, salt) in this fake KDF.
  Uint8List keyFor(String pin, Uint8List salt) =>
      _bytes(pin.length * 10 + salt.first);
  final oldPin = '1234';
  final fileKey = keyFor('1234', _bytes(1));

  setUpAll(() {
    registerFallbackValue(Uint8List(0));
  });

  setUp(() {
    keyStore = _MockKeyStore();
    credentials = _MockCredentials();
    kdf = _MockKdf();
    biometric = _MockBiometric();
    when(() => biometric.isAvailable()).thenAnswer((_) async => false);
    when(() => credentials.biometricEnabled(any()))
        .thenAnswer((_) async => false);
    when(() => credentials.lockDisabled(any())).thenAnswer((_) async => false);
    when(() => kdf.deriveKeyAsync(
          pin: any(named: 'pin'),
          salt: any(named: 'salt'),
        )).thenAnswer((inv) async => keyFor(
          inv.namedArguments[#pin] as String,
          inv.namedArguments[#salt] as Uint8List,
        ));
    when(() => credentials.storeSalt(any(), any())).thenAnswer((_) async {});
    when(() => credentials.storeVerifier(any(), any()))
        .thenAnswer((_) async {});
    when(() => credentials.createSalt(any())).thenAnswer((_) async => newSalt);
    when(() => credentials.deleteVault(any())).thenAnswer((_) async {});
  });

  VaultUnlockNotifier build(VaultFileProbe probe) => VaultUnlockNotifier(
        keyStore: keyStore,
        credentials: credentials,
        kdf: kdf,
        biometric: biometric,
        probe: probe,
      );

  group('a database on disk with no credentials in preferences', () {
    setUp(() {
      when(() => credentials.vaultExists(any())).thenAnswer((_) async => false);
    });

    test('opens recovery, NOT setup', () async {
      final n = build(_FakeProbe(fileKey: fileKey));
      await n.initialize();
      expect(n.state, isA<VaultLocked>());
      expect((n.state as VaultLocked).recovery, isTrue);
      expect((n.state as VaultLocked).lastError,
          contains('Nothing has been changed or deleted'));
    });

    test('an unreadable documents directory is treated as data present',
        () async {
      final n = build(_FakeProbe(throwOnHasData: true));
      await n.initialize();
      expect((n.state as VaultLocked).recovery, isTrue);
    });

    test('createVault refuses, and never writes a salt', () async {
      final n = build(_FakeProbe(fileKey: fileKey));
      await n.createVault('999999');
      expect((n.state as VaultLocked).recovery, isTrue);
      verifyNever(() => credentials.createSalt(any()));
      verifyNever(() => credentials.storeVerifier(any(), any()));
    });

    test('the old PIN with the legacy keychain salt gets the data back',
        () async {
      when(() => keyStore.readSalt(any())).thenAnswer((_) async => legacySalt);
      when(() => credentials.readSalt(any())).thenAnswer((_) async => null);
      final n = build(_FakeProbe(fileKey: fileKey));
      await n.initialize();
      await n.unlockWithPin(oldPin);

      expect(n.state, isA<VaultUnlocked>());
      expect(_same((n.state as VaultUnlocked).session.key, fileKey), isTrue);
      // Adopted as the credentials, so the next launch is a normal unlock.
      verify(() => credentials.storeSalt('default', legacySalt)).called(1);
      verify(() => credentials.storeVerifier('default', fileKey)).called(1);
    });

    test('a wrong PIN writes nothing and stays in recovery', () async {
      when(() => keyStore.readSalt(any())).thenAnswer((_) async => legacySalt);
      when(() => credentials.readSalt(any())).thenAnswer((_) async => null);
      final n = build(_FakeProbe(fileKey: fileKey));
      await n.initialize();
      await n.unlockWithPin('000000');

      final s = n.state as VaultLocked;
      expect(s.recovery, isTrue);
      expect(s.pinFailures, 1);
      verifyNever(() => credentials.storeSalt(any(), any()));
      verifyNever(() => credentials.storeVerifier(any(), any()));
    });

    test('repeated failures cool down, then come back to recovery', () async {
      when(() => keyStore.readSalt(any())).thenAnswer((_) async => legacySalt);
      when(() => credentials.readSalt(any())).thenAnswer((_) async => null);
      final n = build(_FakeProbe(fileKey: fileKey));
      await n.initialize();
      for (var i = 0; i < VaultUnlockNotifier.maxPinFailures; i++) {
        await n.unlockWithPin('000000');
      }
      expect(n.state, isA<VaultCooldown>());
      n.dispose();
    });

    test('with no salt anywhere, it says so and still deletes nothing',
        () async {
      when(() => keyStore.readSalt(any())).thenAnswer((_) async => null);
      when(() => credentials.readSalt(any())).thenAnswer((_) async => null);
      final probe = _FakeProbe(fileKey: fileKey);
      final n = build(probe);
      await n.initialize();
      await n.unlockWithPin(oldPin);

      expect((n.state as VaultLocked).lastError, contains('do not uninstall'));
      expect(probe.setAsideCalled, isFalse);
      verifyNever(() => credentials.deleteVault(any()));
    });

    test('an unreadable keychain leaves the preferences salt to try',
        () async {
      when(() => keyStore.readSalt(any())).thenThrow(Exception('keychain'));
      when(() => credentials.readSalt(any())).thenAnswer((_) async => legacySalt);
      final n = build(_FakeProbe(fileKey: fileKey));
      await n.initialize();
      await n.unlockWithPin(oldPin);
      expect(n.state, isA<VaultUnlocked>());
    });
  });

  group('already re-set-up after the update (salt overwritten)', () {
    test('the previous PIN still opens the file via the legacy salt',
        () async {
      // Preferences hold the post-update vault; its verifier passes for the
      // new PIN, but the database belongs to the old one.
      when(() => credentials.vaultExists(any())).thenAnswer((_) async => true);
      when(() => keyStore.readSalt(any())).thenAnswer((_) async => legacySalt);
      when(() => credentials.readSalt(any())).thenAnswer((_) async => newSalt);
      final n = build(_FakeProbe(fileKey: fileKey));
      await n.initialize();

      n.startRecovery(); // the "Use my previous PIN" button on DataGate
      await n.unlockWithPin(oldPin);

      expect(n.state, isA<VaultUnlocked>());
      verify(() => credentials.storeSalt('default', legacySalt)).called(1);
    });
  });

  group('starting fresh without the old PIN', () {
    test('sets the old database aside before clearing credentials', () async {
      when(() => credentials.vaultExists(any())).thenAnswer((_) async => false);
      final probe = _FakeProbe(fileKey: fileKey);
      final n = build(probe);
      await n.initialize();
      final moved = await n.startFreshKeepingOldData();

      expect(probe.setAsideCalled, isTrue);
      expect(moved, contains('set-aside'));
      expect(n.state, isA<VaultUninitialized>());
    });

    test('if the file cannot be moved, nothing is cleared', () async {
      when(() => credentials.vaultExists(any())).thenAnswer((_) async => false);
      final probe = _FakeProbe(fileKey: fileKey)..throwOnSetAside = true;
      final n = build(probe);
      await n.initialize();
      await n.startFreshKeepingOldData();

      expect((n.state as VaultLocked).recovery, isTrue);
      verifyNever(() => credentials.deleteVault(any()));
    });
  });

  test('no database on disk: first run is still a plain setup', () async {
    when(() => credentials.vaultExists(any())).thenAnswer((_) async => false);
    final n = build(_FakeProbe(data: false));
    await n.initialize();
    expect(n.state, isA<VaultUninitialized>());
  });

  test('turning biometrics off keeps the legacy salt', () async {
    when(() => credentials.setBiometricEnabled(any(), any()))
        .thenAnswer((_) async {});
    when(() => keyStore.deleteDerivedKey(any())).thenAnswer((_) async {});
    final n = build(_FakeProbe(data: false));
    await n.disableBiometricUnlock();
    verify(() => keyStore.deleteDerivedKey('default')).called(1);
    verifyNever(() => keyStore.deleteVault(any()));
  });
}
