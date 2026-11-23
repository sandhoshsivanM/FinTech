import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/services/notification_sync_service.dart';
import 'package:khazana_domain/entities/transaction.dart';

void main() {
  Txn txn(String id, DateTime at, TxnType type, String amount) => Txn(
        id: id,
        vaultId: 'v',
        amount: Decimal.parse(amount),
        type: type,
        categoryId: 'c',
        date: at,
        createdAt: at,
      );

  test('counts and sums only today, local day', () {
    final now = DateTime(2026, 11, 23, 14, 5);
    final f = todayFactFrom([
      txn('a', DateTime(2026, 11, 23, 0, 1), TxnType.expense, '250'),
      txn('b', DateTime(2026, 11, 23, 13), TxnType.expense, '1000'),
      txn('c', DateTime(2026, 11, 23, 9), TxnType.income, '45000'),
      txn('old', DateTime(2026, 11, 22, 23, 59), TxnType.expense, '999'),
    ], now, toReview: 2);
    expect(f.spentCount, 2);
    expect(f.receivedCount, 1);
    expect(f.toReview, 2);
    expect(f.spentText, '₹1,250.00');
    expect(f.receivedText, '₹45,000.00');
    expect(f.hasActivity, isTrue);
  });

  test('an empty day has nothing to say', () {
    expect(todayFactFrom(const [], DateTime(2026, 11, 23)).hasActivity, isFalse);
  });
}
