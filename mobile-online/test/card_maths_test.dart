import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_online/cards/card_maths.dart';

String ymd(DateTime d) => '${d.year}-${d.month}-${d.day}';
CardTxn txn({
  int paise = 10000,
  bool expense = true,
  String date = '2026-10-10',
  String? last4 = '1234',
}) => CardTxn(
  id: 'x',
  date: DateTime.parse(date),
  paise: paise,
  isExpense: expense,
  note: 'n',
  last4: last4,
);
const card = CreditCard(
  id: 'c',
  name: 'HDFC',
  network: 'Visa',
  last4: '1234',
  limitPaise: 10000000,
  statementDay: 15,
  dueDay: 4,
);

void main() {
  group('utilisation', () {
    test('tones: ok to 30, warn to 60, bad above', () {
      expect([0, 30, 31, 60, 61, 100].map(utilisationTone), [
        Tone.ok,
        Tone.ok,
        Tone.warn,
        Tone.warn,
        Tone.bad,
        Tone.bad,
      ]);
    });
    test('percent; a zero limit does not divide by zero', () {
      expect(utilisationPct(4230000, 15000000), 28);
      expect(utilisationPct(1000, 0), 0);
    });
    test('advice: reassurance under 30, otherwise the amount to pay', () {
      expect(advice(3000000, 10000000), startsWith('Under 30%'));
      expect(
        advice(6190000, 8000000),
        'Above the 30% mark (the line). Paying ₹37,900 before the bill date brings it under.',
      );
    });
    test('inr groups in lakhs', () {
      expect([0, 41200, 15000000, 123456700].map(inr), [
        '₹0',
        '₹412',
        '₹1,50,000',
        '₹12,34,567',
      ]);
    });
  });

  group('cycle', () {
    test(
      'statement day ahead belongs to last month; due rolls into next month',
      () {
        final c = cycleFor(15, 4, DateTime(2026, 10, 27));
        expect(
          [ymd(c.statement), ymd(c.due), c.daysToDue],
          ['2026-10-15', '2026-11-4', 8],
        );
        final a = cycleFor(28, 15, DateTime(2026, 10, 27));
        expect(
          [ymd(a.statement), ymd(a.due), a.daysToDue],
          ['2026-9-28', '2026-10-15', -12],
        );
      },
    );
    test('year rollover', () {
      final c = cycleFor(20, 5, DateTime(2026, 12, 25));
      expect([ymd(c.statement), ymd(c.due)], ['2026-12-20', '2027-1-5']);
      expect(
        ymd(cycleFor(20, 5, DateTime(2027, 1, 2)).statement),
        '2026-12-20',
      );
    });
    test('due day later in the same month as the statement', () {
      expect(ymd(cycleFor(6, 26, DateTime(2026, 10, 27)).due), '2026-10-26');
    });
    test('day 31 clamps to the month end', () {
      final c = cycleFor(31, 31, DateTime(2026, 11, 30));
      expect([ymd(c.statement), ymd(c.due)], ['2026-11-30', '2026-12-31']);
    });
    test('due text and tone', () {
      expect([-1, 0, 1, 5].map(dueText), [
        'Overdue',
        'Due today',
        'Due in 1 day',
        'Due in 5 days',
      ]);
      expect([-2, 3, 4, 7, 8].map(dueTone), [
        Tone.bad,
        Tone.bad,
        Tone.warn,
        Tone.warn,
        Tone.quiet,
      ]);
    });
  });

  group('owed, bill and transactions from last4', () {
    final txns = [
      txn(paise: 50000, date: '2026-10-20'),
      txn(paise: 20000, date: '2026-10-21'),
      txn(paise: 10000, expense: false, date: '2026-10-22'),
      txn(paise: 99900, last4: '9999'),
      txn(paise: 5000, last4: null),
    ];
    test('only this last4; payments reduce, never below zero', () {
      expect(owedOn(card, txns), 60000);
      expect(owedOn(card, [txn(expense: false)]), 0);
    });
    test('billed counts the previous statement to this one', () {
      final cycle = cycleFor(15, 4, DateTime(2026, 10, 27));
      final t = [
        txn(paise: 30000, date: '2026-09-16'),
        txn(paise: 70000, date: '2026-10-15'),
        txn(paise: 500, date: '2026-09-15'),
        txn(paise: 900, date: '2026-10-16'),
      ];
      expect(billedOn(card, t, cycle), 100000);
    });
    test('view and totals', () {
      final v = viewOf(card, txns, DateTime(2026, 10, 27));
      expect([v.pct, v.txns.length], [1, 3]);
      expect(totals([v, v]).owed, 120000);
    });
  });

  group('validateCard', () {
    const ok = CardForm(
      name: ' Axis Ace ',
      network: 'Visa',
      last4: '4417',
      limit: '₹1,00,000',
      statementDay: '12',
      dueDay: '2',
    );
    CardForm withForm({
      String? last4,
      String? limit,
      String? due,
      String? statement,
      String? name,
      String? network,
    }) => CardForm(
      name: name ?? ok.name,
      network: network ?? ok.network,
      last4: last4 ?? ok.last4,
      limit: limit ?? ok.limit,
      statementDay: statement ?? ok.statementDay,
      dueDay: due ?? ok.dueDay,
    );
    test('accepts a good form and cleans it', () {
      final r = validateCard(ok);
      expect(r.errors, isEmpty);
      expect(
        [
          r.value!.name,
          r.value!.limitPaise,
          r.value!.statementDay,
          r.value!.dueDay,
        ],
        ['Axis Ace', 10000000, 12, 2],
      );
    });
    test('last4 must be exactly four digits', () {
      for (final bad in ['', '123', '12345', '12a4', '4417 ']) {
        expect(
          validateCard(withForm(last4: bad)).errors.keys,
          contains('last4'),
          reason: bad,
        );
      }
    });
    test('days 1 to 31 and limit above zero', () {
      for (final bad in ['0', '32', '', 'x', '1.5']) {
        expect(
          validateCard(withForm(due: bad)).errors.keys,
          contains('dueDay'),
          reason: bad,
        );
      }
      expect(validateCard(withForm(statement: '31')).errors, isEmpty);
      for (final bad in ['0', '-5', '', 'abc']) {
        expect(
          validateCard(withForm(limit: bad)).errors.keys,
          contains('limit'),
          reason: bad,
        );
      }
    });
    test('name and network required', () {
      expect(validateCard(withForm(name: ' ', network: 'Diners')).errors.keys, [
        'name',
        'network',
      ]);
    });
  });
}
