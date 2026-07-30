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
}
