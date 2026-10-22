import 'dart:convert';
import 'dart:io';

import 'package:khazana_domain/entities/transaction.dart';
import 'package:khazana_domain/services/notification_parser.dart';
import 'package:flutter_test/flutter_test.dart';

// Twin of webapp/src/domain/notificationParser.test.ts. The fixture-driven group
// loads test/fixtures/parser_cases.json, which both suites must agree on.
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
    expect(p.accountLast4, '1234');
    expect(p.availableBalance.toString(), '45000');
    // No reference number, so the balance is what keeps this key unique.
    expect(p.fingerprintInput, '2026-01-05|1234.56|amazon|1234|45000');
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

  group('hostile input', () {
    // The notification listener sees every app's notifications, so this text
    // is attacker-controlled. Each probe would take seconds to minutes against
    // a pattern with adjacent `\s*` groups; collapsing whitespace first keeps
    // every pattern linear.
    final probes = <String, String>{
      'spaces after a balance keyword': 'debited balance${' ' * 1900}x',
      'spaces after an account keyword': 'debited a/c${' ' * 1900}x',
      'spaces after a reference keyword': 'debited rs 5 ref${' ' * 1900}x',
      'many merchant keywords, no terminator':
          'debited rs 5 ${'to a ' * 390}',
    };
    for (final e in probes.entries) {
      test('${e.key} parses in linear time', () {
        final sw = Stopwatch()..start();
        parser.parse(e.value, now: now);
        expect(sw.elapsedMilliseconds, lessThan(200));
      });
    }

    test('anything longer than a bank alert is rejected outright', () {
      final long = 'Rs 100 debited from a/c XX1234. ${'x' * NotificationParser.maxLength}';
      expect(parser.parse(long, now: now), isNull);
    });
  });

  group('shared fixture', () {
    late Map<String, dynamic> fixture;

    setUpAll(() {
      fixture = jsonDecode(File('test/fixtures/parser_cases.json').readAsStringSync())
          as Map<String, dynamic>;
    });

    test('the two copies of the fixture are byte-identical', () {
      // Vitest cannot import from outside webapp/, so the file is duplicated
      // rather than symlinked. Duplicated files drift; this is what stops it.
      // If this fails, copy test/fixtures/parser_cases.json over
      // webapp/src/domain/__fixtures__/parser_cases.json.
      final dart = File('test/fixtures/parser_cases.json').readAsBytesSync();
      final web =
          File('webapp/src/domain/__fixtures__/parser_cases.json').readAsBytesSync();
      expect(web, dart,
          reason: 'the Dart and TypeScript suites are no longer asserting '
              'against the same cases, so the parity contract is not being '
              'checked');
    });

    test('every case', () {
      final fixedNow = DateTime.parse(fixture['now'] as String);
      final failures = <String>[];
      for (final c in (fixture['cases'] as List).cast<Map<String, dynamic>>()) {
        final name = c['name'] as String;
        final p = parser.parse(c['text'] as String,
            now: fixedNow, sender: c['sender'] as String?);
        final expected = c['expect'] as Map<String, dynamic>?;
        if (expected == null) {
          if (p != null) failures.add('$name: expected null, got a parse');
          continue;
        }
        if (p == null) {
          failures.add('$name: expected a parse, got null');
          continue;
        }
        final actual = <String, Object?>{
          'type': p.type.name,
          'kind': p.kind.key,
          'amount': p.amount.toString(),
          'merchant': p.merchant,
          'timestamp': p.timestamp,
          'utr': p.utr,
          'accountLast4': p.accountLast4,
          'availableBalance': p.availableBalance?.toString(),
          'instrument': p.instrument.key,
          'profileId': p.profileId,
          'fingerprint': p.fingerprintInput,
        };
        for (final e in expected.entries) {
          if (actual[e.key] != e.value) {
            failures.add('$name: ${e.key} expected ${e.value}, got ${actual[e.key]}');
          }
        }
      }
      expect(failures, isEmpty, reason: failures.join('\n'));
    });
  });
}
