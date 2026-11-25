import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_domain/entities/net_worth_snapshot.dart';
import 'package:khazana_domain/entities/transaction.dart';
import 'package:khazana_domain/services/skyline.dart';

DateTime at(int y, int m, int d, [int h = 12]) => DateTime(y, m, d, h);
Txn txn(String id, DateTime date, TxnType type, String amount) => Txn(
  id: id,
  vaultId: 'v',
  amount: Decimal.parse(amount),
  type: type,
  categoryId: 'c',
  date: date,
  createdAt: date,
);
NetWorthSnapshot snap(DateTime date, String investments) => NetWorthSnapshot(
  id: date.toIso8601String(),
  vaultId: 'v',
  date: date,
  netWorth: Decimal.zero,
  cash: Decimal.zero,
  investments: Decimal.parse(investments),
  liabilities: Decimal.zero,
);

void main() {
  final today = at(2026, 11, 25); // a Wednesday

  group('lastWeeks', () {
    test('ends on the Saturday of this week and starts on a Sunday', () {
      final r = lastWeeks(today, 26);
      expect(r.start.weekday, DateTime.sunday);
      expect(r.end.weekday, DateTime.saturday);
      expect(r.end.day, 28);
      // Calendar days, not 24h blocks: DST-safe.
      var n = 1;
      for (
        var d = r.start;
        d != r.end;
        d = DateTime(d.year, d.month, d.day + 1)
      ) {
        n++;
      }
      expect(n, 26 * 7);
    });

    test('clipToWeeks keeps the newest weeks', () {
      final (r, clipped) = clipToWeeks(
        SkyRange(at(2020, 1, 1), at(2026, 11, 25)),
        53,
      );
      expect(clipped, isTrue);
      expect(r.start.weekday, DateTime.sunday);
      expect(r.end, DateTime(2026, 11, 25));
      final (same, no) = clipToWeeks(lastWeeks(today, 4), 53);
      expect(no, isFalse);
      expect(same, lastWeeks(today, 4));
    });
  });

  group('spendSkyline', () {
    test('whole weeks, Sunday first; spending only; days to come are null', () {
      final sky = spendSkyline(
        [
          txn('a', at(2026, 11, 1, 9), TxnType.expense, '18000'),
          txn('b', at(2026, 11, 1, 20), TxnType.expense, '250.50'),
          txn('c', at(2026, 11, 2), TxnType.income, '90000'),
          txn('e', at(2026, 11, 26), TxnType.expense, '99'), // tomorrow
        ],
        lastWeeks(today, 4),
        today,
      );
      expect(sky.weeks, 4);
      expect(sky.cells, hasLength(28));
      final nov1 = sky.cells.firstWhere((c) => c.day == DateTime(2026, 11, 1));
      expect(nov1.weekday, 0);
      expect(nov1.amount.toString(), '18250.5');
      expect(nov1.count, 2);
      expect(
        sky.cells.firstWhere((c) => c.day == DateTime(2026, 11, 2)).amount,
        Decimal.zero,
      );
      expect(
        sky.cells.firstWhere((c) => c.day == DateTime(2026, 11, 26)).amount,
        isNull,
      );
    });

    test('a month that starts mid-week pads to whole weeks with nulls', () {
      // Leap year; 1 Feb 2028 is a Tuesday.
      final sky = spendSkyline(
        [txn('a', at(2028, 2, 29), TxnType.expense, '10')],
        SkyRange(DateTime(2028, 2, 1), DateTime(2028, 2, 29)),
        at(2028, 3, 15),
      );
      expect(sky.cells.where((c) => c.amount != null), hasLength(29));
      expect(sky.cells.first.amount, isNull); // Sunday 30 Jan
      expect(
        sky.cells
            .firstWhere((c) => c.day == DateTime(2028, 2, 29))
            .amount
            .toString(),
        '10',
      );
    });

    test('stats reconcile with the cells', () {
      final sky = spendSkyline(
        [
          txn('a', at(2026, 11, 20), TxnType.expense, '100'),
          txn('b', at(2026, 11, 23), TxnType.expense, '300'),
        ],
        SkyRange(at(2026, 11, 19), at(2026, 11, 25)),
        today,
      );
      final s = spendStats(sky);
      expect(s.total.toString(), '400');
      expect(s.pastDays, 7);
      expect(s.quietDays, 5);
      expect(s.longestQuiet, 2); // 21-22 Nov, and 24-25 Nov
      expect(s.busiest?.day, DateTime(2026, 11, 23));
    });
  });

  group('portfolioSkyline', () {
    test(
      'change is measured from the previous reading, with the day it was taken',
      () {
        final sky = portfolioSkyline(
          [
            snap(at(2026, 11, 18, 9), '100000'),
            snap(at(2026, 11, 20, 9), '101500'),
            snap(at(2026, 11, 20, 21), '101000'), // later reading that day wins
            snap(at(2026, 11, 21, 9), '99000'),
          ],
          SkyRange(at(2026, 11, 19), at(2026, 11, 25)),
          today,
        );
        SkyCell day(int d) =>
            sky.cells.firstWhere((c) => c.day == DateTime(2026, 11, d));
        expect(day(19).amount, isNull);
        expect(day(20).amount.toString(), '1000');
        expect(day(20).since, DateTime(2026, 11, 18));
        expect(day(21).amount.toString(), '-2000');
        final s = changeStats(sky);
        expect(s.net.toString(), '-1000');
        expect(s.upDays, 1);
        expect(s.downDays, 1);
        expect(s.worst?.day, DateTime(2026, 11, 21));
      },
    );
  });
}
