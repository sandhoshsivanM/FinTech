// Synced records as stored on the device: ciphertext only, never the decrypted
// value (ADR 0006). Mirrors LocalRecord / RecordStore in webapp-online/src/lib/vault.ts.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import '../crypto/bytes.dart';

class LocalRecord {
  const LocalRecord({
    required this.collection,
    required this.recordId,
    required this.updatedAt,
    required this.deleted,
    required this.ciphertext,
    required this.keyVersion,
  });

  final String collection;
  final String recordId;

  /// ISO-8601 UTC: the last-write-wins clock.
  final String updatedAt;
  final bool deleted;
  final Uint8List? ciphertext;
  final int keyVersion;

  String get key => '$collection/$recordId';

  Map<String, dynamic> toJson() => {
        'collection': collection,
        'recordId': recordId,
        'updatedAt': updatedAt,
        'deleted': deleted,
        'ciphertext': ciphertext == null ? null : toBase64(ciphertext!),
        'keyVersion': keyVersion,
      };

  factory LocalRecord.fromJson(Map<String, dynamic> j) => LocalRecord(
        collection: j['collection'] as String,
        recordId: j['recordId'] as String,
        updatedAt: j['updatedAt'] as String,
        deleted: j['deleted'] as bool,
        ciphertext: j['ciphertext'] == null ? null : fromBase64(j['ciphertext'] as String),
        keyVersion: j['keyVersion'] as int,
      );
}

class Cursor {
  const Cursor(this.since, this.epoch);
  final int since;
  final int epoch;
}

abstract class RecordStore {
  Future<List<LocalRecord>> all();
  Future<void> put(LocalRecord record);
  Future<void> clear();
  Future<List<LocalRecord>> outbox();
  Future<void> queue(LocalRecord record);
  Future<void> unqueue(LocalRecord record);
  Future<Cursor> cursor();
  Future<void> setCursor(Cursor cursor);
}

/// Records, outbox and cursor in memory (tests); [FileRecordStore] persists them.
class MemoryRecordStore implements RecordStore {
  final Map<String, LocalRecord> records = {};
  final Map<String, LocalRecord> queued = {};
  Cursor _cursor = const Cursor(0, 0);

  /// Called after every change; the file store saves here.
  Future<void> changed() async {}

  @override
  Future<List<LocalRecord>> all() async => records.values.toList();
  @override
  Future<void> put(LocalRecord record) async {
    records[record.key] = record;
    await changed();
  }

  @override
  Future<void> clear() async {
    records.clear();
    await changed();
  }

  @override
  Future<List<LocalRecord>> outbox() async => queued.values.toList();
  @override
  Future<void> queue(LocalRecord record) async {
    queued[record.key] = record;
    await changed();
  }

  @override
  Future<void> unqueue(LocalRecord record) async {
    queued.remove(record.key);
    await changed();
  }

  @override
  Future<Cursor> cursor() async => _cursor;
  @override
  Future<void> setCursor(Cursor cursor) async {
    _cursor = cursor;
    await changed();
  }

  /// Forgets everything (sign-out): records, outbox and cursor.
  Future<void> reset() async {
    records.clear();
    queued.clear();
    _cursor = const Cursor(0, 0);
    await changed();
  }

  Map<String, dynamic> toJson() => {
        'records': [for (final r in records.values) r.toJson()],
        'outbox': [for (final r in queued.values) r.toJson()],
        'cursor': {'since': _cursor.since, 'epoch': _cursor.epoch},
      };

  void load(Map<String, dynamic> j) {
    for (final r in j['records'] as List<dynamic>) {
      final rec = LocalRecord.fromJson(r as Map<String, dynamic>);
      records[rec.key] = rec;
    }
    for (final r in j['outbox'] as List<dynamic>) {
      final rec = LocalRecord.fromJson(r as Map<String, dynamic>);
      queued[rec.key] = rec;
    }
    final c = j['cursor'] as Map<String, dynamic>;
    _cursor = Cursor(c['since'] as int, c['epoch'] as int);
  }
}

/// One JSON file in the app's private storage. Every value in it is already
/// ciphertext, so the file needs no further protection.
class FileRecordStore extends MemoryRecordStore {
  FileRecordStore(this._file);
  final File _file;

  static Future<FileRecordStore> open(File file) async {
    final store = FileRecordStore(file);
    if (await file.exists()) {
      try {
        store.load(jsonDecode(await file.readAsString()) as Map<String, dynamic>);
      } on Object {
        // A damaged file starts empty: the server still has everything pushed.
      }
    }
    return store;
  }

  @override
  Future<void> changed() async {
    final tmp = File('${_file.path}.tmp');
    await tmp.writeAsString(jsonEncode(toJson()), flush: true);
    await tmp.rename(_file.path);
  }

  Future<void> delete() async {
    if (await _file.exists()) await _file.delete();
  }
}
