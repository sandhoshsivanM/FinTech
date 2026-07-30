import 'package:khazana/domain/entities/transaction.dart';
import 'package:khazana/domain/services/notification_parser.dart';
import 'package:flutter_test/flutter_test.dart';

// Parity fixtures shared with webapp/src/domain/notificationParser.test.ts.
// `now` is pinned to local noon so the fallback timestamp is deterministic.
void main() {
  const parser = NotificationParser();
  final now = DateTime(2026, 6, 30, 12);

  test('debit SMS: amount, merchant, embedded date; balance is ignored', () {
    final p = parser.parse(
      'Rs.1,234.56 debited from a/c XX1234 at AMAZON on 05-Jan-2026. Avl Bal Rs.45,000.00',
      now: now,
    );
    expect(p, isNotNull);
    expect(p!.type, TxnType.expense);
    expect(p.amount.toString(), '1234.56'); // not the ₹45,000 balance
    expect(p.merchant, 'amazon');
    expect(p.timestamp, '2026-01-05');
    expect(p.uncategorized, isFalse);
    expect(p.profileId, isNull);
    expect(p.fingerprintInput, '2026-01-05|1234.56|amazon');
  });

  test('credit SMS: income, sender-matched bank profile, fallback timestamp', () {
    final p = parser.parse(
      'INR 50000 credited to SALARY. Available Balance: INR 1,20,000',
      now: now,
      sender: 'VK-HDFCBK',
    );
    expect(p, isNotNull);
    expect(p!.type, TxnType.income);
    expect(p.amount.toString(), '50000');
    expect(p.merchant, 'salary');
    expect(p.timestamp, '2026-06-30'); // no embedded date → SMS arrival day
    expect(p.profileId, 'hdfc');
    expect(p.uncategorized, isFalse);
  });

  test('UPI spend: merchant before "using"', () {
    final p = parser.parse('You spent Rs 450 at BIGBASKET using UPI. Avl Bal Rs 9550', now: now);
    expect(p, isNotNull);
    expect(p!.amount.toString(), '450');
    expect(p.merchant, 'bigbasket');
    expect(p.uncategorized, isFalse);
  });

  test('no merchant → uncategorized fallback flag is set', () {
    final p = parser.parse('Rs 200 withdrawn from ATM', now: now);
    expect(p, isNotNull);
    expect(p!.type, TxnType.expense);
    expect(p.amount.toString(), '200');
    expect(p.merchant, '');
    expect(p.uncategorized, isTrue);
  });

  test('non-financial message → null', () {
    final p = parser.parse('OTP 123456 for your login. Do not share.', now: now);
    expect(p, isNull);
  });
}
