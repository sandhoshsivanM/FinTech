import 'package:flutter/material.dart';

import '../../../core/constants/category_icons.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/category.dart';
import '../../../domain/entities/transaction.dart';
import '../screens/transactions_screen.dart';

/// A single transaction row. Accessible: amount is read as words and the
/// income/expense sign is conveyed by text + icon, never color alone (§10A).
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

  @override
  Widget build(BuildContext context) {
    final income = txn.type == TxnType.income;
    final color = income ? AppColors.income : AppColors.expense;
    final words = Money.toWords(txn.amount);
    final label =
        '${income ? 'Income' : 'Expense'}, $words, ${categoryName(category)}, '
        '${formatTxnDate(txn.date)}';

    return Semantics(
      label: label,
      button: false,
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.15),
          child: Icon(
            categoryIcon(category?.iconCodepoint),
            color: color,
          ),
        ),
        title: Text(txn.merchant?.isNotEmpty == true
            ? txn.merchant!
            : categoryName(category)),
        subtitle: Text(
          [categoryName(category), formatTxnDate(txn.date)].join(' · '),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            ExcludeSemantics(
              child: Row(
                children: [
                  Icon(income ? Icons.arrow_downward : Icons.arrow_upward,
                      size: 16, color: color),
                  const SizedBox(width: 2),
                  Text(
                    Money.formatSigned(txn.amount, isIncome: income),
                    style: TextStyle(color: color, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
            if (onDelete != null)
              IconButton(
                icon: const Icon(Icons.delete_outline),
                tooltip: 'Delete transaction',
                onPressed: onDelete,
              ),
          ],
        ),
      ),
    );
  }
}
