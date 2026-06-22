import 'dart:convert';
import 'dart:typed_data';

import 'package:csv/csv.dart';
import 'package:decimal/decimal.dart';
import 'package:excel/excel.dart';

import '../../core/errors/app_error.dart';
import '../../domain/entities/holding.dart';
import '../../domain/services/portfolio_diff.dart';

/// Parses a broker portfolio file into [StagedHolding]s (PRD §14).
abstract interface class IBrokerParser {
  String get brokerName;
  List<StagedHolding> parse(Uint8List bytes);
}

/// Zerodha holdings export (XLSX). The sheet has a preamble, then a table whose
/// header row contains "Symbol", a quantity column, and an average-price column.
/// Row mapping is separated from byte-decoding so it is unit-testable.
class ZerodhaXlsxParser implements IBrokerParser {
  const ZerodhaXlsxParser();

  @override
  String get brokerName => 'Zerodha';

  @override
  List<StagedHolding> parse(Uint8List bytes) {
    final excel = Excel.decodeBytes(bytes);
    final sheet = excel.tables.values.firstOrNull;
    if (sheet == null) {
      throw const ImportError('The file has no sheets.');
    }
    final rows = sheet.rows
        .map((r) => r.map((c) => c?.value?.toString()).toList())
        .toList();
    return parseRows(rows);
  }

  /// Maps already-decoded rows. Locates the header row, then reads holdings.
  static List<StagedHolding> parseRows(List<List<String?>> rows) {
    final headerIndex = rows.indexWhere(_isHeader);
    if (headerIndex < 0) {
      throw const ImportError(
          "This file doesn't match Zerodha holdings format.");
    }
    final header = rows[headerIndex].map((c) => (c ?? '').toLowerCase()).toList();
    final symbolCol = header.indexWhere((c) => c.contains('symbol'));
    final qtyCol = header.indexWhere((c) => c.contains('qty') || c.contains('quantity'));
    final avgCol = header.indexWhere(
        (c) => c.contains('average') || c.contains('avg'));
    if (symbolCol < 0 || qtyCol < 0 || avgCol < 0) {
      throw const ImportError('Missing Symbol/Quantity/Average columns.');
    }

    final out = <StagedHolding>[];
    for (var i = headerIndex + 1; i < rows.length; i++) {
      final row = rows[i];
      final symbol = _at(row, symbolCol)?.trim();
      if (symbol == null || symbol.isEmpty) continue;
      final qty = _decimal(_at(row, qtyCol));
      final avg = _decimal(_at(row, avgCol));
      if (qty == null || avg == null) continue;
      out.add(StagedHolding(
        symbol: symbol.toUpperCase(),
        exchange: 'NSE',
        quantity: qty,
        avgCost: avg,
        assetType: AssetType.equityEtf,
      ));
    }
    if (out.isEmpty) {
      throw const ImportError('No holdings rows found in the file.');
    }
    return out;
  }

  static bool _isHeader(List<String?> row) {
    final joined = row.map((c) => (c ?? '').toLowerCase()).join('|');
    return joined.contains('symbol') &&
        (joined.contains('qty') || joined.contains('quantity')) &&
        (joined.contains('average') || joined.contains('avg'));
  }

  static String? _at(List<String?> row, int i) =>
      (i >= 0 && i < row.length) ? row[i] : null;

  static Decimal? _decimal(String? raw) {
    if (raw == null) return null;
    final cleaned = raw.replaceAll(RegExp(r'[,₹\s]'), '');
    return Decimal.tryParse(cleaned);
  }
}

/// Upstox holdings export (CSV). Same header-detection strategy as Zerodha but
/// the instrument column is often named "Instrument"/"Symbol".
class UpstoxCsvParser implements IBrokerParser {
  const UpstoxCsvParser();

  @override
  String get brokerName => 'Upstox';

  @override
  List<StagedHolding> parse(Uint8List bytes) {
    final text = utf8.decode(bytes, allowMalformed: true);
    final rows = const CsvToListConverter(shouldParseNumbers: false)
        .convert(text)
        .map((r) => r.map((c) => c?.toString()).toList())
        .toList();
    return _parseRows(rows);
  }

  static List<StagedHolding> _parseRows(List<List<String?>> rows) {
    final headerIndex = rows.indexWhere(_isHeader);
    if (headerIndex < 0) {
      throw const ImportError("This file doesn't match Upstox holdings format.");
    }
    final header = rows[headerIndex].map((c) => (c ?? '').toLowerCase()).toList();
    final symbolCol = header.indexWhere(
        (c) => c.contains('symbol') || c.contains('instrument') || c.contains('company'));
    final qtyCol = header.indexWhere((c) => c.contains('qty') || c.contains('quantity'));
    final avgCol =
        header.indexWhere((c) => c.contains('average') || c.contains('avg') || c.contains('buy'));
    if (symbolCol < 0 || qtyCol < 0 || avgCol < 0) {
      throw const ImportError('Missing Symbol/Quantity/Average columns.');
    }
    final out = <StagedHolding>[];
    for (var i = headerIndex + 1; i < rows.length; i++) {
      final row = rows[i];
      final symbol = ZerodhaXlsxParser._at(row, symbolCol)?.trim();
      if (symbol == null || symbol.isEmpty) continue;
      final qty = ZerodhaXlsxParser._decimal(ZerodhaXlsxParser._at(row, qtyCol));
      final avg = ZerodhaXlsxParser._decimal(ZerodhaXlsxParser._at(row, avgCol));
      if (qty == null || avg == null) continue;
      out.add(StagedHolding(
        symbol: symbol.toUpperCase(),
        exchange: 'NSE',
        quantity: qty,
        avgCost: avg,
      ));
    }
    if (out.isEmpty) throw const ImportError('No holdings rows found.');
    return out;
  }

  static bool _isHeader(List<String?> row) {
    final j = row.map((c) => (c ?? '').toLowerCase()).join('|');
    return (j.contains('symbol') || j.contains('instrument') || j.contains('company')) &&
        (j.contains('qty') || j.contains('quantity')) &&
        (j.contains('average') || j.contains('avg') || j.contains('buy'));
  }

  /// Exposed for unit tests (mirrors [parse] without byte decoding).
  static List<StagedHolding> parseRowsForTest(List<List<String?>> rows) =>
      _parseRows(rows);
}
