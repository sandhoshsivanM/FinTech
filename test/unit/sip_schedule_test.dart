import 'dart:convert';
import 'dart:io';

import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_domain/entities/asset_group.dart';
import 'package:khazana_domain/entities/holding.dart';
import 'package:khazana_domain/entities/sip.dart';
import 'package:khazana_domain/services/sip_schedule.dart';

/// Twin of `webapp/src/domain/sip.test.ts`. Both run `test/fixtures/sip_cases.json`.
void main() {
  final f = jsonDecode(File('test/fixtures/sip_cases.json').readAsStringSync())
      as Map<String, dynamic>;
  CalendarDate cd(Object? s) => CalendarDate.parse(s as String);
  Decimal d(Object? s) => Decimal.parse(s as String);

  final plans = {
    for (final p in (f['plans'] as List).cast<Map<String, dynamic>>())
      p['id'] as String: SipPlan(
        id: p['id'] as String,
        vaultId: 'v',
        instrumentId: p['id'] as String,
        name: p['id'] as String,
        assetType: AssetType.fromKey(p['assetType'] as String),
        amount: d(p['amount']),
        dayOfMonth: p['dayOfMonth'] as int,
        startDate: cd(p['startDate']),
        stepUpPct: p['stepUpPct'] as int,
        active: p['active'] as bool,
      ),
  };
  var n = 0;
  final inst = [
    for (final i in (f['instalments'] as List).cast<Map<String, dynamic>>())
      SipInstalment(
        id: 'i${n++}',
        sipId: i['sipId'] as String,
        dueDate: cd(i['dueDate']),
        status: SipInstalmentStatus.fromKey(i['status'] as String),
        amount: d(i['amount']),
      ),
  ];
  final targets = {
    for (final e in (f['targets'] as Map).entries)
      AssetGroup.values.byName(e.key as String): e.value as int,
  };

  test('the two copies of the fixture are byte-identical', () {
    expect(File('webapp/src/domain/__fixtures__/sip_cases.json').readAsBytesSync(),
        File('test/fixtures/sip_cases.json').readAsBytesSync());
  });

  for (final q in (f['queries'] as List).cast<Map<String, dynamic>>()) {
    final label = '${q['fn']} ${q['plan'] ?? ''} ${q['today'] ?? q['on'] ?? q['from'] ?? q['amount'] ?? q['gap'] ?? ''}';
    test(label, () {
      final want = q['expect'];
      final p = plans[q['plan']];
      switch (q['fn']) {
        case 'occurrences':
          expect(occurrences(p!, cd(q['from']), cd(q['to'])).map((x) => x.iso),
              want);
        case 'amountOn':
          expect(amountOn(p!, cd(q['on'])), d(want));
        case 'pendingDue':
          expect(pendingDue(p!, inst, cd(q['today'])).map((x) => x.iso), want);
        case 'nextDue':
          expect(nextDue(p!, cd(q['today']))?.iso, want);
        case 'monthlyTotal':
          expect(monthlyTotal(plans.values.toList(), cd(q['today'])), d(want));
        case 'investedThisFy':
          expect(investedThisFy(inst, cd(q['today'])), d(want));
        case 'unitsFor':
          expect(unitsFor(d(q['amount']), d(q['nav'])), d(want));
        case 'monthsToClose':
          expect(monthsToClose(d(q['gap']), d(q['monthly'])), want);
        case 'sipMix':
          final mix = sipMix(plans.values.toList(), targets, cd(q['today']));
          final w = want as Map<String, dynamic>;
          final rows = (w['rows'] as List).cast<Map<String, dynamic>>();
          expect(mix.map((r) => r.group.name), rows.map((r) => r['group']));
          for (var i = 0; i < rows.length; i++) {
            expect(mix[i].amount, d(rows[i]['amount']));
            expect(mix[i].sipPct, rows[i]['sipPct']);
            expect(mix[i].targetPct, rows[i]['targetPct']);
          }
          expect(sipMixWarning(mix)?.group.name, w['warning']);
        default:
          fail('unknown fn ${q['fn']}');
      }
    });
  }

  test('a NAV of zero is refused rather than dividing by it', () {
    expect(() => unitsFor(Decimal.fromInt(100), Decimal.zero),
        throwsArgumentError);
  });

  test('CalendarDate round-trips and orders', () {
    expect(CalendarDate.parse('2026-02-05').iso, '2026-02-05');
    expect(CalendarDate(2026, 1, 31) < CalendarDate(2026, 2, 1), isTrue);
    expect(CalendarDate(2026, 3, 1).addDays(-1).iso, '2026-02-28');
  });
}
