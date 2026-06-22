import 'package:decimal/decimal.dart';
import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'budget_dao.dart';
import 'category_dao.dart';
import 'converters.dart';
import 'encrypted_executor.dart';
import 'fingerprint_dao.dart';
import 'holding_dao.dart';
import 'liability_dao.dart';
import 'merchant_alias_dao.dart';
import 'transaction_dao.dart';

part 'app_database.g.dart';

/// The encrypted application database (PRD §2: Drift + SQLCipher AES-256).
///
/// The 32-byte vault key is supplied via `PRAGMA key` in the open setup
/// callback — see `openEncrypted`. A probe query immediately follows so an
/// incorrect key fails fast (PRD §16 encryption-at-rest, hard CI gate).
@DriftDatabase(
  tables: [
    Categories,
    Transactions,
    Budgets,
    MerchantAliases,
    Holdings,
    Liabilities,
    Goals,
    GoalContributions,
    RecurringRules,
    FxRates,
    TransactionFingerprints,
  ],
  daos: [
    TransactionDao,
    CategoryDao,
    BudgetDao,
    MerchantAliasDao,
    HoldingDao,
    LiabilityDao,
    FingerprintDao,
  ],
)
class AppDatabase extends _$AppDatabase {
  /// General constructor (also used by tests with an in-memory executor).
  AppDatabase(super.e);

  /// Opens (or creates) the encrypted database file at [path] using [key].
  factory AppDatabase.encrypted({
    required Uint8List key,
    required String path,
  }) {
    return AppDatabase(openEncrypted(key, path));
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
