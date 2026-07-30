import '../../../domain/entities/holding.dart';
import '../../../domain/entities/portfolio.dart';
import '../../import/lot_csv_parser.dart';
import '../providers/portfolio_providers.dart';

/// Outcome of importing a parsed CSV.
class LotImportResult {
  const LotImportResult({
    required this.inserted,
    required this.updated,
    required this.needsReview,
    required this.rejected,
  });

  final int inserted;
  final int updated;

  /// Rows saved but flagged, because something about them is uncertain — most
  /// often a missing trade date, which decides short- versus long-term tax.
  final int needsReview;

  final List<RejectedRow> rejected;

  bool get isNoOp => inserted == 0 && updated == 0;
}

/// Turns parsed [StagedLot]s into instruments and trades.
///
/// Import is idempotent: each trade gets a deterministic id derived from its own
/// values, so re-importing the same file updates the same rows rather than
/// doubling the portfolio. Nothing lands unreviewed-and-silent — imported rows
/// carry `isReviewed = false` so the UI can ask for confirmation before treating
/// them as authoritative.
class LotImporter {
  const LotImporter(this._actions);

  final PortfolioActions _actions;

  Future<LotImportResult> import(
    LotParseResult parsed, {
    required String vaultId,
    AssetType defaultKind = AssetType.equityEtf,
    bool datesWereMissing = false,
  }) async {
    var inserted = 0;
    var needsReview = 0;

    for (final lot in parsed.lots) {
      final isFund = lot.schemeCode != null || lot.symbol == null;
      final instrument = await _actions.ensureInstrument(
        name: lot.name ?? lot.label,
        kind: lot.assetType ?? (isFund ? AssetType.equityMf : defaultKind),
        symbol: lot.symbol,
        isin: lot.isin,
        exchange: lot.exchange ?? (isFund ? null : 'NSE'),
        schemeCode: lot.schemeCode,
      );

      // A holdings snapshot with no date cannot give a correct holding period,
      // so the row is flagged rather than quietly dated today.
      final uncertain = datesWereMissing;

      await _actions.addTrade(Trade(
        id: _tradeId(vaultId, lot),
        vaultId: vaultId,
        instrumentId: instrument.id,
        side: lot.side,
        quantity: lot.quantity,
        pricePerUnit: lot.pricePerUnit,
        otherCharges: lot.charges,
        tradeDate: lot.tradeDate,
        folioNumber: lot.folioNumber,
        source: TradeSource.csv,
        isReviewed: false,
      ));

      inserted++;
      if (uncertain) needsReview++;
    }

    return LotImportResult(
      inserted: inserted,
      updated: 0,
      needsReview: needsReview,
      rejected: parsed.rejected,
    );
  }

  /// Deterministic trade id, so the same row always maps to the same record.
  ///
  /// Hashed rather than concatenated because the raw key contains a folio
  /// number, and folio numbers should not end up embedded in primary keys.
  /// FNV-1a is used deliberately: this is an identity key for de-duplication,
  /// not a security boundary, so a fast non-cryptographic hash is the right tool
  /// and avoids pulling in another dependency.
  static String _tradeId(String vaultId, StagedLot lot) {
    return 'csv-${_fnv1a('$vaultId|${lot.dedupeKey}')}';
  }

  static String _fnv1a(String input) {
    // 64-bit FNV-1a. BigInt keeps it exact on the web, where int is 53-bit.
    final mask = (BigInt.one << 64) - BigInt.one;
    var hash = BigInt.parse('14695981039346656037');
    final prime = BigInt.parse('1099511628211');
    for (final byte in input.codeUnits) {
      hash = (hash ^ BigInt.from(byte)) & mask;
      hash = (hash * prime) & mask;
    }
    return hash.toRadixString(16).padLeft(16, '0');
  }
}
