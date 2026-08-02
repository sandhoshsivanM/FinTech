import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/account.dart';
import '../../../domain/entities/liability.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/empty_state.dart';
import '../../../presentation/glass_card.dart';
import '../../../presentation/stat_tile.dart';
import '../../liabilities/providers/liability_providers.dart';
import '../providers/account_providers.dart';

/// Where the money actually sits: bank accounts, cash and card/loan balances.
///
/// The chart of accounts, its postings and the balance maths have all shipped
/// since schema v3 — every transaction already writes balanced postings against
/// these accounts. Nothing rendered them. So the app knew your bank balance and
/// had no screen that would say it, and "net worth" arrived as one number with
/// no way to see which account it came from.
class AccountsScreen extends StatelessWidget {
  const AccountsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Accounts')),
      body: const DataGate(child: _Body()),
    );
  }
}

/// Only the account subtypes that hold money.
///
/// Income and expense accounts are deliberately absent too. They are real
/// accounts in the double-entry sense, but their "balance" is a flow total for
/// all time, not something you hold — listing one beside a bank balance would
/// invite adding the two together, which is meaningless.
///
/// Cards and loans are deliberately absent: they are not rows in the chart of
/// accounts at all but live in their own `liabilities` table, with an APR and
/// an EMI that an account row has nowhere to put. Listing `credit_card` and
/// `loan` subtypes here produced two groups that could never populate, which is
/// worse than not showing them — an empty "Credit cards" heading reads as
/// "you have none".
enum _Group {
  bank('Bank', 'bank', Icons.account_balance_outlined),
  cash('Cash & wallets', 'cash', Icons.payments_outlined);

  const _Group(this.label, this.subtype, this.icon);
  final String label;
  final String subtype;
  final IconData icon;
}

class _Body extends ConsumerWidget {
  const _Body();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accounts = ref.watch(accountListProvider).valueOrNull;
    final postings = ref.watch(postingListProvider).valueOrNull;
    final liabilities = ref.watch(liabilityListProvider).valueOrNull ?? const [];

    // Distinguish "still loading" from "nothing here": an empty state shown
    // over a stream that has not emitted yet tells the user they have no
    // accounts when they may have twelve.
    if (accounts == null || postings == null) {
      return const Center(child: CircularProgressIndicator());
    }

    final balances =
        ref.watch(accountLedgerProvider).accountBalances(accounts, postings);

    final live = accounts.where((a) => !a.archived).toList();
    final grouped = <_Group, List<Account>>{};
    for (final g in _Group.values) {
      final inGroup = live.where((a) => a.subtype == g.subtype).toList()
        ..sort((a, b) => a.name.compareTo(b.name));
      if (inGroup.isNotEmpty) grouped[g] = inGroup;
    }

    if (grouped.isEmpty && liabilities.isEmpty) {
      return const EmptyState(
        icon: Icons.account_balance_outlined,
        title: 'No accounts yet',
        message: 'Import a bank statement and Khazana creates the account it '
            'belongs to, then keeps its balance in step with every '
            'transaction you record.',
      );
    }

    var liquid = Decimal.zero;
    for (final entry in grouped.entries) {
      for (final a in entry.value) {
        liquid += _display(a, balances[a.id] ?? Decimal.zero);
      }
    }
    var owed = Decimal.zero;
    for (final l in liabilities) {
      owed += l.principal;
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.md, AppSpacing.sm, AppSpacing.md, AppSpacing.xl),
      children: [
        Row(
          children: [
            Expanded(
              child: StatTile(
                label: 'Cash on hand',
                value: Money.format(liquid),
                icon: Icons.account_balance_wallet_outlined,
                emphasise: true,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: StatTile(
                label: 'Owed on cards & loans',
                value: Money.format(owed),
                icon: Icons.credit_card_outlined,
                valueColor: owed > Decimal.zero ? AppColors.expense : null,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        for (final entry in grouped.entries) ...[
          _GroupCard(
            group: entry.key,
            accounts: entry.value,
            balances: balances,
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
        if (liabilities.isNotEmpty) ...[
          _LiabilityCard(liabilities: liabilities),
          const SizedBox(height: AppSpacing.sm),
        ],
        const SizedBox(height: AppSpacing.xs),
        Text(
          'Balances are derived from the postings behind every transaction, so '
          'they move only when your ledger does. Khazana never connects to a '
          'bank.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }

  /// Balance as a person would say it.
  ///
  /// [AccountLedger.accountBalances] returns debit-signed figures, where a
  /// credit card you owe ₹45,000 on reads −45,000. That sign is correct
  /// bookkeeping and wrong English: nobody says their card balance is minus
  /// forty-five thousand. Liabilities are flipped to the amount owed, and the
  /// label carries the direction instead.
  static Decimal _display(Account a, Decimal debitSigned) =>
      a.type == AccountType.liability ? -debitSigned : debitSigned;
}

class _GroupCard extends StatelessWidget {
  const _GroupCard({
    required this.group,
    required this.accounts,
    required this.balances,
  });

  final _Group group;
  final List<Account> accounts;
  final Map<String, Decimal> balances;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    var total = Decimal.zero;
    for (final a in accounts) {
      total += _Body._display(a, balances[a.id] ?? Decimal.zero);
    }

    return GlassCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(group.icon, size: 18, color: muted),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(group.label,
                    style:
                        text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
              ),
              Text(
                Money.format(total),
                style:
                    text.titleSmall?.copyWith(fontWeight: FontWeight.w800),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          for (final a in accounts)
            _AccountRow(
              account: a,
              balance: _Body._display(a, balances[a.id] ?? Decimal.zero),
              groupTotal: total,
            ),
        ],
      ),
    );
  }
}

class _AccountRow extends StatelessWidget {
  const _AccountRow({
    required this.account,
    required this.balance,
    required this.groupTotal,
  });

  final Account account;
  final Decimal balance;
  final Decimal groupTotal;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    // Share of the group, so a list of balances reads as a distribution rather
    // than as numbers to be compared digit by digit. Guarded: a group summing
    // to zero (or to a net credit) has no meaningful share to draw.
    final share = groupTotal > Decimal.zero && balance > Decimal.zero
        ? (balance / groupTotal).toDouble().clamp(0.0, 1.0)
        : 0.0;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(account.name, style: text.bodyMedium)),
              Text(
                Money.format(balance),
                style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: LinearProgressIndicator(
              value: share,
              minHeight: 3,
              backgroundColor:
                  Theme.of(context).colorScheme.surfaceContainerHighest,
              valueColor: const AlwaysStoppedAnimation(AppColors.accent),
            ),
          ),
          if (account.currency != 'INR')
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(account.currency,
                  style: text.labelSmall?.copyWith(color: muted)),
            ),
        ],
      ),
    );
  }
}

/// What you owe, read from the liabilities table rather than from the chart of
/// accounts, so the figure here and the one on the Liabilities screen cannot
/// drift apart.
class _LiabilityCard extends StatelessWidget {
  const _LiabilityCard({required this.liabilities});

  final List<Liability> liabilities;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    var total = Decimal.zero;
    for (final l in liabilities) {
      total += l.principal;
    }
    final sorted = [...liabilities]
      ..sort((a, b) => b.principal.compareTo(a.principal));

    return GlassCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.credit_card_outlined, size: 18, color: muted),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text('Cards & loans',
                    style:
                        text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
              ),
              Text(
                Money.format(total),
                style: text.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800, color: AppColors.expense),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          for (final l in sorted)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(l.name, style: text.bodyMedium),
                        Text(
                          '${l.kind == LiabilityKind.creditCard ? 'Credit card' : 'Loan'}'
                          ' · ${l.aprPct}% APR',
                          style: text.bodySmall?.copyWith(color: muted),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    Money.format(l.principal),
                    style: text.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: AppColors.expense),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
