import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/di/data_providers.dart';
import '../../../domain/entities/holding.dart';
import '../../../domain/services/portfolio_diff.dart';
import '../../import/broker_parser.dart';

const _uuid = Uuid();

final portfolioDiffEngineProvider =
    Provider<PortfolioDiffEngine>((ref) => const PortfolioDiffEngine());

/// Streams the vault's holdings.
final holdingListProvider = StreamProvider<List<Holding>>((ref) {
  return ref
      .watch(holdingRepositoryProvider)
      .watch(ref.watch(currentVaultIdProvider));
});

/// Aggregate portfolio totals (PRD §14 holdings dashboard).
class PortfolioTotals {
  const PortfolioTotals({required this.invested, required this.market});
  final dynamic invested; // Decimal
  final dynamic market; // Decimal
}

final portfolioImportProvider =
    Provider<PortfolioImporter>((ref) => PortfolioImporter(ref));

class PortfolioImporter {
  PortfolioImporter(this._ref);
  final Ref _ref;

  /// Parses [bytes] with [parser] and reconciles against current holdings.
  Future<PortfolioDiff> preview(IBrokerParser parser, Uint8List bytes) async {
    final staged = parser.parse(bytes);
    final existing = await _ref
        .read(holdingRepositoryProvider)
        .getAll(_ref.read(currentVaultIdProvider));
    return _ref.read(portfolioDiffEngineProvider).diff(existing, staged);
  }

  /// Applies a previewed diff: inserts added, updates changed (idempotent —
  /// unchanged rows are skipped). PRD §14/§16.
  Future<void> apply(PortfolioDiff diff) async {
    final repo = _ref.read(holdingRepositoryProvider);
    final vaultId = _ref.read(currentVaultIdProvider);
    final now = DateTime.now();
    for (final c in diff.added) {
      await repo.save(Holding(
        id: _uuid.v4(),
        vaultId: vaultId,
        symbol: c.staged.symbol,
        exchange: c.staged.exchange,
        quantity: c.staged.quantity,
        avgCost: c.staged.avgCost,
        firstPurchaseDate: now,
        assetType: c.staged.assetType,
      ));
    }
    for (final c in diff.changed) {
      final existing = c.existing!;
      await repo.save(existing.copyWith(
        quantity: c.staged.quantity,
        avgCost: c.staged.avgCost,
      ));
    }
  }
}
