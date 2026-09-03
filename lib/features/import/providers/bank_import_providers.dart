import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/di/data_providers.dart';
import '../../../domain/entities/transaction.dart';
import '../../../domain/services/bank_fingerprint.dart';
import '../../../domain/services/bank_statement.dart';
import '../../accounts/providers/account_providers.dart';
import '../bank_parsers.dart';

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
    final txns = _ref.read(transactionRepositoryProvider);
    // An imported row is an ordinary transaction. Writing it straight to the
    // DAO skipped LedgerWriter, so importing a statement left the Accounts
    // screen and net worth unchanged — indistinguishable from an import that
    // silently did nothing.
    final ledger = _ref.read(ledgerWriterProvider);
    final now = DateTime.now();

    final categoryNames = {
      for (final c in await _ref.read(categoryRepositoryProvider).getAll(vaultId))
        c.id: c.name,
    };

    await database.transaction(() async {
      for (final t in fresh) {
        final txn = Txn(
          id: _uuid.v4(),
          vaultId: vaultId,
          amount: t.amount,
          type: t.direction == BankTxnDirection.credit
              ? TxnType.income
              : TxnType.expense,
          categoryId: t.suggestedCategoryId ?? fallbackCategoryId,
          merchant: t.description,
          note: 'Imported from bank statement',
          date: t.date,
          createdAt: now,
          accountId: ledger.defaultCashId,
        );
        await txns.save(txn);
        await ledger.writeEntry(txn,
            categoryName: categoryNames[txn.categoryId]);
        await database.fingerprintDao.insert(vaultId, t.fingerprint!);
      }
    });
    return fresh.length;
  }
}
