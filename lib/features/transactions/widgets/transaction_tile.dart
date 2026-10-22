import 'package:flutter/semantics.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/semantic_colors.dart';
import '../../../core/utils/money_format.dart';
import 'package:khazana_domain/entities/category.dart';
import 'package:khazana_domain/entities/transaction.dart';
import '../../home/widgets/category_tint.dart';
import '../screens/transactions_screen.dart';

/// A single ledger row: a 40px category avatar, the merchant over its category
/// and date, and a signed amount. Delete is a swipe (with a confirm), not an
/// always-visible icon. The sign is conveyed by text, never colour alone.
class TransactionTile extends StatelessWidget {
  const TransactionTile({
    required this.txn,
    required this.category,
    this.onDelete,
    super.key,
  });

  final Txn txn;
  final Category? category;
  final VoidCallback? onDelete;

  Future<bool> _confirm(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete transaction?'),
        content: const Text('This removes it from your ledger.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    return ok ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final income = txn.type == TxnType.income;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final color = income
        ? (dark ? context.colors.income : const Color(0xFF0BA722))
        : context.colors.expense;
    final scheme = Theme.of(context).colorScheme;
    final words = Money.toWords(txn.amount);
    final label =
        '${income ? 'Income' : 'Expense'}, $words, ${categoryName(category)}, '
        '${formatTxnDate(txn.date)}';

    final row = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
      child: Row(
        children: [
          CategoryAvatar(codepoint: category?.iconCodepoint, size: 40),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  txn.merchant?.isNotEmpty == true
                      ? txn.merchant!
                      : categoryName(category),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  [categoryName(category), formatTxnDate(txn.date)].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    color: scheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          ExcludeSemantics(
            child: Text(
              '${income ? '+' : '−'}${Money.format(txn.amount)}',
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w600,
                fontSize: 14.5,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ],
      ),
    );

    return Semantics(
      label: label,
      button: false,
      customSemanticsActions: {
        if (onDelete != null)
          const CustomSemanticsAction(label: 'Delete transaction'): () async {
            if (await _confirm(context)) onDelete!();
          },
      },
      child: onDelete == null
          ? row
          : Dismissible(
              key: ValueKey('txn-${txn.id}'),
              direction: DismissDirection.endToStart,
              confirmDismiss: (_) => _confirm(context),
              onDismissed: (_) => onDelete!(),
              background: Container(
                alignment: Alignment.centerRight,
                padding: const EdgeInsets.only(right: 24),
                color: context.colors.expense.withValues(alpha: 0.14),
                child: Icon(
                  Icons.delete_outline,
                  color: context.colors.expense,
                ),
              ),
              child: row,
            ),
    );
  }
}
