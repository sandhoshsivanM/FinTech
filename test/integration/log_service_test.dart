import 'dart:convert';

import 'package:drift/native.dart';
import 'package:fintech_os/core/services/log_service.dart';
import 'package:fintech_os/data/database/logs_database.dart';
import 'package:flutter_test/flutter_test.dart';

/// LogService prune/rolling-buffer and PII behavior on an in-memory logs DB
/// (PRD §5B).
void main() {
  late LogsDatabase db;

  LogService service({DateTime Function()? clock}) => LogService(
        db,
        appVersion: '1.0.0',
        deviceModel: 'test',
        osVersion: 'test-os',
        clock: clock,
      );

  setUp(() => db = LogsDatabase(NativeDatabase.memory()));
  tearDown(() => db.close());

  test('log scrubs PII before writing (no raw amounts persisted)', () async {
    await service().log(LogLevel.error, 'ImportService', 'failed at 125000');
    final rows = await db.all();
    expect(rows.single.message, 'failed at [redacted]');
  });

  test('pruneOnLaunch deletes entries older than 30 days', () async {
    final now = DateTime(2026, 6, 22);
    // Old entry (40 days ago)
    await service(clock: () => now.subtract(const Duration(days: 40)))
        .log(LogLevel.info, 't', 'old');
    // Recent entry
    await service(clock: () => now).log(LogLevel.info, 't', 'recent');

    await service(clock: () => now).pruneOnLaunch();
    final rows = await db.all();
    expect(rows.map((r) => r.message), ['recent']);
  });

  test('rolling buffer trims to the newest maxRows', () async {
    // Insert maxRows + 5 directly with increasing timestamps.
    for (var i = 0; i < LogService.maxRows + 5; i++) {
      await db.insertLog(LogsCompanion.insert(
        level: 'info',
        tag: 't',
        message: 'm$i',
        appVersion: '1.0.0',
        deviceModel: 'test',
        osVersion: 'test',
        timestamp: 1000 + i,
      ));
    }
    await db.trimToMax(LogService.maxRows);
    expect(await db.countRows(), LogService.maxRows);
    // Oldest (m0) should be gone; newest retained.
    final rows = await db.all();
    expect(rows.any((r) => r.message == 'm0'), isFalse);
  });

  test('exportJson serializes all fields', () async {
    await service().log(LogLevel.warn, 'Backup', 'note');
    final json = jsonDecode(await service().exportJson()) as List;
    expect(json.single['tag'], 'Backup');
    expect(json.single['level'], 'warn');
    expect(json.single['device_model'], 'test');
  });
}
