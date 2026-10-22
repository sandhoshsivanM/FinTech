import 'package:decimal/decimal.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:khazana_domain/entities/account.dart';
import 'package:khazana_domain/entities/liability.dart';
import 'package:khazana_domain/entities/transaction.dart';
import 'package:khazana_domain/services/budget_calculator.dart';
import 'package:khazana_domain/services/daily_flow.dart';
import '../accounts/providers/account_providers.dart';
import '../budget/providers/budget_providers.dart';
import '../liabilities/providers/liability_providers.dart';
import '../transactions/providers/transaction_providers.dart';

/// What a wallet card shows. [balance] is as a person would say it: what is in
/// a bank or cash account, or what is owed on a card.
class WalletCardData {
  const WalletCardData({
    required this.id,
    required this.name,
    required this.kind,
    required this.balance,
  });

  final String id;
  final String name;
  final WalletKind kind;
  final Decimal balance;

  bool get owed => kind == WalletKind.creditCard;
}

enum WalletKind { bank, cash, creditCard }

/// The home screen's card deck: live bank and cash accounts, then credit cards.
///
/// Cards come from the `liabilities` table, not from accounts — the chart of
/// accounts has no card rows (see the accounts screen). Null while either
/// stream is still loading, so the deck does not flash empty.
final walletCardsProvider = Provider<List<WalletCardData>?>((ref) {
  final accounts = ref.watch(accountListProvider).valueOrNull;
  final postings = ref.watch(postingListProvider).valueOrNull;
  final liabilities = ref.watch(liabilityListProvider).valueOrNull ?? const [];
  if (accounts == null || postings == null) return null;

  final balances = ref
      .watch(accountLedgerProvider)
      .accountBalances(accounts, postings);
  final money =
      [
          for (final a in accounts)
            if (!a.archived && (a.subtype == 'bank' || a.subtype == 'cash'))
              WalletCardData(
                id: a.id,
                name: a.name,
                kind: a.subtype == 'bank' ? WalletKind.bank : WalletKind.cash,
                // Asset accounts are debit-normal, so the ledger figure is already
                // the amount held.
                balance: a.type == AccountType.liability
                    ? -(balances[a.id] ?? Decimal.zero)
                    : balances[a.id] ?? Decimal.zero,
              ),
        ]
        // Fullest first, so the deck never leads with an empty wallet.
        ..sort((a, b) => b.balance.compareTo(a.balance));

  return [
    ...money,
    for (final l in liabilities)
      if (l.kind == LiabilityKind.creditCard)
        WalletCardData(
          id: l.id,
          name: l.name,
          kind: WalletKind.creditCard,
          balance: l.principal,
        ),
  ];
});

/// Everything spendable: the sum of live bank and cash balances. Null while
/// loading.
final liquidBalanceProvider = Provider<Decimal?>((ref) {
  final cards = ref.watch(walletCardsProvider);
  if (cards == null) return null;
  return cards
      .where((c) => !c.owed)
      .fold<Decimal>(Decimal.zero, (s, c) => s + c.balance);
});

/// This month's budgets in one figure, plus the ones closest to their limit.
class BudgetSummary {
  const BudgetSummary({
    required this.spent,
    required this.limit,
    required this.closest,
  });

  final Decimal spent;
  final Decimal limit;
  final List<BudgetProgress> closest;

  /// Share of the month's total budget used, uncapped (can exceed 1).
  double get used =>
      limit == Decimal.zero ? 0 : spent.toDouble() / limit.toDouble();
}

/// Null when there are no budgets — the card then offers to create one.
final budgetSummaryProvider = Provider<BudgetSummary?>((ref) {
  final progress = ref.watch(budgetProgressProvider);
  if (progress.isEmpty) return null;
  var spent = Decimal.zero;
  var limit = Decimal.zero;
  for (final p in progress) {
    spent += p.spent;
    limit += p.budget.amountLimit;
  }
  double ratio(BudgetProgress p) => p.budget.amountLimit == Decimal.zero
      ? 0
      : p.spent.toDouble() / p.budget.amountLimit.toDouble();
  // Ranked by closeness to the limit, not by size: a small budget at 98%
  // needs attention more than a large one at 20%.
  final closest = [...progress]..sort((a, b) => ratio(b).compareTo(ratio(a)));
  return BudgetSummary(
    spent: spent,
    limit: limit,
    closest: closest.take(3).toList(),
  );
});

/// Money in and out for each of the last fourteen days, today last: this
/// week, and last week to compare it against.
final fortnightFlowProvider = Provider<List<DayFlow>>((ref) {
  final state = ref.watch(transactionListProvider);
  final txns = state is TransactionData ? state.transactions : const <Txn>[];
  return dailyFlow(txns, DateTime.now(), days: 14);
});

/// The last seven days, today last.
final weekFlowProvider = Provider<List<DayFlow>>(
  (ref) => ref.watch(fortnightFlowProvider).sublist(7),
);
