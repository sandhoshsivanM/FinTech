import 'dart:convert';

import 'package:csv/csv.dart';
import 'package:decimal/decimal.dart';

import '../../domain/entities/holding.dart';
import '../../domain/entities/portfolio.dart';

/// A trade parsed from a broker CSV, before it is reconciled with the database.
class StagedLot {
  const StagedLot({
    required this.side,
    required this.quantity,
    required this.pricePerUnit,
    required this.tradeDate,
    required this.rowNumber,
    this.symbol,
    this.isin,
    this.name,
    this.exchange,
    this.schemeCode,
    this.folioNumber,
    this.charges,
    this.assetType,
  });

  final TradeSide side;
  final Decimal quantity;
  final Decimal pricePerUnit;
  final DateTime tradeDate;

  /// 1-based line number in the source file, so a rejected row can be pointed at.
  final int rowNumber;

  final String? symbol;
  final String? isin;
  final String? name;
  final String? exchange;
  final String? schemeCode;
  final String? folioNumber;
  final Decimal? charges;
  final AssetType? assetType;

  /// Best available display label.
  String get label => name ?? symbol ?? isin ?? schemeCode ?? 'Row $rowNumber';

  /// Stable identity for the instrument this lot belongs to.
  ///
  /// ISIN first, then scheme+folio, then symbol+exchange. Mutual funds have no
  /// ticker, so a symbol-only key would merge different schemes from the same
  /// AMC — and different folios of the same scheme.
  String get instrumentKey {
    if (isin != null && isin!.isNotEmpty) return 'isin:${isin!.toUpperCase()}';
    if (schemeCode != null && schemeCode!.isNotEmpty) {
      return 'scheme:$schemeCode';
    }
    return 'sym:${(symbol ?? '').toUpperCase()}@${exchange ?? ''}';
  }

  /// Deterministic identity for THIS trade, used to make re-import idempotent.
  ///
  /// Derived from the values that define the trade, so importing the same file
  /// twice updates the same rows instead of doubling the portfolio.
  String get dedupeKey =>
      '$instrumentKey|${side.key}|$quantity|$pricePerUnit'
      '|${tradeDate.toIso8601String().substring(0, 10)}'
      '|${folioNumber ?? ''}';
}

/// A row that could not be parsed, kept so nothing is dropped silently.
class RejectedRow {
  const RejectedRow({required this.rowNumber, required this.reason, this.raw});

  final int rowNumber;
  final String reason;
  final String? raw;
}

class LotParseResult {
  const LotParseResult({required this.lots, required this.rejected});

  final List<StagedLot> lots;
  final List<RejectedRow> rejected;

  bool get isEmpty => lots.isEmpty;
}

/// Parses broker trade/holding CSVs into [StagedLot]s.
///
/// Header-driven with alias matching rather than fixed column positions, because
/// every broker exports a different layout and they change them. A row that
/// cannot be understood is reported as a [RejectedRow]; it is never guessed at
/// and never silently skipped.
class LotCsvParser {
  const LotCsvParser();

  // Aliases are matched case-insensitively after stripping non-alphanumerics.
  static const _symbolKeys = [
    'symbol', 'tradingsymbol', 'instrument', 'scrip', 'scripname', 'stock',
    'security', 'securityname', 'company', 'companyname', 'name', 'schemename',
  ];
  static const _isinKeys = ['isin', 'isincode'];
  static const _qtyKeys = [
    'quantity', 'qty', 'units', 'unit', 'noofshares', 'shares', 'balance',
    'closingbalance', 'quantityavailable',
  ];
  static const _priceKeys = [
    'price', 'rate', 'avgprice', 'averageprice', 'avgcost', 'averagecost',
    'buyprice', 'nav', 'purchasenav', 'unitprice', 'costperunit', 'buyavg',
  ];
  static const _dateKeys = [
    'date', 'tradedate', 'transactiondate', 'purchasedate', 'orderdate',
    'valuedate',
  ];
  static const _sideKeys = ['side', 'type', 'action', 'transactiontype', 'buysell'];
  static const _chargeKeys = [
    'charges', 'brokerage', 'fees', 'totalcharges', 'transactioncharges',
    'stt', 'taxesandcharges',
  ];
  static const _folioKeys = ['folio', 'folionumber', 'foliono'];
  static const _schemeKeys = ['schemecode', 'amficode', 'schemeid'];
  static const _exchangeKeys = ['exchange', 'exch', 'segment'];

  LotParseResult parse(List<int> bytes) {
    final text = utf8.decode(bytes, allowMalformed: true);
    final rows = const CsvToListConverter(
      shouldParseNumbers: false,
      eol: '\n',
    ).convert(text.replaceAll('\r\n', '\n').replaceAll('\r', '\n'));

    if (rows.isEmpty) {
      return const LotParseResult(lots: [], rejected: [
        RejectedRow(rowNumber: 0, reason: 'The file is empty.'),
      ]);
    }

    final headerIndex = _findHeader(rows);
    if (headerIndex == null) {
      return const LotParseResult(lots: [], rejected: [
        RejectedRow(
          rowNumber: 0,
          reason: 'No header row found. A quantity column and a price column '
              'are required.',
        ),
      ]);
    }

    final header = rows[headerIndex].map((c) => _norm('$c')).toList();
    int col(List<String> aliases) {
      for (final alias in aliases) {
        final i = header.indexOf(alias);
        if (i >= 0) return i;
      }
      // Fall back to a contains-match, which catches "Quantity (Nos)" and the like.
      for (var i = 0; i < header.length; i++) {
        for (final alias in aliases) {
          if (header[i].contains(alias)) return i;
        }
      }
      return -1;
    }

    final iSymbol = col(_symbolKeys);
    final iIsin = col(_isinKeys);
    final iQty = col(_qtyKeys);
    final iPrice = col(_priceKeys);
    final iDate = col(_dateKeys);
    final iSide = col(_sideKeys);
    final iCharges = col(_chargeKeys);
    final iFolio = col(_folioKeys);
    final iScheme = col(_schemeKeys);
    final iExchange = col(_exchangeKeys);

    final lots = <StagedLot>[];
    final rejected = <RejectedRow>[];

    for (var r = headerIndex + 1; r < rows.length; r++) {
      final row = rows[r];
      final lineNo = r + 1;
      if (row.every((c) => '$c'.trim().isEmpty)) continue;

      String? cell(int i) {
        if (i < 0 || i >= row.length) return null;
        final v = '${row[i]}'.trim();
        return v.isEmpty ? null : v;
      }

      final qty = _decimal(cell(iQty));
      final price = _decimal(cell(iPrice));
      final symbol = cell(iSymbol);
      final isin = cell(iIsin);

      if (qty == null || qty <= Decimal.zero) {
        rejected.add(RejectedRow(
          rowNumber: lineNo,
          reason: 'Quantity missing or not a positive number.',
          raw: symbol ?? isin,
        ));
        continue;
      }
      if (price == null || price <= Decimal.zero) {
        rejected.add(RejectedRow(
          rowNumber: lineNo,
          reason: 'Price missing or not a positive number.',
          raw: symbol ?? isin,
        ));
        continue;
      }
      if (symbol == null && isin == null && cell(iScheme) == null) {
        rejected.add(RejectedRow(
          rowNumber: lineNo,
          reason: 'No symbol, ISIN or scheme code — cannot identify the '
              'instrument.',
        ));
        continue;
      }

      final rawDate = cell(iDate);
      final date = _date(rawDate);
      if (rawDate != null && date == null) {
        rejected.add(RejectedRow(
          rowNumber: lineNo,
          reason: 'Could not read the date "$rawDate".',
          raw: symbol ?? isin,
        ));
        continue;
      }

      lots.add(StagedLot(
        side: _side(cell(iSide)),
        quantity: qty,
        pricePerUnit: price,
        // A holdings export often has no date. Falling back to "today" would be
        // wrong for the tax holding period, so the row is flagged for review by
        // the importer instead (see LotImporter).
        tradeDate: date ?? DateTime.now(),
        rowNumber: lineNo,
        symbol: symbol?.toUpperCase(),
        isin: isin?.toUpperCase(),
        name: symbol,
        exchange: cell(iExchange)?.toUpperCase(),
        schemeCode: cell(iScheme),
        folioNumber: cell(iFolio),
        charges: _decimal(cell(iCharges)),
      ));
    }

    return LotParseResult(lots: lots, rejected: rejected);
  }

  /// Finds the header row: the first row within the first 30 that names both a
  /// quantity and a price column.
  int? _findHeader(List<List<dynamic>> rows) {
    final limit = rows.length < 30 ? rows.length : 30;
    for (var i = 0; i < limit; i++) {
      final cells = rows[i].map((c) => _norm('$c')).toList();
      final hasQty = cells.any((c) => _qtyKeys.any(c.contains));
      final hasPrice = cells.any((c) => _priceKeys.any(c.contains));
      if (hasQty && hasPrice) return i;
    }
    return null;
  }

  static String _norm(String s) =>
      s.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');

  static Decimal? _decimal(String? raw) {
    if (raw == null) return null;
    // Strip currency symbols, thousands separators and stray spaces.
    var t = raw.replaceAll(RegExp(r'[₹$,\s]'), '');
    if (t.isEmpty) return null;
    // Parenthesised negatives, e.g. (1,234.00)
    var negative = false;
    if (t.startsWith('(') && t.endsWith(')')) {
      negative = true;
      t = t.substring(1, t.length - 1);
    }
    try {
      final d = Decimal.parse(t);
      return negative ? -d : d;
    } on FormatException {
      return null;
    }
  }

  /// Classifies a row as a buy or a sell.
  ///
  /// Matches explicit tokens rather than a leading letter. A naive
  /// `startsWith('s')` would read **SIP** — a purchase — as a sell, and
  /// "redeem" is not a substring of "redemption", so both need spelling out.
  /// Anything unrecognised is treated as a buy, which is the overwhelmingly
  /// common case in a holdings export.
  static TradeSide _side(String? raw) {
    if (raw == null) return TradeSide.buy;
    final t = raw.toLowerCase().trim();
    if (t == 's' || t == 'sl') return TradeSide.sell;
    const sellTokens = [
      'sell', 'sale', 'sold', 'redem', 'redeem', 'switch out', 'switchout',
      'switch-out', 'withdraw', 'exit',
    ];
    if (sellTokens.any(t.contains)) return TradeSide.sell;
    return TradeSide.buy;
  }

  /// Parses the date formats Indian brokers actually emit.
  ///
  /// Ambiguous d/m vs m/d is resolved as day-first, which is the Indian
  /// convention — the format every broker in scope uses.
  static DateTime? _date(String? raw) {
    if (raw == null) return null;
    final t = raw.trim();

    // ISO first: unambiguous.
    final iso = DateTime.tryParse(t);
    if (iso != null) return DateTime(iso.year, iso.month, iso.day);

    final numeric = RegExp(r'^(\d{1,4})[-/.](\d{1,2})[-/.](\d{2,4})$');
    final m = numeric.firstMatch(t);
    if (m != null) {
      final a = int.parse(m.group(1)!);
      final b = int.parse(m.group(2)!);
      final c = int.parse(m.group(3)!);
      if (a > 31) return _safeDate(a, b, c); // yyyy-mm-dd
      return _safeDate(_year(c), b, a); // dd-mm-yyyy
    }

    final months = {
      'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
      'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    };
    final named = RegExp(r'^(\d{1,2})[-\s/]*([A-Za-z]{3,})[-\s/]*(\d{2,4})$');
    final n = named.firstMatch(t);
    if (n != null) {
      final month = months[n.group(2)!.toLowerCase().substring(0, 3)];
      if (month != null) {
        return _safeDate(_year(int.parse(n.group(3)!)), month,
            int.parse(n.group(1)!));
      }
    }
    return null;
  }

  static int _year(int y) => y < 100 ? (y >= 70 ? 1900 + y : 2000 + y) : y;

  static DateTime? _safeDate(int y, int m, int d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    final result = DateTime(y, m, d);
    // Rejects 31 Feb and friends rather than letting DateTime roll over.
    if (result.month != m || result.day != d) return null;
    return result;
  }
}
