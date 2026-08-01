import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/domain/entities/budget.dart';
import 'package:khazana/domain/entities/category.dart';
import 'package:khazana/domain/entities/pending_capture.dart';
import 'package:khazana/domain/entities/transaction.dart';
import 'package:khazana/features/budget/providers/budget_providers.dart';
import 'package:khazana/features/capture/providers/capture_providers.dart';
import 'package:khazana/features/transactions/providers/category_providers.dart';
import 'package:khazana/features/transactions/providers/transaction_providers.dart';
import 'package:khazana/features/transactions/widgets/budget_strip.dart';
import 'package:khazana/features/transactions/widgets/review_queue_banner.dart';

/// The two strips above the ledger, and the rule they share: neither one exists
/// when it has nothing to say.
///
/// A permanently-present "0 to review" banner or an empty budget strip is
/// chrome, and chrome is exactly what trains people to scroll past the real
/// alert when it does appear.
void main() {
  Decimal d(int v) => Decimal.fromInt(v);
  // Must be inside the current calendar month: budgetProgressProvider scopes
  // spend to DateTime.now()'s month, so a fixed past date would make every
  // budget read as untouched.
  final now = DateTime.now();

  Txn txn(int amount, String categoryId, {TxnType type = TxnType.expense}) => Txn(
        id: 'txn-$amount-$categoryId',
        vaultId: 'v',
        amount: d(amount),
        type: type,
        categoryId: categoryId,
        date: now,
        createdAt: now,
      );

  Budget budget(String categoryId, int limit) => Budget(
        id: 'b-$categoryId',
        vaultId: 'v',
        categoryId: categoryId,
        amountLimit: d(limit),
      );

  PendingCapture capture(String id) => PendingCapture(
        id: id,
        vaultId: 'v',
        amount: d(500),
        type: TxnType.expense,
        occurredAt: now,
        source: CaptureSource.sms,
        uncategorized: true,
        fingerprint: id,
        capturedAt: now,
      );

  Widget harness({
    List<Budget> budgets = const [],
    List<Txn> txns = const [],
    List<PendingCapture> pending = const [],
    required Widget child,
  }) {
    return ProviderScope(
      overrides: [
        budgetListProvider.overrideWith((ref) => Stream.value(budgets)),
        pendingCaptureListProvider.overrideWith((ref) => Stream.value(pending)),
        categoryListProvider.overrideWith((ref) => Stream.value([
              const Category(
                  id: 'food', vaultId: 'v', name: 'Food', iconCodepoint: 0xe1),
              const Category(
                  id: 'travel', vaultId: 'v', name: 'Travel', iconCodepoint: 0xe2),
              const Category(
                  id: 'shop', vaultId: 'v', name: 'Shopping', iconCodepoint: 0xe3),
              const Category(
                  id: 'health', vaultId: 'v', name: 'Health', iconCodepoint: 0xe4),
            ])),
        // The strips read transactions through this provider; a StateNotifier
        // seeded with a fixed state is enough, and keeps the test off a
        // database.
        transactionListProvider
            .overrideWith((ref) => _FixedTxns(TransactionData(txns))),
      ],
      child: MaterialApp(home: Scaffold(body: child)),
    );
  }

  group('BudgetStrip', () {
    testWidgets('renders nothing when there are no budgets', (tester) async {
      await tester.pumpWidget(harness(child: const BudgetStrip()));
      await tester.pumpAndSettle();
      expect(find.textContaining('Budgets'), findsNothing);
      expect(find.byType(LinearProgressIndicator), findsNothing);
    });

    testWidgets('shows at most three, closest to their limit first',
        (tester) async {
      await tester.pumpWidget(harness(
        budgets: [
          budget('food', 10000),
          budget('travel', 10000),
          budget('shop', 10000),
          budget('health', 10000),
        ],
        txns: [
          txn(1000, 'food'), // 10%
          txn(9500, 'travel'), // 95%
          txn(5000, 'shop'), // 50%
          txn(8000, 'health'), // 80%
        ],
        child: const BudgetStrip(),
      ));
      await tester.pumpAndSettle();

      // Travel, Health, Shopping — ranked by ratio, and Food is cut.
      expect(find.text('Travel'), findsOneWidget);
      expect(find.text('Health'), findsOneWidget);
      expect(find.text('Shopping'), findsOneWidget);
      expect(find.text('Food'), findsNothing);
      expect(find.text('All 4 budgets'), findsOneWidget);
    });

    testWidgets('ranks by ratio, not by absolute spend', (tester) async {
      // A small budget nearly exhausted beats a large one barely touched.
      await tester.pumpWidget(harness(
        budgets: [budget('food', 500), budget('travel', 100000)],
        txns: [txn(490, 'food'), txn(20000, 'travel')],
        child: const BudgetStrip(),
      ));
      await tester.pumpAndSettle();

      final foodY = tester.getTopLeft(find.text('Food')).dy;
      final travelY = tester.getTopLeft(find.text('Travel')).dy;
      expect(foodY, lessThan(travelY),
          reason: 'the ₹500 budget at 98% should outrank ₹1L at 20%');
    });

    testWidgets('counts overspent budgets in the header', (tester) async {
      await tester.pumpWidget(harness(
        budgets: [budget('food', 1000), budget('travel', 1000)],
        txns: [txn(1500, 'food'), txn(2000, 'travel')],
        child: const BudgetStrip(),
      ));
      await tester.pumpAndSettle();
      expect(find.text('2 budgets over limit'), findsOneWidget);
    });

    testWidgets('collapses to just its header', (tester) async {
      await tester.pumpWidget(harness(
        budgets: [budget('food', 1000)],
        txns: [txn(200, 'food')],
        child: const BudgetStrip(),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Food'), findsOneWidget);

      await tester.tap(find.text('Budgets this month'));
      await tester.pumpAndSettle();
      expect(find.text('Food'), findsNothing);
      expect(find.text('Budgets this month'), findsOneWidget);
    });
  });

  group('ReviewQueueBanner', () {
    testWidgets('is absent when the queue is empty', (tester) async {
      await tester.pumpWidget(harness(child: const ReviewQueueBanner()));
      await tester.pumpAndSettle();
      expect(find.textContaining('confirm'), findsNothing);
      expect(find.text('Review'), findsNothing);
    });

    testWidgets('appears, and counts, when drafts are waiting', (tester) async {
      await tester.pumpWidget(harness(
        pending: [capture('a'), capture('b'), capture('c')],
        child: const ReviewQueueBanner(),
      ));
      await tester.pumpAndSettle();
      expect(find.text('3 captured transactions to confirm'), findsOneWidget);
      expect(find.text('Review'), findsOneWidget);
    });

    testWidgets('says "transaction", singular, for one', (tester) async {
      await tester.pumpWidget(harness(
        pending: [capture('a')],
        child: const ReviewQueueBanner(),
      ));
      await tester.pumpAndSettle();
      expect(find.text('1 captured transaction to confirm'), findsOneWidget);
    });
  });
}

/// A [TransactionNotifier] that never touches a repository.
class _FixedTxns extends StateNotifier<TransactionState>
    implements TransactionNotifier {
  _FixedTxns(super.state);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
