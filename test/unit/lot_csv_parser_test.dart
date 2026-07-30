import 'dart:convert';

import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/domain/entities/portfolio.dart';
import 'package:khazana/features/import/lot_csv_parser.dart';

void main() {
  const parser = LotCsvParser();
  Decimal d(String s) => Decimal.parse(s);

  LotParseResult parse(String csv) => parser.parse(utf8.encode(csv));

  group('header detection', () {
    test('finds the header even with preamble rows above it', () {
      // Broker exports routinely start with a title and a blank line.
      final r = parse('''
Holdings Statement
Generated on 30-Jul-2026

Symbol,Quantity,Avg. Price
INFY,10,1500.50
''');
      expect(r.lots, hasLength(1));
      expect(r.lots.single.symbol, 'INFY');
      expect(r.lots.single.quantity, d('10'));
      expect(r.lots.single.pricePerUnit, d('1500.50'));
    });

    test('reports a clear reason when no header can be found', () {
      final r = parse('just,some,text\nand,more,text\n');
      expect(r.lots, isEmpty);
      expect(r.rejected.single.reason, contains('No header row'));
    });

    test('matches columns with units in the name', () {
      final r = parse('Scrip Name,Quantity (Nos),Rate (INR)\nTCS,5,3000\n');
      expect(r.lots.single.quantity, d('5'));
      expect(r.lots.single.pricePerUnit, d('3000'));
    });
  });

  group('number cleaning', () {
    test('strips currency symbols and thousands separators', () {
      final r = parse('Symbol,Qty,Price\nINFY,"1,000","₹ 1,500.50"\n');
      expect(r.lots.single.quantity, d('1000'));
      expect(r.lots.single.pricePerUnit, d('1500.50'));
    });

    test('reads parenthesised negatives as negative charges', () {
      final r = parse('Symbol,Qty,Price,Charges\nINFY,10,100,(25.50)\n');
      expect(r.lots.single.charges, d('-25.50'));
    });

    test('rejects rather than guesses when quantity is not a number', () {
      final r = parse('Symbol,Qty,Price\nINFY,abc,100\n');
      expect(r.lots, isEmpty);
      expect(r.rejected.single.rowNumber, 2);
      expect(r.rejected.single.reason, contains('Quantity'));
    });

    test('rejects a zero or negative quantity', () {
      final r = parse('Symbol,Qty,Price\nINFY,0,100\nTCS,-5,100\n');
      expect(r.lots, isEmpty);
      expect(r.rejected, hasLength(2));
    });

    test('rejects a row with no identifier at all', () {
      final r = parse('Symbol,Qty,Price\n,10,100\n');
      expect(r.lots, isEmpty);
      expect(r.rejected.single.reason, contains('cannot identify'));
    });
  });

  group('date parsing', () {
    test('reads ISO dates', () {
      final r = parse('Symbol,Qty,Price,Date\nINFY,1,100,2026-03-15\n');
      expect(r.lots.single.tradeDate, DateTime(2026, 3, 15));
    });

    test('reads day-first dates, which is the Indian convention', () {
      // 03/04/2026 is 3 April, NOT 4 March. Getting this backwards silently
      // shifts holding periods and therefore the tax treatment.
      final r = parse('Symbol,Qty,Price,Date\nINFY,1,100,03/04/2026\n');
      expect(r.lots.single.tradeDate, DateTime(2026, 4, 3));
    });

    test('reads named months', () {
      final r = parse('Symbol,Qty,Price,Date\nINFY,1,100,15-Mar-2026\n');
      expect(r.lots.single.tradeDate, DateTime(2026, 3, 15));
    });

    test('reads two-digit years', () {
      final r = parse('Symbol,Qty,Price,Date\nINFY,1,100,15-03-26\n');
      expect(r.lots.single.tradeDate, DateTime(2026, 3, 15));
    });

    test('rejects an impossible date rather than rolling it over', () {
      // DateTime(2026, 2, 31) would silently become 3 March.
      final r = parse('Symbol,Qty,Price,Date\nINFY,1,100,31-02-2026\n');
      expect(r.lots, isEmpty);
      expect(r.rejected.single.reason, contains('date'));
    });

    test('rejects an unreadable date rather than defaulting to today', () {
      final r = parse('Symbol,Qty,Price,Date\nINFY,1,100,sometime last year\n');
      expect(r.lots, isEmpty);
      expect(r.rejected.single.reason, contains('Could not read the date'));
    });

    test('accepts a row with no date column at all', () {
      // Holdings snapshots often have no dates; the importer flags these.
      final r = parse('Symbol,Qty,Price\nINFY,1,100\n');
      expect(r.lots, hasLength(1));
    });
  });

  group('side detection', () {
    test('defaults to buy', () {
      expect(parse('Symbol,Qty,Price\nINFY,1,100\n').lots.single.side,
          TradeSide.buy);
    });

    test('detects sell and redemption', () {
      final r = parse('''
Symbol,Qty,Price,Type
INFY,1,100,SELL
TCS,1,100,Redemption
WIPRO,1,100,BUY
''');
      expect(r.lots[0].side, TradeSide.sell);
      expect(r.lots[1].side, TradeSide.sell);
      expect(r.lots[2].side, TradeSide.buy);
    });

    test('SIP is a purchase, not a sell', () {
      // A leading-letter check would read SIP as "s..." and get this backwards,
      // flipping a buy into a sell and corrupting FIFO matching.
      final r = parse('Symbol,Qty,Price,Type\nINFY,1,100,SIP\n');
      expect(r.lots.single.side, TradeSide.buy);
    });

    test('switch-out is a sell', () {
      final r = parse('Symbol,Qty,Price,Type\nINFY,1,100,Switch Out\n');
      expect(r.lots.single.side, TradeSide.sell);
    });
  });

  group('instrument identity', () {
    test('prefers ISIN over symbol', () {
      final r = parse(
          'Symbol,ISIN,Qty,Price\nINFY,INE009A01021,10,1500\n');
      expect(r.lots.single.instrumentKey, 'isin:INE009A01021');
    });

    test('uses the scheme code for funds, which have no ticker', () {
      final r = parse('Scheme Name,Scheme Code,Units,NAV\n'
          'Parag Parikh Flexi Cap,122639,120.5,62.4\n');
      expect(r.lots.single.instrumentKey, 'scheme:122639');
      expect(r.lots.single.quantity, d('120.5'));
      expect(r.lots.single.pricePerUnit, d('62.4'));
    });

    test('two folios of the same scheme stay distinct', () {
      // This is the collision a symbol-only key would cause: same scheme, two
      // folios, which must not be merged into one lot.
      final r = parse('''
Scheme Name,Scheme Code,Folio,Units,NAV
Parag Parikh Flexi Cap,122639,12345/67,100,60
Parag Parikh Flexi Cap,122639,98765/43,50,60
''');
      expect(r.lots, hasLength(2));
      expect(r.lots[0].dedupeKey, isNot(r.lots[1].dedupeKey));
      expect(r.lots[0].folioNumber, '12345/67');
      expect(r.lots[1].folioNumber, '98765/43');
    });

    test('symbol identity includes the exchange', () {
      final r = parse('Symbol,Exchange,Qty,Price\nINFY,BSE,1,100\n');
      expect(r.lots.single.instrumentKey, 'sym:INFY@BSE');
    });
  });

  group('dedupe key', () {
    test('is stable for identical rows', () {
      final a = parse('Symbol,Qty,Price,Date\nINFY,10,1500,01-04-2026\n');
      final b = parse('Symbol,Qty,Price,Date\nINFY,10,1500,01-04-2026\n');
      expect(a.lots.single.dedupeKey, b.lots.single.dedupeKey);
    });

    test('differs when any defining value differs', () {
      final base = parse('Symbol,Qty,Price,Date,Type\n'
              'INFY,10,1500,01-04-2026,BUY\n')
          .lots
          .single
          .dedupeKey;
      final otherQty = parse('Symbol,Qty,Price,Date,Type\n'
              'INFY,11,1500,01-04-2026,BUY\n')
          .lots
          .single
          .dedupeKey;
      final otherSide = parse('Symbol,Qty,Price,Date,Type\n'
              'INFY,10,1500,01-04-2026,SELL\n')
          .lots
          .single
          .dedupeKey;
      final otherDate = parse('Symbol,Qty,Price,Date,Type\n'
              'INFY,10,1500,02-04-2026,BUY\n')
          .lots
          .single
          .dedupeKey;
      expect({base, otherQty, otherSide, otherDate}, hasLength(4));
    });
  });

  group('resilience', () {
    test('skips blank lines without reporting them as errors', () {
      final r = parse('Symbol,Qty,Price\nINFY,1,100\n\n\nTCS,2,200\n');
      expect(r.lots, hasLength(2));
      expect(r.rejected, isEmpty);
    });

    test('keeps good rows and reports only the bad ones', () {
      final r = parse('''
Symbol,Qty,Price
INFY,10,1500
BADROW,notanumber,1500
TCS,5,3000
''');
      expect(r.lots, hasLength(2));
      expect(r.rejected, hasLength(1));
      expect(r.rejected.single.rowNumber, 3);
    });

    test('handles CRLF line endings', () {
      final r = parse('Symbol,Qty,Price\r\nINFY,10,1500\r\n');
      expect(r.lots, hasLength(1));
    });

    test('an empty file is reported, not silently accepted', () {
      final r = parse('');
      expect(r.lots, isEmpty);
      expect(r.rejected, isNotEmpty);
    });
  });
}
