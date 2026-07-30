import 'dart:typed_data';

import 'package:khazana/core/security/biometric_gate.dart';
import 'package:khazana/core/security/key_derivation_service.dart';
import 'package:khazana/core/security/secure_key_store.dart';
import 'package:khazana/core/security/vault_state.dart';
import 'package:khazana/core/security/vault_unlock_notifier.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockKeyStore extends Mock implements SecureKeyStore {}

class _MockKdf extends Mock implements KeyDerivationService {}

class _MockBiometric extends Mock implements BiometricGate {}

void main() {
  late _MockKeyStore keyStore;
  late _MockKdf kdf;
  late _MockBiometric biometric;

  final correctKey = Uint8List.fromList(List.filled(32, 7));
  final wrongKey = Uint8List.fromList(List.filled(32, 9));
  final salt = Uint8List.fromList(List.filled(32, 1));

  setUpAll(() {
    registerFallbackValue(Uint8List(0));
  });

  setUp(() {
    keyStore = _MockKeyStore();
    kdf = _MockKdf();
    biometric = _MockBiometric();
    when(() => biometric.isAvailable()).thenAnswer((_) async => true);
  });

  VaultUnlockNotifier build() => VaultUnlockNotifier(
        keyStore: keyStore,
        kdf: kdf,
        biometric: biometric,
      );

  test('initialize → uninitialized when no vault exists', () async {
    when(() => keyStore.vaultExists(any())).thenAnswer((_) async => false);
    final n = build();
    await n.initialize();
    expect(n.state, isA<VaultUninitialized>());
  });

  test('initialize → locked when vault exists', () async {
    when(() => keyStore.vaultExists(any())).thenAnswer((_) async => true);
    final n = build();
    await n.initialize();
    expect(n.state, isA<VaultLocked>());
  });

  test('createVault stores key and unlocks', () async {
    when(() => keyStore.createSalt(any())).thenAnswer((_) async => salt);
    when(() => kdf.deriveKeyAsync(pin: any(named: 'pin'), salt: any(named: 'salt')))
        .thenAnswer((_) async => correctKey);
    when(() => keyStore.storeDerivedKey(any(), any())).thenAnswer((_) async {});

    final n = build();
    await n.createVault('1234');
    expect(n.state, isA<VaultUnlocked>());
    verify(() => keyStore.storeDerivedKey(any(), correctKey)).called(1);
  });

  group('PIN cascade', () {
    setUp(() {
      when(() => keyStore.readSalt(any())).thenAnswer((_) async => salt);
      when(() => keyStore.readDerivedKey(any()))
          .thenAnswer((_) async => correctKey);
    });

    test('correct PIN unlocks', () async {
      when(() => kdf.deriveKeyAsync(
          pin: any(named: 'pin'),
          salt: any(named: 'salt'))).thenAnswer((_) async => correctKey);
      final n = build();
      await n.unlockWithPin('1234');
      expect(n.state, isA<VaultUnlocked>());
    });

    test('wrong PIN increments failures', () async {
      when(() => kdf.deriveKeyAsync(
          pin: any(named: 'pin'),
          salt: any(named: 'salt'))).thenAnswer((_) async => wrongKey);
      final n = build();
      await n.unlockWithPin('0000');
      expect(n.state, isA<VaultLocked>());
      expect((n.state as VaultLocked).pinFailures, 1);
    });

    test('5 wrong PINs trigger 30s cooldown', () async {
      when(() => kdf.deriveKeyAsync(
          pin: any(named: 'pin'),
          salt: any(named: 'salt'))).thenAnswer((_) async => wrongKey);
      final n = build();
      for (var i = 0; i < 5; i++) {
        await n.unlockWithPin('0000');
      }
      expect(n.state, isA<VaultCooldown>());
    });
  });

  group('biometric cascade', () {
    setUp(() async {
      when(() => keyStore.vaultExists(any())).thenAnswer((_) async => true);
      when(() => keyStore.readDerivedKey(any()))
          .thenAnswer((_) async => correctKey);
    });

    test('success unlocks via stored key', () async {
      when(() => biometric.authenticate()).thenAnswer((_) async => true);
      final n = build();
      await n.initialize();
      await n.unlockWithBiometric();
      expect(n.state, isA<VaultUnlocked>());
    });

    test('3 biometric failures exhaust biometrics', () async {
      when(() => biometric.authenticate()).thenAnswer((_) async => false);
      final n = build();
      await n.initialize();
      await n.unlockWithBiometric();
      await n.unlockWithBiometric();
      await n.unlockWithBiometric();
      expect((n.state as VaultLocked).biometricExhausted, isTrue);
    });
  });
}
