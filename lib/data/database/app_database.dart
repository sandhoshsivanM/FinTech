import 'dart:ffi';
import 'dart:io';

import 'package:decimal/decimal.dart';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:sqlcipher_flutter_libs/sqlcipher_flutter_libs.dart';
import 'package:sqlite3/open.dart';

import '../../core/security/key_derivation_service.dart';
import '../models/tables.dart';
import 'budget_dao.dart';
import 'category_dao.dart';
import 'converters.dart';
import 'merchant_alias_dao.dart';
import 'transaction_dao.dart';

part 'app_database.g.dart';

/// The encrypted application database (PRD §2: Drift + SQLCipher AES-256).
///
/// The 32-byte vault key is supplied via `PRAGMA key` in the open setup
/// callback — see [_openEncrypted]. A probe query immediately follows so an
/// incorrect key fails fast (PRD §16 encryption-at-rest, hard CI gate).
@DriftDatabase(
  tables: [Categories, Transactions, Budgets, MerchantAliases],
  daos: [TransactionDao, CategoryDao, BudgetDao, MerchantAliasDao],
)
class AppDatabase extends _$AppDatabase {
  /// General constructor (also used by tests with an in-memory executor).
  AppDatabase(super.e);

  /// Opens (or creates) the encrypted database file at [path] using [key].
  factory AppDatabase.encrypted({
    required Uint8List key,
    required String path,
  }) {
    return AppDatabase(_openEncrypted(key, path));
  }

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) async {
          await m.createAll();
          await _createFtsObjects();
        },
      );

  /// FTS5 full-text index over transactions (PRD §5/§16 search ≤100ms/10k).
  /// Kept in sync by triggers (never `LIKE '%x%'`). The indexed content is
  /// merchant + note + the joined category name.
  Future<void> _createFtsObjects() async {
    await customStatement(
      "CREATE VIRTUAL TABLE transactions_fts USING fts5("
      "txn_id UNINDEXED, content, tokenize='porter unicode61');",
    );
    const contentExpr =
        "coalesce(new.merchant,'')||' '||coalesce(new.note,'')||' '||"
        "coalesce((SELECT name FROM categories WHERE id = new.category_id),'')";
    await customStatement(
      'CREATE TRIGGER transactions_ai AFTER INSERT ON transactions BEGIN '
      'INSERT INTO transactions_fts(txn_id, content) VALUES (new.id, $contentExpr); END;',
    );
    await customStatement(
      'CREATE TRIGGER transactions_ad AFTER DELETE ON transactions BEGIN '
      'DELETE FROM transactions_fts WHERE txn_id = old.id; END;',
    );
    await customStatement(
      'CREATE TRIGGER transactions_au AFTER UPDATE ON transactions BEGIN '
      'DELETE FROM transactions_fts WHERE txn_id = old.id; '
      'INSERT INTO transactions_fts(txn_id, content) VALUES (new.id, $contentExpr); END;',
    );
  }
}

bool _sqlCipherConfigured = false;

void _configureSqlCipher() {
  if (_sqlCipherConfigured) return;
  _sqlCipherConfigured = true;
  // Use the bundled SQLCipher library, NOT the system SQLite (PRD pitfall:
  // iOS/macOS system-SQLite shadowing → silent plaintext DB).
  open
    ..overrideFor(OperatingSystem.android, openCipherOnAndroid)
    ..overrideFor(OperatingSystem.iOS, DynamicLibrary.process)
    ..overrideFor(OperatingSystem.macOS, DynamicLibrary.process);
}

LazyDatabase _openEncrypted(Uint8List key, String path) {
  return LazyDatabase(() async {
    _configureSqlCipher();
    await applyWorkaroundToOpenSqlCipherOnOldAndroidVersions();
    final keyHex = KeyDerivationService.toHex(key);
    return NativeDatabase(
      File(path),
      setup: (rawDb) {
        // PRAGMA key MUST be the first statement on the connection.
        rawDb.execute('PRAGMA key = "x\'$keyHex\'";');
        // Probe: throws if the key is wrong or the file is not SQLCipher.
        rawDb.execute('SELECT count(*) FROM sqlite_master;');
      },
    );
  });
}
