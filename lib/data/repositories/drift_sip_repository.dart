import 'package:decimal/decimal.dart';
import 'package:drift/drift.dart';

import 'package:khazana_domain/entities/asset_group.dart';
import 'package:khazana_domain/entities/holding.dart';
import 'package:khazana_domain/entities/portfolio.dart';
import 'package:khazana_domain/entities/sip.dart';
import 'package:khazana_domain/services/sip_schedule.dart';
import '../database/app_database.dart';
import '../database/sip_dao.dart';

/// Maps the v9 SIP and allocation-target rows to and from domain entities.
class DriftSipRepository {
  DriftSipRepository(this._dao);

  final SipDao _dao;

  // -- Targets -----------------------------------------------------------------

  Stream<Map<AssetGroup, int>> watchTargets(String vaultId) =>
      _dao.watchTargets(vaultId).map(_toTargets);

  Future<Map<AssetGroup, int>> targets(String vaultId) async =>
      _toTargets(await _dao.targets(vaultId));

  /// Writes the full set. Callers validate first (`validateTargets`); this
  /// refuses an incomplete set too, because a stored set that does not total
  /// 100 would make every gap on the screen wrong.
  Future<void> saveTargets(String vaultId, Map<AssetGroup, int> targets) {
    final sum = targets.values.fold<int>(0, (a, b) => a + b);
    if (sum != 100) {
      throw ArgumentError.value(sum, 'targets', 'must total 100');
    }
    return _dao.replaceTargets(vaultId, {
      for (final e in targets.entries)
        if (e.value > 0) e.key.name: e.value,
    }, DateTime.now().millisecondsSinceEpoch);
  }

  static Map<AssetGroup, int> _toTargets(List<AllocationTargetRow> rows) {
    final out = <AssetGroup, int>{};
    for (final r in rows) {
      // A group key from a newer build is skipped rather than fatal.
      final g = AssetGroup.values
          .where((g) => g.name == r.groupKey)
          .firstOrNull;
      if (g != null) out[g] = r.targetPct;
    }
    return out;
  }

  // -- Plans -------------------------------------------------------------------

  Stream<List<SipPlan>> watchPlans(String vaultId) => _dao
      .watchPlans(vaultId)
      .map((rows) => rows.map(_toPlan).nonNulls.toList());

  Future<List<SipPlan>> plans(String vaultId) async =>
      (await _dao.plans(vaultId)).map(_toPlan).nonNulls.toList();

  Future<void> savePlan(SipPlan p) => _dao.upsertPlan(
    SipPlansCompanion.insert(
      id: p.id,
      vaultId: p.vaultId,
      instrumentId: p.instrumentId,
      name: p.name,
      assetType: p.assetType.key,
      amount: p.amount,
      dayOfMonth: p.dayOfMonth,
      startDate: p.startDate.iso,
      stepUpPct: Value(p.stepUpPct),
      remind: Value(p.remind),
      active: Value(p.active),
      createdAt: DateTime.now().millisecondsSinceEpoch,
    ),
  );

  Future<void> deletePlan(String id) => _dao.deletePlan(id);

  static SipPlan? _toPlan(SipPlanRow r) {
    final type = AssetType.tryFromKey(r.assetType);
    if (type == null) return null;
    return SipPlan(
      id: r.id,
      vaultId: r.vaultId,
      instrumentId: r.instrumentId,
      name: r.name,
      assetType: type,
      amount: r.amount,
      dayOfMonth: r.dayOfMonth,
      startDate: CalendarDate.parse(r.startDate),
      stepUpPct: r.stepUpPct,
      remind: r.remind,
      active: r.active,
    );
  }

  // -- Instalments -------------------------------------------------------------

  Stream<List<SipInstalment>> watchInstalments(String vaultId) =>
      _dao.watchInstalments(vaultId).map((rows) => rows.map(_toInst).toList());

  Future<List<SipInstalment>> instalments(String vaultId) async =>
      (await _dao.instalments(vaultId)).map(_toInst).toList();

  /// Mark done: records a reviewed manual buy of `amount ÷ nav` units at
  /// [nav] on the due date, and the instalment that owns it, in one
  /// transaction. Returns the instalment.
  Future<SipInstalment> markDone({
    required SipPlan plan,
    required CalendarDate dueDate,
    required Decimal amount,
    required Decimal nav,
    required String instalmentId,
    required String tradeId,
  }) async {
    final units = unitsFor(amount, nav);
    final now = DateTime.now().millisecondsSinceEpoch;
    await _dao.recordInstalment(
      SipInstalmentsCompanion.insert(
        id: instalmentId,
        vaultId: plan.vaultId,
        sipId: plan.id,
        dueDate: dueDate.iso,
        status: SipInstalmentStatus.done.key,
        amount: amount,
        units: Value(units),
        nav: Value(nav),
        tradeId: Value(tradeId),
        decidedAt: now,
      ),
      trade: TradesCompanion.insert(
        id: tradeId,
        vaultId: plan.vaultId,
        instrumentId: plan.instrumentId,
        side: TradeSide.buy.key,
        quantity: units,
        pricePerUnit: nav,
        tradeDate: dueDate.toDateTime().millisecondsSinceEpoch,
        source: Value(TradeSource.manual.key),
        // The user confirmed it by tapping Mark done.
        isReviewed: const Value(true),
        createdAt: now,
      ),
    );
    return SipInstalment(
      id: instalmentId,
      sipId: plan.id,
      dueDate: dueDate,
      status: SipInstalmentStatus.done,
      amount: amount,
      units: units,
      nav: nav,
      tradeId: tradeId,
    );
  }

  /// Skipped: an answer with no money and no trade.
  Future<void> markSkipped({
    required SipPlan plan,
    required CalendarDate dueDate,
    required String instalmentId,
  }) => _dao.recordInstalment(
    SipInstalmentsCompanion.insert(
      id: instalmentId,
      vaultId: plan.vaultId,
      sipId: plan.id,
      dueDate: dueDate.iso,
      status: SipInstalmentStatus.skipped.key,
      amount: Decimal.zero,
      decidedAt: DateTime.now().millisecondsSinceEpoch,
    ),
  );

  /// Removes the answer and, for a done one, the buy it recorded.
  Future<void> undo(String instalmentId) => _dao.undoInstalment(instalmentId);

  static SipInstalment _toInst(SipInstalmentRow r) => SipInstalment(
    id: r.id,
    sipId: r.sipId,
    dueDate: CalendarDate.parse(r.dueDate),
    status: SipInstalmentStatus.fromKey(r.status),
    amount: r.amount,
    units: r.units,
    nav: r.nav,
    tradeId: r.tradeId,
  );
}
