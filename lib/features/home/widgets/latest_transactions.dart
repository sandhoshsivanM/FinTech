import '../../../core/help/info_hint.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/utils/money_format.dart';
import 'package:khazana_domain/entities/transaction.dart';
import '../home_palette.dart';
import '../../reports/providers/dashboard_providers.dart';
import '../../transactions/providers/category_providers.dart';
import '../../transactions/providers/transaction_providers.dart';
import 'category_tint.dart';
import 'entrance.dart';

/// The five most recent transactions, newest first, each with its category's
/// own colour — so Food reads as Food at a glance, not just as "money out".
class LatestTransactions extends ConsumerWidget {
  const LatestTransactions({super.key});

  static const _shown = 5;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ghost = ref.watch(ghostModeProvider);
    final state = ref.watch(transactionListProvider);
    final txns = state is TransactionData ? state.transactions : const <Txn>[];
    final latest = ([
      ...txns,
    ]..sort((a, b) => b.date.compareTo(a.date))).take(_shown).toList();
    final cats = {
      for (final c in ref.watch(categoryListProvider).valueOrNull ?? const [])
        c.id: c,
    };
    final text = Theme.of(context).textTheme;

    return HomeGroup(
      padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: InfoHint.titled(
                  Text(
                    'Latest transactions',
                    style: text.titleMedium?.copyWith(
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  'dashboard.latestTransactions',
                ),
              ),
              TextButton(
                onPressed: () => context.go(Routes.transactions),
                child: const Text('See all'),
              ),
            ],
          ),
          if (latest.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 20),
              child: Center(
                child: Text(
                  'No transactions yet',
                  style: text.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            )
          else
            for (var i = 0; i < latest.length; i++)
              Entrance(
                order: i,
                child: _Row(
                  txn: latest[i],
                  categoryName: cats[latest[i].categoryId]?.name,
                  codepoint: cats[latest[i].categoryId]?.iconCodepoint,
                  ghost: ghost,
                ),
              ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.txn,
    required this.ghost,
    this.categoryName,
    this.codepoint,
  });

  final Txn txn;
  final String? categoryName;
  final int? codepoint;
  final bool ghost;

  static const _months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  @override
  Widget build(BuildContext context) {
    final income = txn.type == TxnType.income;
    final palette = HomePalette.of(context);
    final color = income ? palette.green : palette.rose;
    final label =
        txn.merchant ?? categoryName ?? (income ? 'Income' : 'Expense');
    final d = txn.date;
    final time = TimeOfDay.fromDateTime(d).format(context);
    final when = '${d.day} ${_months[d.month - 1]}, $time';
    final amount = Money.formatSigned(txn.amount, isIncome: income);
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    return Semantics(
      label:
          '$label, ${categoryName ?? ''}, $when, '
          '${ghost ? 'amount hidden' : amount}',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(0, 8, 8, 8),
        child: Row(
          children: [
            CategoryAvatar(
              codepoint: codepoint,
              fallback: income ? Icons.arrow_downward : Icons.arrow_upward,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: text.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    '${categoryName ?? 'Other'} · $when',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: text.bodySmall?.copyWith(color: muted),
                  ),
                ],
              ),
            ),
            Text(
              ghost ? '••••' : amount,
              style: TextStyle(
                color: ghost ? muted : color,
                fontWeight: FontWeight.w500,
                fontSize: 14,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
