import 'package:decimal/decimal.dart';
import 'package:drift/native.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/data/repositories/drift_account_repository.dart';
import 'package:khazana/data/repositories/drift_pending_capture_repository.dart';
import 'package:khazana/data/repositories/drift_posting_repository.dart';
import 'package:khazana/domain/entities/account.dart';
import 'package:khazana/domain/entities/pending_capture.dart';
import 'package:khazana/domain/entities/posting.dart';
import 'package:khazana/domain/entities/transaction.dart';
import 'package:khazana/domain/services/account_ledger.dart';
import 'package:flutter_test/flutter_test.dart';

/// Integration tests for the v3 double-entry storage on an in-memory Drift DB:
/// accounts + postings round-trip and reproduce net worth through the pure
/// AccountLedger, and the auto-capture queue dedups by fingerprint.
void main() {
  late AppDatabase db;
  late DriftAccountRepository accounts;
  late DriftPostingRepository postings;
  late DriftPendingCaptureRepository captures;
  const ledger = AccountLedger();
  const vault = 'v1';
  Decimal d(String s) => Decimal.parse(s);

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    accounts = DriftAccountRepository(db.accountDao);
    postings = DriftPostingRepository(db.postingDao);
    captures = DriftPendingCaptureRepository(db.pendingCaptureDao);
  });

  tearDown(() => db.close());

  test('accounts + postings round-trip and reproduce net worth', () async {
    await accounts.save(Account(id: 'cash', vaultId: vault, name: 'Cash', type: AccountType.asset, subtype: 'cash'));
    await accounts.save(Account(id: 'groceries', vaultId: vault, name: 'Groceries', type: AccountType.expense, subtype: 'expense'));
    await accounts.save(Account(id: 'salary', vaultId: vault, name: 'Income', type: AccountType.income, subtype: 'income'));

    // Expense ₹100 from cash + income ₹500 to cash, as balanced postings.
    await postings.replaceForEntry('e1', ledger.postingsForEntry(
      entryId: 'e1', vaultId: vault, amount: d('100'),
      type: TxnType.expense, moneyAccountId: 'cash', categoryAccountId: 'groceries',
    ));
    await postings.replaceForEntry('e2', ledger.postingsForEntry(
      entryId: 'e2', vaultId: vault, amount: d('500'),
      type: TxnType.income, moneyAccountId: 'cash', categoryAccountId: 'salary',
    ));

    final acctList = await accounts.getAll(vault);
    final postList = await postings.getAll(vault);

    expect(postList.length, 4);
    expect(ledger.allEntriesBalanced(postList), isTrue);
    // Net worth = cash balance (-100 + 500) = 400, matching income − expense.
    expect(ledger.netWorthFromAccounts(acctList, postList), d('400'));
  });

  test('replaceForEntry swaps an entry\'s postings atomically', () async {
    await accounts.save(Account(id: 'cash', vaultId: vault, name: 'Cash', type: AccountType.asset, subtype: 'cash'));
    await accounts.save(Account(id: 'groceries', vaultId: vault, name: 'Groceries', type: AccountType.expense, subtype: 'expense'));
    await postings.replaceForEntry('e1', [
      Posting(id: 'e1:dr', vaultId: vault, entryId: 'e1', accountId: 'groceries', amount: d('100')),
      Posting(id: 'e1:cr', vaultId: vault, entryId: 'e1', accountId: 'cash', amount: d('-100')),
    ]);
    // Re-derive at a new amount; old postings must be gone.
    await postings.replaceForEntry('e1', [
      Posting(id: 'e1:dr', vaultId: vault, entryId: 'e1', accountId: 'groceries', amount: d('250')),
      Posting(id: 'e1:cr', vaultId: vault, entryId: 'e1', accountId: 'cash', amount: d('-250')),
    ]);
    final forE1 = await postings.forEntry('e1');
    expect(forE1.length, 2);
    expect(ledger.isBalanced(forE1), isTrue);
    expect(forE1.firstWhere((p) => p.accountId == 'groceries').amount, d('250'));
  });

  test('pending-capture queue dedups by fingerprint', () async {
    final cap = PendingCapture(
      id: 'c1', vaultId: vault, amount: d('450'), type: TxnType.expense,
      merchant: 'bigbasket', occurredAt: DateTime(2026, 6, 10),
      source: CaptureSource.sms, fingerprint: '2026-06-10|450|bigbasket',
      capturedAt: DateTime(2026, 6, 10, 9),
    );
    await captures.save(cap);
    expect(await captures.exists(vault, '2026-06-10|450|bigbasket'), isTrue);
    expect(await captures.exists(vault, 'nope'), isFalse);
    await captures.delete('c1');
    expect(await captures.exists(vault, '2026-06-10|450|bigbasket'), isFalse);
  });
}
