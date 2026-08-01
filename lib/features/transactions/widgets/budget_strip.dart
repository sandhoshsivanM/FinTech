import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/services/budget_calculator.dart';
import '../../../presentation/glass_card.dart';
import '../../budget/providers/budget_providers.dart';
import '../providers/category_providers.dart';

/// Whether the strip is expanded. Session-only: a collapsed strip is a
/// glance-avoidance choice for right now, not a setting worth persisting.
final budgetStripExpandedProvider = StateProvider<bool>((ref) => true);

/// The three budgets closest to their limit, above the transaction list.
///
/// This is how Budget stays reachable from the tab bar. It also puts the
/// consequence next to the action: the moment you are about to log a spend is
/// the moment "Food is at 92%" is worth knowing, which is not true on a
/// separate screen you have to remember to visit.
///
/// Renders nothing at all when no budgets exist — an empty strip would be a
/// permanent blank band above the list for every user who has not set one.
class BudgetStrip extends ConsumerWidget {
  const BudgetStrip({super.key});

  static const _maxShown = 3;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final progress = ref.watch(budgetProgressProvider);
    if (progress.isEmpty) return const SizedBox.shrink();

    final categories = ref.watch(categoryListProvider).valueOrNull ?? const [];
    final byId = {for (final c in categories) c.id: c.name};
    final expanded = ref.watch(budgetStripExpandedProvider);

    // Ranked by how close each is to its limit, not by size — a ₹500 budget at
    // 98% needs attention more than a ₹50,000 one at 20%.
    final ranked = [...progress]
      ..sort((a, b) => _ratio(b).compareTo(_ratio(a)));
    final shown = ranked.take(_maxShown).toList();
    final overCount = ranked.where((p) => p.status == BudgetStatus.over).length;

    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;

    return GlassCard(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md, vertical: AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(AppRadii.button),
            onTap: () => ref
                .read(budgetStripExpandedProvider.notifier)
                .update((v) => !v),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Icon(Icons.pie_chart_outline,
                      size: 16, color: scheme.onSurfaceVariant),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      overCount > 0
                          ? '$overCount budget${overCount == 1 ? '' : 's'} over limit'
                          : 'Budgets this month',
                      style: text.labelLarge?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: overCount > 0 ? AppColors.budgetOver : null,
                      ),
                    ),
                  ),
                  Icon(
                    expanded ? Icons.expand_less : Icons.expand_more,
                    size: 18,
                    color: scheme.onSurfaceVariant,
                  ),
                ],
              ),
            ),
          ),
          if (expanded) ...[
            const SizedBox(height: AppSpacing.xs),
            for (final p in shown) ...[
              _BudgetRow(
                label: byId[p.budget.categoryId] ?? 'Uncategorized',
                progress: p,
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
            InkWell(
              borderRadius: BorderRadius.circular(AppRadii.button),
              onTap: () => context.go(Routes.budget),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    Text(
                      ranked.length > _maxShown
                          ? 'All ${ranked.length} budgets'
                          : 'Manage budgets',
                      style: text.labelMedium
                          ?.copyWith(color: AppColors.accent),
                    ),
                    const Icon(Icons.chevron_right_rounded,
                        size: 16, color: AppColors.accent),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// Uncapped spend ratio. [BudgetProgress.fraction] is clamped to 1 for the
  /// progress bar, so ranking by it would tie every overspent budget together.
  static double _ratio(BudgetProgress p) {
    final limit = p.budget.amountLimit.toDouble();
    return limit <= 0 ? 0 : p.spent.toDouble() / limit;
  }
}

class _BudgetRow extends StatelessWidget {
  const _BudgetRow({required this.label, required this.progress});

  final String label;
  final BudgetProgress progress;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final color = switch (progress.status) {
      BudgetStatus.over => AppColors.budgetOver,
      BudgetStatus.warning => AppColors.budgetWarn,
      BudgetStatus.ok => AppColors.budgetOk,
    };
    final over = progress.status == BudgetStatus.over;

    return Semantics(
      label: '$label, ${Money.toWords(progress.spent)} of '
          '${Money.toWords(progress.budget.amountLimit)} spent',
      child: ExcludeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(label, style: text.labelMedium)),
                Text(
                  '${Money.format(progress.spent)} / '
                  '${Money.format(progress.budget.amountLimit)}',
                  style: text.labelSmall?.copyWith(
                    color: over ? color : scheme.onSurfaceVariant,
                    fontWeight: over ? FontWeight.w700 : null,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            ClipRRect(
              borderRadius: BorderRadius.circular(AppRadii.pill),
              child: LinearProgressIndicator(
                value: progress.fraction,
                minHeight: 5,
                valueColor: AlwaysStoppedAnimation(color),
                backgroundColor: scheme.onSurfaceVariant.withValues(alpha: 0.15),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
