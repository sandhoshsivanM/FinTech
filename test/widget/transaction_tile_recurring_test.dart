import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/theme/app_theme.dart';
import 'package:khazana/features/transactions/widgets/transaction_tile.dart';
import 'package:khazana_domain/entities/transaction.dart';
import 'package:khazana_domain/services/recurring_income.dart';

/// The Salary / Regular chip on ledger rows: shown only for recurring income,
/// and spoken as part of the row's label rather than as a stray word.
void main() {
  final at = DateTime(2026, 11, 1, 9);
  final salary = Txn(
    id: 's',
    vaultId: 'v',
    amount: Decimal.fromInt(85000),
    type: TxnType.income,
    categoryId: 'c',
    date: at,
    merchant: 'acme tech salary',
    createdAt: at,
  );

  Future<void> pump(WidgetTester tester, {RecurringIncomeKind? recurring}) =>
      tester.pumpWidget(MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: TransactionTile(txn: salary, category: null, recurring: recurring),
        ),
      ));

  testWidgets('a salary entry shows the chip and says it', (tester) async {
    final handle = tester.ensureSemantics();
    await pump(tester, recurring: RecurringIncomeKind.salary);
    expect(find.text('Salary'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r', Salary income')), findsOneWidget);
    handle.dispose();
  });

  testWidgets('ordinary income has no chip', (tester) async {
    await pump(tester);
    expect(find.byType(RecurringChip), findsNothing);
  });
}
