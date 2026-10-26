import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/features/transactions/screens/transactions_screen.dart';
import 'package:khazana_domain/entities/transaction.dart';

void main() {
  final now = DateTime(2026, 10, 1);
  Txn t(String id, TxnType type, String cat, {String? account}) => Txn(
        id: id,
        vaultId: 'v',
        amount: Decimal.fromInt(10),
        type: type,
        categoryId: cat,
        date: now,
        createdAt: now,
        accountId: account,
      );

  final all = [
    t('1', TxnType.expense, 'food', account: 'bank'),
    t('2', TxnType.income, 'salary'),
    t('3', TxnType.expense, 'travel'),
  ];
  List<String> ids(TxnFilter f) =>
      [for (final x in all) if (f.matches(x, 'cash')) x.id];

  test('no filter is inactive and matches everything', () {
    expect(const TxnFilter().active, isFalse);
    expect(ids(const TxnFilter()), ['1', '2', '3']);
  });

  test('filters by type, category and account together', () {
    expect(ids(const TxnFilter(type: TxnType.expense)), ['1', '3']);
    expect(ids(const TxnFilter(categoryId: 'salary')), ['2']);
    expect(ids(const TxnFilter(accountId: 'bank')), ['1']);
    expect(
        ids(const TxnFilter(type: TxnType.expense, accountId: 'bank')), ['1']);
  });

  test('entries without an account count as the cash account', () {
    expect(ids(const TxnFilter(accountId: 'cash')), ['2', '3']);
  });
}
