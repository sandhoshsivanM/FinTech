import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'app_database.dart';

part 'notification_delivery_dao.g.dart';

/// The notification delivery log — what powers the cooldown.
@DriftAccessor(tables: [NotificationDeliveries])
class NotificationDeliveryDao extends DatabaseAccessor<AppDatabase>
    with _$NotificationDeliveryDaoMixin {
  NotificationDeliveryDao(super.db);

  /// How far back the cooldown can possibly care about.
  ///
  /// The longest cooldown the settings screen offers is measured in hours, and
  /// budget keys carry their own month, so anything older than this can never
  /// suppress anything. Bounding the read keeps a long-lived vault from loading
  /// thousands of rows at unlock just to answer "did this fire recently".
  static const Duration horizon = Duration(days: 45);

  /// Deliveries within [horizon], newest first.
  Future<List<NotificationDeliveryRow>> recentFor(String vaultId,
      {DateTime? now}) {
    final cutoff = (now ?? DateTime.now()).subtract(horizon);
    return (select(notificationDeliveries)
          ..where((d) =>
              d.vaultId.equals(vaultId) &
              d.firedAt.isBiggerOrEqualValue(cutoff.millisecondsSinceEpoch))
          ..orderBy([(d) => OrderingTerm.desc(d.firedAt)]))
        .get();
  }

  /// Writes a batch in one transaction. Upsert, so re-recording the same
  /// notification is idempotent rather than accumulating a row per attempt.
  Future<void> recordAll(
      List<NotificationDeliveriesCompanion> rows) async {
    if (rows.isEmpty) return;
    await batch((b) => b.insertAllOnConflictUpdate(notificationDeliveries, rows));
  }

  Future<void> markRead(String id, int at) {
    return (update(notificationDeliveries)..where((d) => d.id.equals(id)))
        .write(NotificationDeliveriesCompanion(readAt: Value(at)));
  }

  /// Drops rows past [horizon]. Called opportunistically; the log is a cooldown
  /// ledger, not history worth keeping — and every row holds rendered body text.
  Future<int> pruneOlderThan(int cutoffMs) {
    return (delete(notificationDeliveries)
          ..where((d) => d.firedAt.isSmallerThanValue(cutoffMs)))
        .go();
  }

  Future<void> clearVault(String vaultId) {
    return (delete(notificationDeliveries)
          ..where((d) => d.vaultId.equals(vaultId)))
        .go();
  }
}
