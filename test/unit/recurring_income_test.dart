import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_domain/entities/transaction.dart';
import 'package:khazana_domain/services/recurring_income.dart';

/// The twin of `webapp/src/domain/recurringIncome.test.ts`.
void main() {
  Txn txn(String id, DateTime at, String amount, String? merchant,
          {TxnType type = TxnType.income}) =>
      Txn(
        id: id,
        vaultId: 'v',
        amount: Decimal.parse(amount),
        type: type,
        categoryId: 'c',
        date: at,
        merchant: merchant,
        createdAt: at,
      );

  test('a monthly salary is found, with its typical amount and day', () {
    final found = detectRecurringIncome([
      txn('a', DateTime(2026, 8, 1, 9), '85000', 'ACME TECH PVT LTD SALARY AUG26'),
      txn('b', DateTime(2026, 9, 1, 9), '85000', 'Acme Tech Pvt Ltd Salary Sep26'),
      txn('c', DateTime(2026, 10, 2, 9), '86500', 'acme tech pvt ltd salary oct26'),
    ]);
    expect(found, hasLength(1));
    expect(found.single.kind, RecurringIncomeKind.salary);
    expect(found.single.payerKey, 'acme tech pvt ltd salary');
    expect(found.single.typicalAmount, Decimal.parse('85000'));
    expect(found.single.expectedDay, 1);
    expect(found.single.txnIds, {'a', 'b', 'c'});
  });

  test('one missed month still counts', () {
    final found = detectRecurringIncome([
      txn('a', DateTime(2026, 6, 5), '20000', 'rent from tenant'),
      txn('b', DateTime(2026, 7, 5), '20000', 'rent from tenant'),
      txn('c', DateTime(2026, 9, 5), '20000', 'rent from tenant'),
    ]);
    expect(found.single.kind, RecurringIncomeKind.regular);
    expect(found.single.txnIds, {'a', 'b', 'c'});
  });

  test('a three-month gap breaks the pattern', () {
    final found = detectRecurringIncome([
      txn('a', DateTime(2026, 3, 5), '20000', 'tenant'),
      txn('b', DateTime(2026, 4, 5), '20000', 'tenant'),
      txn('c', DateTime(2026, 7, 5), '20000', 'tenant'),
    ]);
    expect(found, isEmpty);
  });

  test('freelance income that varies is not regular', () {
    final found = detectRecurringIncome([
      txn('a', DateTime(2026, 8, 10), '12000', 'client co'),
      txn('b', DateTime(2026, 9, 10), '30000', 'client co'),
      txn('c', DateTime(2026, 10, 10), '7000', 'client co'),
    ]);
    expect(found, isEmpty);
  });

  test('a one-off bonus from the same payer is left out of the pattern', () {
    final found = detectRecurringIncome([
      txn('a', DateTime(2026, 8, 1), '85000', 'acme salary'),
      txn('b', DateTime(2026, 9, 1), '85000', 'acme salary'),
      txn('bonus', DateTime(2026, 9, 20), '150000', 'acme salary'),
      txn('c', DateTime(2026, 10, 1), '85000', 'acme salary'),
    ]);
    expect(found.single.txnIds, {'a', 'b', 'c'});
  });

  test('refunds, spending and unnamed credits are ignored', () {
    final found = detectRecurringIncome([
      txn('r', DateTime(2026, 9, 3), '499', 'amazon'),
      txn('s1', DateTime(2026, 8, 1), '799', 'netflix', type: TxnType.expense),
      txn('s2', DateTime(2026, 9, 1), '799', 'netflix', type: TxnType.expense),
      txn('s3', DateTime(2026, 10, 1), '799', 'netflix', type: TxnType.expense),
      txn('n1', DateTime(2026, 8, 1), '500', null),
      txn('n2', DateTime(2026, 9, 1), '500', ''),
      txn('n3', DateTime(2026, 10, 1), '500', '2026'),
    ]);
    expect(found, isEmpty);
  });

  test('ids map to their kind for the ledger chip', () {
    final byId = recurringIncomeById(detectRecurringIncome([
      txn('a', DateTime(2026, 8, 1), '100', 'pension'),
      txn('b', DateTime(2026, 9, 1), '100', 'pension'),
      txn('c', DateTime(2026, 10, 1), '100', 'pension'),
    ]));
    expect(byId, {
      'a': RecurringIncomeKind.regular,
      'b': RecurringIncomeKind.regular,
      'c': RecurringIncomeKind.regular,
    });
  });
}
