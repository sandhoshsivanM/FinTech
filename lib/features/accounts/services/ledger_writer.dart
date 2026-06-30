import '../../../domain/entities/account.dart';
import '../../../domain/entities/transaction.dart';
import '../../../domain/repositories/account_repository.dart';
import '../../../domain/repositories/posting_repository.dart';
import '../../../domain/services/account_ledger.dart';

/// Keeps the double-entry ledger in step with the transaction header: on every
/// save it ensures the chart of accounts exists and (re)writes the entry's
/// balanced postings (PRD §16). Deterministic account ids match the v3 Drift
/// migration, so new entries land on the same accounts the migration created.
class LedgerWriter {
  LedgerWriter({
    required IAccountRepository accounts,
    required IPostingRepository postings,
    required String vaultId,
    this.ledger = const AccountLedger(),
  })  : _accounts = accounts,
        _postings = postings,
        _vaultId = vaultId;

  final IAccountRepository _accounts;
  final IPostingRepository _postings;
  final String _vaultId;
  final AccountLedger ledger;

  static String cashId(String v) => 'acct-cash-$v';
  static String incomeId(String v) => 'acct-income-$v';
  static String openingId(String v) => 'acct-opening-$v';
  static String expenseId(String categoryId) => 'acct-exp-$categoryId';

  /// The id of the vault's default cash account.
  String get defaultCashId => cashId(_vaultId);

  /// Derives and persists the two balanced postings for [t], creating any
  /// missing structural / category accounts first.
  Future<void> writeEntry(Txn t, {String? categoryName}) async {
    final cash = cashId(_vaultId);
    final existing = {for (final a in await _accounts.getAll(_vaultId)) a.id};

    Future<void> ensure(Account a) async {
      if (existing.add(a.id)) await _accounts.save(a);
    }

    await ensure(Account(
        id: cash, vaultId: _vaultId, name: 'Cash',
        type: AccountType.asset, subtype: 'cash'));
    await ensure(Account(
        id: incomeId(_vaultId), vaultId: _vaultId, name: 'Income',
        type: AccountType.income, subtype: 'income'));
    await ensure(Account(
        id: openingId(_vaultId), vaultId: _vaultId, name: 'Opening Balances',
        type: AccountType.equity, subtype: 'equity'));
    await ensure(Account(
        id: expenseId(t.categoryId), vaultId: _vaultId,
        name: categoryName ?? 'Expense',
        type: AccountType.expense, subtype: 'expense'));

    final money = t.accountId ?? cash;
    final contra = t.type == TxnType.income
        ? incomeId(_vaultId)
        : expenseId(t.categoryId);
    await _postings.replaceForEntry(
      t.id,
      ledger.postingsForEntry(
        entryId: t.id,
        vaultId: _vaultId,
        amount: t.amount,
        type: t.type,
        moneyAccountId: money,
        categoryAccountId: contra,
      ),
    );
  }

  Future<void> deleteEntry(String entryId) =>
      _postings.deleteForEntry(entryId);
}
