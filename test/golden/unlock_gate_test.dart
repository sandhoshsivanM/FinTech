import 'package:khazana/core/di/providers.dart';
import 'package:khazana/core/security/biometric_gate.dart';
import 'package:khazana/core/security/secure_key_store.dart';
import 'package:khazana/core/security/vault_credential_store.dart';
import 'package:khazana/presentation/unlock_gate_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockKeyStore extends Mock implements SecureKeyStore {}

class _MockCredentials extends Mock implements VaultCredentialStore {}

class _MockBiometric extends Mock implements BiometricGate {}

void main() {
  testWidgets('boots to vault setup when no vault exists, and is accessible',
      (tester) async {
    final keyStore = _MockKeyStore();
    final credentials = _MockCredentials();
    final bio = _MockBiometric();
    when(() => credentials.vaultExists(any())).thenAnswer((_) async => false);
    when(() => credentials.biometricEnabled(any()))
        .thenAnswer((_) async => false);
    when(() => bio.isAvailable()).thenAnswer((_) async => false);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          secureKeyStoreProvider.overrideWithValue(keyStore),
          vaultCredentialStoreProvider.overrideWithValue(credentials),
          biometricGateProvider.overrideWithValue(bio),
        ],
        child: const MaterialApp(home: UnlockGateScreen()),
      ),
    );
    await tester.pumpAndSettle();

    // Setup flow is shown.
    expect(find.text('Set up your vault'), findsOneWidget);
    expect(find.text('Create vault'), findsOneWidget);

    // Accessibility: no overflow at 2x text scale (PRD §10A dynamic font).
    tester.view.physicalSize = const Size(1080, 2400);
    addTearDown(tester.view.resetPhysicalSize);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('shows PIN unlock when a vault already exists', (tester) async {
    final keyStore = _MockKeyStore();
    final credentials = _MockCredentials();
    final bio = _MockBiometric();
    when(() => credentials.vaultExists(any())).thenAnswer((_) async => true);
    when(() => credentials.biometricEnabled(any()))
        .thenAnswer((_) async => false);
    when(() => bio.isAvailable()).thenAnswer((_) async => true);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          secureKeyStoreProvider.overrideWithValue(keyStore),
          vaultCredentialStoreProvider.overrideWithValue(credentials),
          biometricGateProvider.overrideWithValue(bio),
        ],
        child: const MaterialApp(home: UnlockGateScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Unlock'), findsWidgets);
    // Biometrics are OFF by default: the vault unlocks from the PIN alone, and
    // nothing is stored in the keychain unless the user opts in. Offering the
    // button here would promise an unlock method that has no saved key behind
    // it.
    expect(find.text('Use biometrics'), findsNothing);
  });

  testWidgets('offers biometrics once the user has opted in', (tester) async {
    final keyStore = _MockKeyStore();
    final credentials = _MockCredentials();
    final bio = _MockBiometric();
    when(() => credentials.vaultExists(any())).thenAnswer((_) async => true);
    when(() => credentials.biometricEnabled(any()))
        .thenAnswer((_) async => true);
    when(() => bio.isAvailable()).thenAnswer((_) async => true);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          secureKeyStoreProvider.overrideWithValue(keyStore),
          vaultCredentialStoreProvider.overrideWithValue(credentials),
          biometricGateProvider.overrideWithValue(bio),
        ],
        child: const MaterialApp(home: UnlockGateScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Use biometrics'), findsOneWidget);
  });

  testWidgets('hides biometrics when opted in but the hardware is gone',
      (tester) async {
    // Enrolment can be removed after the fact. Offering a button that cannot
    // work is worse than not offering one.
    final keyStore = _MockKeyStore();
    final credentials = _MockCredentials();
    final bio = _MockBiometric();
    when(() => credentials.vaultExists(any())).thenAnswer((_) async => true);
    when(() => credentials.biometricEnabled(any()))
        .thenAnswer((_) async => true);
    when(() => bio.isAvailable()).thenAnswer((_) async => false);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          secureKeyStoreProvider.overrideWithValue(keyStore),
          vaultCredentialStoreProvider.overrideWithValue(credentials),
          biometricGateProvider.overrideWithValue(bio),
        ],
        child: const MaterialApp(home: UnlockGateScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Use biometrics'), findsNothing);
    expect(find.text('Unlock'), findsWidgets);
  });
}
