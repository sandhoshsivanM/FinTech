import 'package:fintech_os/core/di/providers.dart';
import 'package:fintech_os/core/security/biometric_gate.dart';
import 'package:fintech_os/core/security/secure_key_store.dart';
import 'package:fintech_os/presentation/unlock_gate_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockKeyStore extends Mock implements SecureKeyStore {}

class _MockBiometric extends Mock implements BiometricGate {}

void main() {
  testWidgets('boots to vault setup when no vault exists, and is accessible',
      (tester) async {
    final keyStore = _MockKeyStore();
    final bio = _MockBiometric();
    when(() => keyStore.vaultExists(any())).thenAnswer((_) async => false);
    when(() => bio.isAvailable()).thenAnswer((_) async => false);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          secureKeyStoreProvider.overrideWithValue(keyStore),
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
    final bio = _MockBiometric();
    when(() => keyStore.vaultExists(any())).thenAnswer((_) async => true);
    when(() => bio.isAvailable()).thenAnswer((_) async => true);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          secureKeyStoreProvider.overrideWithValue(keyStore),
          biometricGateProvider.overrideWithValue(bio),
        ],
        child: const MaterialApp(home: UnlockGateScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Unlock'), findsWidgets);
    expect(find.text('Use biometrics'), findsOneWidget);
  });
}
