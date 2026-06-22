import 'package:drift/drift.dart';

import '../../domain/entities/holding.dart';
import '../../domain/repositories/holding_repository.dart';
import '../database/app_database.dart';
import '../database/holding_dao.dart';

class DriftHoldingRepository implements IHoldingRepository {
  DriftHoldingRepository(this._dao);
  final HoldingDao _dao;

  @override
  Stream<List<Holding>> watch(String vaultId) =>
      _dao.watchForVault(vaultId).map((rows) => rows.map(_toEntity).toList());

  @override
  Future<List<Holding>> getAll(String vaultId) async =>
      (await _dao.allForVault(vaultId)).map(_toEntity).toList();

  @override
  Future<Holding?> getBySymbol(String vaultId, String symbol) async {
    final row = await _dao.findBySymbol(vaultId, symbol);
    return row == null ? null : _toEntity(row);
  }

  @override
  Future<void> save(Holding h) => _dao.upsert(HoldingsCompanion(
        id: Value(h.id),
        vaultId: Value(h.vaultId),
        symbol: Value(h.symbol),
        exchange: Value(h.exchange),
        quantity: Value(h.quantity),
        avgCost: Value(h.avgCost),
        firstPurchaseDate: Value(h.firstPurchaseDate.millisecondsSinceEpoch),
        assetType: Value(h.assetType.key),
        currency: Value(h.currency),
        lastPrice: Value(h.lastPrice),
      ));

  @override
  Future<void> delete(String id) => _dao.deleteById(id);

  static Holding _toEntity(HoldingRow r) => Holding(
        id: r.id,
        vaultId: r.vaultId,
        symbol: r.symbol,
        exchange: r.exchange,
        quantity: r.quantity,
        avgCost: r.avgCost,
        firstPurchaseDate:
            DateTime.fromMillisecondsSinceEpoch(r.firstPurchaseDate),
        assetType: AssetType.fromKey(r.assetType),
        currency: r.currency,
        lastPrice: r.lastPrice,
      );
}
