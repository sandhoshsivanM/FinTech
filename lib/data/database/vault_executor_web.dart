import 'dart:typed_data';

import 'package:drift/drift.dart';
import 'package:drift/wasm.dart';
import 'package:sqlite3/wasm.dart';

/// Web: runs SQLite via sqlite3.wasm. This first cut uses an in-memory database
/// (nothing written to disk → no unencrypted data at rest). Encrypted IndexedDB
/// persistence (PRD §2 Web Crypto AES-GCM) is the planned follow-up; the pinned
/// sqlite3 2.x wasm lacks the in-memory serialize API needed to snapshot it.
QueryExecutor openVaultExecutor(Uint8List key, String path) {
  return LazyDatabase(() async {
    final sqlite3 = await WasmSqlite3.loadFromUrl(Uri.parse('sqlite3.wasm'));
    return WasmDatabase.inMemory(sqlite3);
  });
}
