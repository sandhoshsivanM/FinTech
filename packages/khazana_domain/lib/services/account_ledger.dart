import 'package:decimal/decimal.dart';

import '../entities/account.dart';
import '../entities/posting.dart';
import '../entities/transaction.dart';

/// Pure-Dart double-entry ledger math (PRD §3 domain/services — no Flutter
/// imports; mirrored in webapp/src/domain/accountLedger.ts for parity).
///
/// Sign convention: postings are *debit-signed* (debit +, credit −) and every
/// entry's postings sum to zero. An account's balance is its debit-signed
/// opening balance plus the sum of its postings. Net worth is the debit-signed
/// balance of asset + liability accounts (liability balances are negative, so
/// they subtract) plus market-priced holdings.
class AccountLedger {
  const AccountLedger();

  /// Derives the balanced two-leg postings for a simple transaction.
  ///
  /// Expense: debit the category's expense account, credit the money account
  /// (cash/bank/credit) it was paid from. Income: debit the money account,
  /// credit the income account. The two postings always sum to zero.
  List<Posting> postingsForEntry({
    required String entryId,
    required String vaultId,
    required Decimal amount, // positive magnitude
    required TxnType type,
    required String moneyAccountId, // cash / bank / credit-card account
    required String categoryAccountId, // income or expense contra account
  }) {
    final mag = amount.abs();
    final debit = type == TxnType.income ? moneyAccountId : categoryAccountId;
    final credit = type == TxnType.income ? categoryAccountId : moneyAccountId;
    return [
      Posting(
        id: '$entryId:dr',
        vaultId: vaultId,
        entryId: entryId,
        accountId: debit,
        amount: mag,
      ),
      Posting(
        id: '$entryId:cr',
        vaultId: vaultId,
        entryId: entryId,
        accountId: credit,
        amount: -mag,
      ),
    ];
  }

  /// Whether a set of postings (typically one entry's) is balanced.
  bool isBalanced(Iterable<Posting> postings) =>
      postings.fold(Decimal.zero, (s, p) => s + p.amount) == Decimal.zero;

  /// Asserts every entry in [postings] balances to zero. Returns true when the
  /// whole ledger is internally consistent.
  bool allEntriesBalanced(Iterable<Posting> postings) {
    final byEntry = <String, Decimal>{};
    for (final p in postings) {
      byEntry[p.entryId] = (byEntry[p.entryId] ?? Decimal.zero) + p.amount;
    }
    return byEntry.values.every((s) => s == Decimal.zero);
  }

  /// Debit-signed balance per account: opening balance + Σ postings.
  Map<String, Decimal> accountBalances(
    List<Account> accounts,
    List<Posting> postings,
  ) {
    final balances = <String, Decimal>{
      for (final a in accounts) a.id: a.openingDebitSigned,
    };
    for (final p in postings) {
      balances[p.accountId] =
          (balances[p.accountId] ?? Decimal.zero) + p.amount;
    }
    return balances;
  }

  /// Net worth from the chart of accounts alone: Σ debit-signed balance over
  /// asset + liability accounts (liabilities are credit-normal ⇒ negative ⇒
  /// they subtract). Income/expense/equity are nominal and excluded.
  Decimal netWorthFromAccounts(
    List<Account> accounts,
    List<Posting> postings,
  ) {
    final balances = accountBalances(accounts, postings);
    var nw = Decimal.zero;
    for (final a in accounts) {
      if (a.type.isNetWorth) nw += balances[a.id] ?? Decimal.zero;
    }
    return nw;
  }

  /// Full net worth: account-tracked cash/bank/credit/loan/manual assets plus
  /// market-priced securities. Securities are *not* mirrored as asset accounts,
  /// so nothing is double-counted (PRD §16 invariant).
  ///
  /// Takes the portfolio's market value rather than a holdings list: this
  /// service has no business knowing how a position is priced, and callers get
  /// the number from `investmentTotalsProvider`, which is the one place the
  /// portfolio is valued.
  Decimal netWorth(
    List<Account> accounts,
    List<Posting> postings,
    Decimal investmentsValue,
  ) {
    return netWorthFromAccounts(accounts, postings) + investmentsValue;
  }
}
