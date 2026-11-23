import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'app_database.dart';

part 'sip_dao.g.dart';

/// SIP plans, their instalments and the allocation targets (Drift v9).
@DriftAccessor(tables: [AllocationTargets, SipPlans, SipInstalments, Trades])
class SipDao extends DatabaseAccessor<AppDatabase> with _$SipDaoMixin {
  SipDao(super.db);

  // -- Allocation targets ----------------------------------------------------

  Stream<List<AllocationTargetRow>> watchTargets(String vaultId) => (select(
    allocationTargets,
  )..where((t) => t.vaultId.equals(vaultId))).watch();

  Future<List<AllocationTargetRow>> targets(String vaultId) => (select(
    allocationTargets,
  )..where((t) => t.vaultId.equals(vaultId))).get();

  /// Replaces the whole set at once, so a half-written set (which would not
  /// total 100) can never be observed.
  Future<void> replaceTargets(
    String vaultId,
    Map<String, int> byGroup,
    int now,
  ) {
    return transaction(() async {
      await (delete(
        allocationTargets,
      )..where((t) => t.vaultId.equals(vaultId))).go();
      for (final e in byGroup.entries) {
        await into(allocationTargets).insert(
          AllocationTargetsCompanion.insert(
            vaultId: vaultId,
            groupKey: e.key,
            targetPct: e.value,
            updatedAt: now,
          ),
        );
      }
    });
  }

  // -- Plans -------------------------------------------------------------------

  Stream<List<SipPlanRow>> watchPlans(String vaultId) =>
      (select(sipPlans)
            ..where((t) => t.vaultId.equals(vaultId))
            ..orderBy([(t) => OrderingTerm.asc(t.createdAt)]))
          .watch();

  Future<List<SipPlanRow>> plans(String vaultId) =>
      (select(sipPlans)..where((t) => t.vaultId.equals(vaultId))).get();

  Future<void> upsertPlan(SipPlansCompanion row) =>
      into(sipPlans).insertOnConflictUpdate(row);

  /// Deletes a plan and its answers. Trades it recorded stay: they are real
  /// buys the user confirmed, and removing a plan is not undoing a purchase.
  Future<void> deletePlan(String id) => transaction(() async {
    await (delete(sipInstalments)..where((t) => t.sipId.equals(id))).go();
    await (delete(sipPlans)..where((t) => t.id.equals(id))).go();
  });

  // -- Instalments -------------------------------------------------------------

  Stream<List<SipInstalmentRow>> watchInstalments(String vaultId) =>
      (select(sipInstalments)..where((t) => t.vaultId.equals(vaultId))).watch();

  Future<List<SipInstalmentRow>> instalments(String vaultId) =>
      (select(sipInstalments)..where((t) => t.vaultId.equals(vaultId))).get();

  /// Records the answer and, for a done instalment, its buy — atomically, so
  /// there is never a trade without its instalment or the reverse.
  Future<void> recordInstalment(
    SipInstalmentsCompanion instalment, {
    TradesCompanion? trade,
  }) {
    return transaction(() async {
      if (trade != null) await into(trades).insert(trade);
      await into(sipInstalments).insert(instalment);
    });
  }

  /// Undo: removes the answer and the trade it created.
  Future<void> undoInstalment(String instalmentId) {
    return transaction(() async {
      final row = await (select(
        sipInstalments,
      )..where((t) => t.id.equals(instalmentId))).getSingleOrNull();
      if (row == null) return;
      if (row.tradeId != null) {
        await (delete(trades)..where((t) => t.id.equals(row.tradeId!))).go();
      }
      await (delete(
        sipInstalments,
      )..where((t) => t.id.equals(instalmentId))).go();
    });
  }
}
