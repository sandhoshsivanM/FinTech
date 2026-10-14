import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:khazana/core/di/providers.dart';
import 'package:khazana/core/security/vault_registry.dart';
import 'package:khazana/features/settings/providers/onboarding_providers.dart';
import 'package:khazana/features/settings/providers/sample_data_provider.dart';
import 'package:khazana/features/transactions/providers/transaction_providers.dart';
import 'package:khazana/main.dart';

/// Device walkthrough of the home screen: first-run setup, sample data, then
/// the home. Holds on the result so it can be inspected or screenshotted.
///   flutter test integration_test/home_preview_test.dart -d DEVICE_ID
/// Uses the installed app's sandbox — run on a simulator, not a real vault.
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  // Real frames, so animations play as they would for a user. The default
  // policy only draws frames the test pumps, which freezes every entrance
  // animation on its first (transparent) frame.
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;

  testWidgets('first run → sample data → home', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        // The guided tour is its own flow; keep it out of this walkthrough.
        overrides: [
          tourSeenProvider.overrideWith((ref) async => true),
          // A vault of its own (own file, own preferences), so the walkthrough
          // never touches — or needs the PIN of — a vault already on the device.
          selectedVaultProvider.overrideWith(
            (ref) => const VaultInfo(id: 'preview', name: 'Preview'),
          ),
        ],
        child: const KhazanaApp(),
      ),
    );
    await tester.pumpAndSettle(const Duration(seconds: 1));

    if (find.text('Create vault').evaluate().isNotEmpty) {
      await tester.enterText(
        find.widgetWithText(TextField, 'Create PIN'),
        '123456',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Confirm PIN'),
        '123456',
      );
      await tester.tap(find.text('Create vault'));
      await tester.pumpAndSettle(const Duration(seconds: 2));
    } else if (find.text('Unlock').evaluate().isNotEmpty) {
      await tester.enterText(find.byType(TextField).first, '123456');
      await tester.tap(find.text('Unlock').last);
      await tester.pumpAndSettle(const Duration(seconds: 2));
    }

    // Sample data, loaded directly whenever the vault is empty — the welcome
    // card that offers it is dismissed once it has been used.
    final container = ProviderScope.containerOf(
      tester.element(find.byType(Scaffold).first),
    );
    final txns = container.read(transactionListProvider);
    if (txns is! TransactionData || txns.transactions.isEmpty) {
      await tester.runAsync(() => container.read(sampleDataProvider).load());
      await tester.pumpAndSettle(const Duration(seconds: 2));
    }

    expect(find.text('Total balance'), findsOneWidget);

    // Hold, in real time, so each screen can be captured: home, then the
    // Money and Invest sections.
    await tester.drag(find.byType(Scrollable).first, const Offset(0, 4000));
    await tester.binding.delayed(const Duration(seconds: 10));
    await tester.tap(find.text('Money').last);
    await tester.binding.delayed(const Duration(seconds: 10));
    await tester.tap(find.text('Invest').last);
    await tester.binding.delayed(const Duration(seconds: 10));
  });
}
