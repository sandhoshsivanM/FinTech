import 'package:drift/drift.dart';

import 'encrypted_executor.dart';

part 'logs_database.g.dart';

/// Local crash/error log (PRD §5A). Stored in its own encrypted `logs.db`
/// (same vault key), zero network — manual export only.
@DataClassName('LogRow')
class Logs extends Table {
  IntColumn get id => integer().autoIncrement()();

  /// ENUM: debug | info | warn | error | fatal.
  TextColumn get level => text()();
  TextColumn get tag => text()();
  TextColumn get message => text()();
  TextColumn get stackTrace => text().nullable()();
  TextColumn get vaultId => text().nullable()();
  TextColumn get appVersion => text()();
  TextColumn get deviceModel => text()();
  TextColumn get osVersion => text()();
  IntColumn get timestamp => integer()(); // Unix ms
}

@DriftDatabase(tables: [Logs])
class LogsDatabase extends _$LogsDatabase {
  LogsDatabase(super.e);

  factory LogsDatabase.encrypted({
    required Uint8List key,
    required String path,
  }) {
    return LogsDatabase(openEncrypted(key, path));
  }

  @override
  int get schemaVersion => 1;

  Future<int> insertLog(LogsCompanion row) => into(logs).insert(row);

  Future<List<LogRow>> all() =>
      (select(logs)..orderBy([(l) => OrderingTerm.desc(l.timestamp)])).get();

  Future<int> countRows() async {
    final c = countAll();
    final q = selectOnly(logs)..addColumns([c]);
    return (await q.getSingle()).read(c) ?? 0;
  }

  /// Deletes entries older than [cutoffMs] (PRD §5B: 30-day prune).
  Future<int> deleteOlderThan(int cutoffMs) =>
      (delete(logs)..where((l) => l.timestamp.isSmallerThanValue(cutoffMs)))
          .go();

  /// Trims to the newest [maxRows] (PRD §5B: 10,000 rolling buffer).
  Future<void> trimToMax(int maxRows) async {
    final total = await countRows();
    if (total <= maxRows) return;
    final toDelete = total - maxRows;
    // Delete the oldest `toDelete` rows.
    final oldest = await (select(logs)
          ..orderBy([(l) => OrderingTerm.asc(l.timestamp)])
          ..limit(toDelete))
        .get();
    final ids = oldest.map((r) => r.id).toList();
    await (delete(logs)..where((l) => l.id.isIn(ids))).go();
  }
}
