import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:khazana/core/di/providers.dart';
import 'package:khazana/core/router/app_router.dart';
import 'package:khazana/core/security/vault_registry.dart';
import 'package:khazana/features/settings/providers/onboarding_providers.dart';
import 'package:khazana/features/settings/providers/sample_data_provider.dart';
import 'package:khazana/features/transactions/providers/transaction_providers.dart';
import 'package:khazana/main.dart';

/// Visual audit: visits every phone screen with sample data and prints
/// `SHOT <name>` when each one has settled, so a host-side watcher can take a
/// device screenshot. Uses its own vault, never the device's.
///   flutter test integration_test/screen_audit_test.dart -d DEVICE_ID
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;

  const screens = {
    'home': Routes.dashboard,
    'activity': Routes.transactions,
    'calendar': Routes.calendar,
    'budget': Routes.budget,
    'recurring': Routes.recurring,
    'accounts': Routes.accounts,
    'portfolio': Routes.investments,
    'holdings': Routes.investmentsBreakdown,
    'goals': Routes.goals,
    'debts': Routes.liabilities,
    'cover': Routes.insurance,
    'score': Routes.score,
    'reports': Routes.reports,
    'analytics': Routes.analytics,
    'safety-net': Routes.safetyNet,
    'settings': Routes.settings,
    'add': Routes.addTransaction,
    'capture': Routes.captureInbox,
    'bank-import': Routes.bankImport,
    'import-lots': Routes.investmentsImportLots,
    'add-lot': Routes.investmentsAddLot,
  };

  testWidgets('audit every screen', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tourSeenProvider.overrideWith((ref) async => true),
          selectedVaultProvider.overrideWith(
            (ref) => const VaultInfo(id: 'audit', name: 'Audit'),
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
    } else {
      await tester.enterText(find.byType(TextField).first, '123456');
      await tester.tap(find.text('Unlock').last);
    }
    await tester.pumpAndSettle(const Duration(seconds: 2));

    final container = ProviderScope.containerOf(
      tester.element(find.byType(Scaffold).first),
    );
    final txns = container.read(transactionListProvider);
    if (txns is! TransactionData || txns.transactions.isEmpty) {
      await tester.runAsync(() => container.read(sampleDataProvider).load());
    }
    final router = container.read(routerProvider);

    Future<void> shot(String name) async {
      await tester.binding.delayed(const Duration(milliseconds: 1500));
      debugPrint('SHOT $name');
      await tester.binding.delayed(const Duration(milliseconds: 1800));
    }

    // --dart-define=ONLY=portfolio to audit one screen, SCROLLS=n for depth.
    const only = String.fromEnvironment('ONLY');
    const scrolls = int.fromEnvironment('SCROLLS', defaultValue: 2);
    final size = tester.view.physicalSize / tester.view.devicePixelRatio;
    for (final e in screens.entries.where(
      (e) => only.isEmpty || e.key == only,
    )) {
      router.go(e.value);
      await tester.binding.delayed(const Duration(milliseconds: 600));
      await shot('${e.key}-1');
      for (var i = 2; i <= scrolls + 1; i++) {
        await tester.dragFrom(
          Offset(size.width / 2, size.height * 0.7),
          Offset(0, -size.height * 0.55),
        );
        await shot('${e.key}-$i');
      }
    }
    debugPrint('SHOT done');
  });
}
