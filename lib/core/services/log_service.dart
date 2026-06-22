import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart';

import '../../data/database/logs_database.dart';
import '../../domain/services/log_sanitizer.dart';

/// Log severity (PRD §5A ENUM).
enum LogLevel { debug, info, warn, error, fatal }

/// Offline-only error logging (PRD §5). Sanitizes PII, enforces the 30-day
/// prune and 10k rolling buffer, and exports to plaintext JSON on demand.
class LogService {
  LogService(
    this._db, {
    required this.appVersion,
    required this.deviceModel,
    required this.osVersion,
    DateTime Function()? clock,
  }) : _clock = clock ?? DateTime.now;

  final LogsDatabase _db;
  final String appVersion;
  final String deviceModel;
  final String osVersion;
  final DateTime Function() _clock;

  static const int maxRows = 10000; // PRD §5B rolling buffer
  static const Duration retention = Duration(days: 30); // PRD §5B prune

  /// Convenience device-info capture from dart:io (no extra dependency).
  static String get platformModel => Platform.operatingSystem;
  static String get platformVersion => Platform.operatingSystemVersion;

  Future<void> log(
    LogLevel level,
    String tag,
    String message, {
    String? stackTrace,
    String? vaultId,
  }) async {
    // PRD §5B: debug logs only in debug builds.
    if (level == LogLevel.debug) {
      assert(() {
        return true;
      }());
      const isDebug = !bool.fromEnvironment('dart.vm.product');
      if (!isDebug) return;
    }
    await _db.insertLog(LogsCompanion(
      level: Value(level.name),
      tag: Value(LogSanitizer.scrub(tag)),
      message: Value(LogSanitizer.scrub(message)),
      stackTrace: Value(stackTrace == null ? null : LogSanitizer.scrub(stackTrace)),
      vaultId: Value(vaultId),
      appVersion: Value(appVersion),
      deviceModel: Value(deviceModel),
      osVersion: Value(osVersion),
      timestamp: Value(_clock().millisecondsSinceEpoch),
    ));
    await _db.trimToMax(maxRows);
  }

  /// Prunes entries older than 30 days (PRD §5B: run on each app launch).
  Future<void> pruneOnLaunch() async {
    final cutoff = _clock().subtract(retention).millisecondsSinceEpoch;
    await _db.deleteOlderThan(cutoff);
    await _db.trimToMax(maxRows);
  }

  /// Serializes all logs to plaintext JSON (PRD §5B export → logs.json).
  Future<String> exportJson() async {
    final rows = await _db.all();
    return const JsonEncoder.withIndent('  ').convert([
      for (final r in rows)
        {
          'level': r.level,
          'tag': r.tag,
          'message': r.message,
          'stack_trace': r.stackTrace,
          'vault_id': r.vaultId,
          'app_version': r.appVersion,
          'device_model': r.deviceModel,
          'os_version': r.osVersion,
          'timestamp': r.timestamp,
        },
    ]);
  }
}
