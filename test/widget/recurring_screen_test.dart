import 'package:decimal/decimal.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/di/data_providers.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/features/accounts/providers/account_providers.dart';
import 'package:khazana/features/transactions/providers/category_providers.dart';
import 'package:khazana/features/transactions/providers/recurring_providers.dart';
import 'package:khazana/features/transactions/screens/recurring_screen.dart';
import 'package:khazana_domain/entities/category.dart';
import 'package:khazana_domain/entities/recurring_rule.dart';
import 'package:khazana_domain/entities/transaction.dart';

/// Recurring rules never posted from the UI. These pin the two controls that
/// now do: "Run due" with its count, and Edit reopening the form pre-filled.
class _FakeActions extends RecurringActions {
  _FakeActions(super.ref, this.dueResult);
  final int dueResult;
  int dueCalls = 0;

  @override
  Future<int> processDue({DateTime? now}) async {
    dueCalls++;
    return dueResult;
  }
}

void main() {
  late AppDatabase db;
  setUp(() => db = AppDatabase(NativeDatabase.memory()));
  tearDown(() => db.close());

  final rule = RecurringRule(
    id: 'r1',
    vaultId: 'v1',
    amount: Decimal.parse('649'),
    type: TxnType.expense,
    categoryId: 'c1',
    merchant: 'Netflix',
    frequency: Frequency.monthly,
    nextRun: DateTime(2026, 1, 7),
  );

  Widget harness(_FakeActions Function(Ref) actions) => ProviderScope(
    overrides: [
      appDatabaseProvider.overrideWith((ref) async => db),
      currentVaultIdProvider.overrideWithValue('v1'),
      recurringListProvider.overrideWith((ref) => Stream.value([rule])),
      categoryListProvider.overrideWith(
        (ref) => Stream.value(const [
          Category(id: 'c1', vaultId: 'v1', name: 'Entertainment'),
        ]),
      ),
      accountListProvider.overrideWith((ref) => Stream.value(const [])),
      recurringActionsProvider.overrideWith(actions),
    ],
    child: const MaterialApp(home: RecurringScreen()),
  );

  testWidgets('Run due reports how many were posted', (tester) async {
    late _FakeActions fake;
    await tester.pumpWidget(harness((ref) => fake = _FakeActions(ref, 3)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Run due'));
    await tester.pumpAndSettle();

    expect(fake.dueCalls, 1);
    expect(find.text('Posted 3 transactions.'), findsOneWidget);
  });

  testWidgets('Run due says so when nothing is due', (tester) async {
    await tester.pumpWidget(harness((ref) => _FakeActions(ref, 0)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Run due'));
    await tester.pumpAndSettle();

    expect(find.text('No transactions due right now.'), findsOneWidget);
  });

  testWidgets('Edit opens the form pre-filled with the rule', (tester) async {
    await tester.pumpWidget(harness((ref) => _FakeActions(ref, 0)));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Edit rule'));
    await tester.pumpAndSettle();

    expect(find.text('Edit rule'), findsWidgets);
    expect(find.text('649'), findsOneWidget);
    expect(find.text('Netflix'), findsOneWidget);
  });
}
