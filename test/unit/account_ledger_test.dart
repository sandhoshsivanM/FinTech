import 'package:decimal/decimal.dart';
import 'package:fintech_os/domain/entities/account.dart';
import 'package:fintech_os/domain/entities/holding.dart';
import 'package:fintech_os/domain/entities/posting.dart';
import 'package:fintech_os/domain/entities/transaction.dart';
import 'package:fintech_os/domain/services/account_ledger.dart';
import 'package:flutter_test/flutter_test.dart';

// Parity fixtures shared with webapp/src/domain/accountLedger.test.ts — same
// inputs, same expected numbers on both engines.
void main() {
  const ledger = AccountLedger();
  Decimal d(String s) => Decimal.parse(s);

  Account acct(String id, AccountType type, {String sub = 'x', String opening = '0'}) =>
      Account(id: id, vaultId: 'v', name: id, type: type, subtype: sub, openingBalance: d(opening));

  List<Posting> entry(String id, String amount, TxnType type, String money, String cat) =>
      ledger.postingsForEntry(
        entryId: id, vaultId: 'v', amount: d(amount), type: type,
        moneyAccountId: money, categoryAccountId: cat,
      );

  final cash = acct('cash', AccountType.asset, sub: 'cash');
  final cc = acct('cc', AccountType.liability, sub: 'credit_card');
  final groceries = acct('groceries', AccountType.expense, sub: 'expense');
  final salary = acct('salary', AccountType.income, sub: 'income');
  final fd = acct('fd', AccountType.asset, sub: 'investment');

  test('a simple entry produces two balanced postings', () {
    final p = entry('e1', '100', TxnType.expense, 'cash', 'groceries');
    expect(p.length, 2);
    expect(ledger.isBalanced(p), isTrue);
  });

  test('expense reduces cash and raises the expense account', () {
    final p = entry('e1', '100', TxnType.expense, 'cash', 'groceries');
    final b = ledger.accountBalances([cash, groceries], p);
    expect(b['cash'], d('-100'));
    expect(b['groceries'], d('100'));
    expect(ledger.netWorthFromAccounts([cash, groceries], p), d('-100'));
  });

  test('income raises cash and credits the income account', () {
    final p = entry('e2', '100', TxnType.income, 'cash', 'salary');
    final b = ledger.accountBalances([cash, salary], p);
    expect(b['cash'], d('100'));
    expect(b['salary'], d('-100'));
    expect(ledger.netWorthFromAccounts([cash, salary], p), d('100'));
  });

  test('credit-card spend raises the liability without touching cash', () {
    final p = entry('e3', '100', TxnType.expense, 'cc', 'groceries');
    final b = ledger.accountBalances([cash, cc, groceries], p);
    expect(b['cash'], d('0'));
    expect(b['cc'], d('-100')); // credit-normal: −100 ⇒ ₹100 owed
    expect(ledger.netWorthFromAccounts([cash, cc, groceries], p), d('-100'));
  });

  test('moving cash into an investment asset leaves net worth unchanged', () {
    final p = entry('e4', '1000', TxnType.expense, 'cash', 'fd');
    final b = ledger.accountBalances([cash, fd], p);
    expect(b['cash'], d('-1000'));
    expect(b['fd'], d('1000'));
    expect(ledger.netWorthFromAccounts([cash, fd], p), d('0'));
  });

  test('opening balances seed net worth (assets up, liabilities down)', () {
    final cashOpen = acct('cash', AccountType.asset, sub: 'cash', opening: '5000');
    final ccOpen = acct('cc', AccountType.liability, sub: 'credit_card', opening: '2000');
    expect(ledger.netWorthFromAccounts([cashOpen, ccOpen], const []), d('3000'));
  });

  test('net worth adds market-priced holdings without double-counting', () {
    final h = Holding(
      id: 'h', vaultId: 'v', symbol: 'X', exchange: 'NSE',
      quantity: d('2'), avgCost: d('100'),
      firstPurchaseDate: DateTime(2020), lastPrice: d('250'),
    );
    final cashOpen = acct('cash', AccountType.asset, sub: 'cash', opening: '1000');
    expect(ledger.netWorth([cashOpen], const [], [h]), d('1500'));
  });

  test('net worth from accounts equals the legacy signed-sum for a cash vault', () {
    final p = [
      ...entry('a', '500', TxnType.income, 'cash', 'salary'),
      ...entry('b', '200', TxnType.expense, 'cash', 'groceries'),
    ];
    expect(ledger.netWorthFromAccounts([cash, salary, groceries], p), d('300'));
  });

  test('allEntriesBalanced flags a tampered ledger', () {
    final good = entry('a', '500', TxnType.income, 'cash', 'salary');
    expect(ledger.allEntriesBalanced(good), isTrue);
    final bad = [
      good[0],
      Posting(id: 'a:cr', vaultId: 'v', entryId: 'a', accountId: 'salary', amount: d('-400')),
    ];
    expect(ledger.allEntriesBalanced(bad), isFalse);
  });
}
