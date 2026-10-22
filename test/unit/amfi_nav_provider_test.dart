import 'dart:io';

import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/features/investments/data/amfi_nav_provider.dart';

/// Tests for the AMFI NAV parser. Pure string parsing — no network involved.
void main() {
  Decimal d(String s) => Decimal.parse(s);

  // A realistic excerpt: AMC name lines, a scheme-type heading, the column
  // header, blank lines, and data rows — the shape the real file has.
  const sample = '''
Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Flexi Cap Fund)

Aditya Birla Sun Life Mutual Fund

119551;INF209K01157;INF209K01165;Aditya Birla Sun Life Flexi Cap Fund - Growth;1543.2100;30-Jul-2026
119552;INF209K01173;-;Aditya Birla Sun Life Flexi Cap Fund - IDCW;145.6700;30-Jul-2026

PPFAS Mutual Fund

122639;INF879O01019;INF879O01027;Parag Parikh Flexi Cap Fund - Growth;89.4523;30-Jul-2026
199999;-;-;Some Suspended Scheme;N.A.;30-Jul-2026
''';

  test('parses data rows and ignores headings, blanks and AMC names', () {
    final navs = AmfiNavProvider.parse(sample);
    // Four data rows, one of which is N.A. and must be dropped.
    expect(navs, hasLength(3));
    expect(navs.keys, containsAll(['119551', '119552', '122639']));
  });

  test('reads scheme code, name, NAV and date', () {
    final nav = AmfiNavProvider.parse(sample)['122639']!;
    expect(nav.schemeCode, '122639');
    expect(nav.schemeName, 'Parag Parikh Flexi Cap Fund - Growth');
    expect(nav.nav, d('89.4523'));
    expect(nav.date, DateTime(2026, 7, 30));
  });

  test('prefers the growth ISIN and falls back to the reinvestment one', () {
    final navs = AmfiNavProvider.parse(sample);
    expect(navs['119551']!.isin, 'INF209K01157');
    // Second row has '-' in the reinvestment column; the payout ISIN is used.
    expect(navs['119552']!.isin, 'INF209K01173');
  });

  test('drops "N.A." rather than recording it as zero', () {
    // A zero NAV would read as a total loss on that holding — far worse than
    // simply having no price for it.
    final navs = AmfiNavProvider.parse(sample);
    expect(navs.containsKey('199999'), isFalse);
  });

  test('skips the header row', () {
    final navs = AmfiNavProvider.parse(sample);
    expect(navs.containsKey('Scheme Code'), isFalse);
  });

  test('an empty body yields no NAVs rather than throwing', () {
    expect(AmfiNavProvider.parse(''), isEmpty);
    expect(AmfiNavProvider.parse('\n\n\n'), isEmpty);
  });

  test('tolerates CRLF line endings', () {
    final navs = AmfiNavProvider.parse(
        '119551;INF209K01157;INF209K01165;A Fund;100.5;30-Jul-2026\r\n');
    expect(navs['119551']!.nav, d('100.5'));
  });

  test('a malformed row is skipped without taking the file down', () {
    final navs = AmfiNavProvider.parse('''
119551;INF209K01157;INF209K01165;Good Fund;100.5;30-Jul-2026
this line is nonsense
;;;;
119552;INF209K01173;-;Another Fund;200.75;30-Jul-2026
''');
    expect(navs, hasLength(2));
    expect(navs['119552']!.nav, d('200.75'));
  });

  test('a missing date leaves the field null instead of inventing one', () {
    final navs =
        AmfiNavProvider.parse('119551;A;B;Fund Name;100.5;not-a-date\n');
    expect(navs['119551']!.nav, d('100.5'));
    expect(navs['119551']!.date, isNull);
  });

  group('2026 eight-column format', () {
    // The file AMFI publishes since 2026: Plan and Option split out of the
    // name, which moved the NAV from the fifth column to the seventh.
    const current = '''
Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date

Axis Mutual Fund

135762;INF846K01WO1;-;Axis Children's Fund;Direct Plan;Growth Option;28.9452;21-Oct-2026
135760;INF846K01WK9;-;Axis Children's Fund;Regular Plan;;23.2349;21-Oct-2026
''';

    test('reads the NAV from its new column instead of dropping every row', () {
      final navs = AmfiNavProvider.parse(current);
      expect(navs, hasLength(2));
      expect(navs['135762']!.nav, d('28.9452'));
      expect(navs['135762']!.date, DateTime(2026, 10, 21));
      expect(navs['135762']!.isin, 'INF846K01WO1');
    });

    test('joins plan and option back into the scheme name', () {
      final navs = AmfiNavProvider.parse(current);
      expect(navs['135762']!.schemeName,
          "Axis Children's Fund - Direct Plan - Growth Option");
      expect(navs['135760']!.schemeName, "Axis Children's Fund - Regular Plan",
          reason: 'an empty option is left out');
    });

    test('columns are found by header name, not position', () {
      final navs = AmfiNavProvider.parse(
          'Date;Net Asset Value;Scheme Name;ISIN A;ISIN B;Scheme Code\n'
          '17-Oct-2026;55.5;Reordered Fund;INF1;-;999001\n');
      expect(navs['999001']!.nav, d('55.5'));
      expect(navs['999001']!.isin, 'INF1');
    });

    test('an unrecognised header yields nothing rather than misread columns',
        () {
      expect(
          AmfiNavProvider.parse('Scheme Code;Fund;Price;When\n'
              '119551;Something;123.45;17-Oct-2026\n'),
          isEmpty);
    });

    test('exponents, thousands separators and signs are refused, not guessed',
        () {
      final navs = AmfiNavProvider.parse(
          '119551;A;B;Exp Fund;1e5;17-Oct-2026\n'
          '119552;A;B;Comma Fund;1,234.50;17-Oct-2026\n'
          '119553;A;B;Signed Fund;+12.5;17-Oct-2026\n');
      expect(navs, isEmpty);
    });

    test('an over-long line is skipped without parsing it', () {
      final hostile =
          '119551;A;B;${'x' * AmfiNavProvider.maxLineLength};12.5;17-Oct-2026';
      final navs = AmfiNavProvider.parse(
          '$hostile\n122639;INF879O01027;-;Good;89.1234;17-Oct-2026\n');
      expect(navs.keys, ['122639']);
    });
  });

  group('shared fixture with the backend', () {
    // contracts/fixtures/amfi is read by both this parser and the server's
    // (backend/services/MarketData). Same input, same schemes and prices.
    String fixture(String name) =>
        File('contracts/fixtures/amfi/$name').readAsStringSync();

    test(
        'the current file gives the schemes the server keeps, plus the '
        'undated one the phone tolerates', () {
      final navs = AmfiNavProvider.parse(fixture('navall_sample.txt'));
      // Server: 119551, 119552, 120828, 122639, 122640. The phone also keeps
      // 120831, whose date is blank (date null), by design.
      expect(navs.keys.toList()..sort(),
          ['119551', '119552', '120828', '120831', '122639', '122640']);
      expect(navs['120831']!.date, isNull);
      expect(navs['119551']!.nav, d('123.4567'));
      expect(navs['119552']!.isin, 'INF209K01173');
    });

    test('the legacy six-column file gives the same prices', () {
      final current = AmfiNavProvider.parse(fixture('navall_sample.txt'));
      final legacy = AmfiNavProvider.parse(fixture('navall_legacy_sample.txt'));
      expect(legacy.keys.toSet(), current.keys.toSet());
      for (final code in current.keys) {
        expect(legacy[code]!.nav, current[code]!.nav, reason: code);
      }
    });
  });
}
