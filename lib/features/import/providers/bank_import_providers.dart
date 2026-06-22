import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/di/data_providers.dart';
import '../../../data/database/app_database.dart' as db;
import '../../../domain/entities/transaction.dart';
import '../../../domain/services/bank_fingerprint.dart';
import '../../../domain/services/bank_statement.dart';
import '../bank_parsers.dart';
import 'package:drift/drift.dart' show Value;

const _uuid = Uuid();

class BankImportPreview {
  BankImportPreview({required this.staged, required this.duplicates});
  final List<StagedBankTxn> staged;
  final int duplicates;
  List<StagedBankTxn> get fresh =>
      staged.where((t) => !t.isDuplicate).toList();
  int get newCount => fresh.length;
}

final bankImportProvider =
    Provider<BankImporter>((ref) => BankImporter(ref));

class BankImporter {
  BankImporter(this._ref);
  final Ref _ref;

  /// Parses + normalizes + fingerprints + dedups (PRD §13C) and suggests a
  /// category from learned merchant aliases.
  Future<BankImportPreview> preview(
      IBankStatementParser parser, Uint8List bytes) async {
    final staged = parser.parseRows(decodeCsv(bytes));
    final vaultId = _ref.read(currentVaultIdProvider);
    final fpDao = _ref.read(databaseProvider).fingerprintDao;
    final aliasRepo = _ref.read(merchantAliasRepositoryProvider);

    for (final t in staged) {
      t.fingerprint = await BankFingerprint.compute(t.fingerprintInput);
    }
    final existing = await fpDao.existingFor(
        vaultId, staged.map((t) => t.fingerprint!).toList());

    var duplicates = 0;
    for (final t in staged) {
      if (existing.contains(t.fingerprint)) {
        t.isDuplicate = true;
        duplicates++;
      } else {
        t.suggestedCategoryId =
            await aliasRepo.categoryForMerchant(vaultId, t.description);
      }
    }
    return BankImportPreview(staged: staged, duplicates: duplicates);
  }

  /// Commits the fresh staged rows in a single DB transaction, inserting both
  /// the transactions and their fingerprints (PRD §13D).
  Future<int> commit(List<StagedBankTxn> fresh, String fallbackCategoryId) async {
    final database = _ref.read(databaseProvider);
    final vaultId = _ref.read(currentVaultIdProvider);
    final now = DateTime.now().millisecondsSinceEpoch;

    await database.transaction(() async {
      for (final t in fresh) {
        final id = _uuid.v4();
        await database.transactionDao.upsert(db.TransactionsCompanion(
          id: Value(id),
          vaultId: Value(vaultId),
          amount: Value(t.amount),
          type: Value(t.direction == BankTxnDirection.credit
              ? TxnType.income.name
              : TxnType.expense.name),
          categoryId: Value(t.suggestedCategoryId ?? fallbackCategoryId),
          merchant: Value(t.description),
          note: const Value('Imported from bank statement'),
          date: Value(t.date.millisecondsSinceEpoch),
          createdAt: Value(now),
        ));
        await database.fingerprintDao.insert(vaultId, t.fingerprint!);
      }
    });
    return fresh.length;
  }
}
