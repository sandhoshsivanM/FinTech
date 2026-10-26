import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/data/repositories/drift_pending_capture_repository.dart';
import 'package:khazana_domain/entities/pending_capture.dart';
import 'package:sqlite3/sqlite3.dart' as sql;

/// The v6 → v7 upgrade on a real file, the way a user's vault takes it.
///
/// There is no stored v6 schema to start from, so the test builds one: open a
/// fresh v7 database, write a capture and a transaction the way a v6 build
/// would have, then strip everything v7 added and wind `user_version` back to
/// 6. Reopening runs the real `onUpgrade`.
void main() {
  late Directory dir;
  late File file;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('khazana_mig_');
    file = File('${dir.path}/vault.db');
  });

  tearDown(() => dir.deleteSync(recursive: true));

  const v7CaptureColumns = [
    'status', 'confidence', 'reason_codes', 'account_id', 'category_id', 'utr',
    'account_last4', 'available_balance', 'instrument', 'kind', 'profile_id',
    'final_amount', 'decided_at', 'posted_txn_id',
  ];

  Set<String> columnsOf(sql.Database db, String table) =>
      db.select('PRAGMA table_info("$table")').map((r) => r['name'] as String).toSet();

  Future<void> seedAsV6() async {
    final db = AppDatabase(NativeDatabase(file));
    await db.customStatement(
        "INSERT INTO categories (id, vault_id, name) VALUES ('c1', 'v1', 'Food')");
    await db.customStatement(
        "INSERT INTO transactions (id, vault_id, amount, type, category_id, date, created_at) "
        "VALUES ('t1', 'v1', '250', 'expense', 'c1', 1, 1)");
    await db.customStatement(
        "INSERT INTO pending_captures (id, vault_id, amount, type, merchant, occurred_at, "
        "source, uncategorized, fingerprint, captured_at) VALUES "
        "('p1', 'v1', '150', 'expense', 'cafe', 1, 'notification', 1, 'fp1', 1)");
    await db.close();

    // Strip v7 back out with raw SQLite, beneath Drift.
    final raw = sql.sqlite3.open(file.path);
    raw.execute('DROP INDEX IF EXISTS idx_pending_captures_status');
    raw.execute('DROP INDEX IF EXISTS idx_pending_captures_fingerprint');
    for (final c in v7CaptureColumns) {
      raw.execute('ALTER TABLE pending_captures DROP COLUMN $c');
    }
    raw.execute('ALTER TABLE transactions DROP COLUMN source');
    raw.execute('ALTER TABLE transactions DROP COLUMN capture_id');
    raw.execute('DROP TABLE capture_account_links');
    raw.execute('PRAGMA user_version = 6');
    expect(columnsOf(raw, 'pending_captures').intersection(v7CaptureColumns.toSet()), isEmpty,
        reason: 'the seed must really look like v6, or this test proves nothing');
    raw.dispose();
  }

  test('upgrading keeps every existing row and adds the v7 schema', () async {
    await seedAsV6();

    final db = AppDatabase(NativeDatabase(file));
    final repo = DriftPendingCaptureRepository(db.pendingCaptureDao);

    // Touching the database runs the migration.
    final capture = await repo.getById('p1');
    expect(capture, isNotNull);
    expect(capture!.amount.toString(), '150');
    expect(capture.status, CaptureStatus.pending,
        reason: 'pre-v7 captures were all awaiting review');
    expect(capture.reasons, isEmpty);
    expect(await repo.exists('v1', 'fp1'), isTrue);

    final txns = await db.select(db.transactions).get();
    expect(txns.single.id, 't1');
    expect(txns.single.source, isNull, reason: 'old entries were manual');
    await db.close();

    final raw = sql.sqlite3.open(file.path);
    expect(raw.select('PRAGMA user_version').first.values.first, 8);
    expect(columnsOf(raw, 'pending_captures'), containsAll(v7CaptureColumns));
    expect(columnsOf(raw, 'transactions'), containsAll(['source', 'capture_id']));
    expect(columnsOf(raw, 'capture_account_links'), isNotEmpty);
    final indexes = raw
        .select("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'pending_captures'")
        .map((r) => r['name'] as String);
    expect(indexes, containsAll(['idx_pending_captures_fingerprint', 'idx_pending_captures_status']));
    raw.dispose();
  });

  test('the dedupe lookup is an index seek, not a table scan', () async {
    final db = AppDatabase(NativeDatabase(file));
    final plan = await db
        .customSelect(
            "EXPLAIN QUERY PLAN SELECT * FROM pending_captures WHERE vault_id = 'v1' AND fingerprint = 'x' LIMIT 1")
        .get();
    final detail = plan.map((r) => r.read<String>('detail')).join(' ');
    expect(detail, contains('idx_pending_captures_fingerprint'));
    await db.close();
  });
}
