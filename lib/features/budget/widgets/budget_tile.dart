import 'package:flutter/material.dart';

import '../../../core/theme/semantic_colors.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/services/budget_calculator.dart';

/// A budget row with an accessible progress bar (PRD §7A/§7C, §10A).
class BudgetTile extends StatelessWidget {
  const BudgetTile({
    required this.progress,
    required this.categoryName,
    this.onDelete,
    super.key,
  });

  final BudgetProgress progress;
  final String categoryName;
  final VoidCallback? onDelete;

  /// Takes the colours rather than reading a `const`: the budget steps differ
  /// between Vault and Ledger, and a getter has no `BuildContext`.
  Color _colorOf(SemanticColors c) => switch (progress.status) {
        BudgetStatus.ok => c.budgetOk,
        BudgetStatus.warning => c.budgetWarn,
        BudgetStatus.over => c.budgetOver,
      };

  String get _statusWord => switch (progress.status) {
        BudgetStatus.ok => 'on track',
        BudgetStatus.warning => 'approaching limit',
        BudgetStatus.over => 'over budget',
      };

  @override
  Widget build(BuildContext context) {
    final color = _colorOf(context.colors);
    final pct = (progress.fraction * 100).round();
    final label = '$categoryName budget, $_statusWord. '
        'Spent ${Money.toWords(progress.spent)} of '
        '${Money.toWords(progress.budget.amountLimit)}, $pct percent.';

    return Semantics(
      label: label,
      child: ExcludeSemantics(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(categoryName,
                          style: Theme.of(context).textTheme.titleMedium),
                    ),
                    // Status conveyed by icon + text, not color alone (§10A).
                    Icon(
                      progress.isOverspent
                          ? Icons.warning_amber
                          : Icons.check_circle_outline,
                      size: 18,
                      color: color,
                    ),
                    if (onDelete != null)
                      IconButton(
                        icon: const Icon(Icons.delete_outline),
                        tooltip: 'Delete budget',
                        onPressed: onDelete,
                      ),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    value: progress.fraction,
                    minHeight: 10,
                    backgroundColor: color.withValues(alpha: 0.15),
                    valueColor: AlwaysStoppedAnimation(color),
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  '${Money.format(progress.spent)} of '
                  '${Money.format(progress.budget.amountLimit)} · '
                  '${progress.isOverspent ? "over by ${Money.format(-progress.remaining)}" : "${Money.format(progress.remaining)} left"}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
