import '../../../core/help/info_hint.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/utils/money_format.dart';
import '../home_palette.dart';
import '../../reports/providers/dashboard_providers.dart';
import '../../transactions/providers/category_providers.dart';
import '../home_providers.dart';
import 'category_tint.dart';
import 'depth.dart';
import 'entrance.dart';

/// This month's budgets at a glance: one ring for the total, then the three
/// categories closest to their limit.
class BudgetRingCard extends ConsumerWidget {
  const BudgetRingCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(budgetSummaryProvider);
    final ghost = ref.watch(ghostModeProvider);
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final colors = context.colors;

    if (summary == null) {
      return HomeGroup(
        child: InkWell(
          onTap: () => context.go(Routes.budget),
          child: Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: colors.accent.withValues(alpha: 0.12),
                child: Icon(Icons.savings_outlined, color: colors.accent),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Set a monthly budget',
                      style: text.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      'See how much is left at a glance.',
                      style: text.bodySmall?.copyWith(color: muted),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    final pct = summary.used * 100;
    final p = HomePalette.of(context);
    // Blue while fine; amber and pink only when it means something.
    final tone = Hue.forPercent;
    final cats = {
      for (final c in ref.watch(categoryListProvider).valueOrNull ?? const [])
        c.id: c,
    };
    String mask(String s) => ghost ? '••••' : s;

    return HomeGroup(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: InfoHint.titled(
                  Text(
                    'Budget this month',
                    style: text.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  'dashboard.budgetThisMonth',
                ),
              ),
              TextButton(
                onPressed: () => context.go(Routes.budget),
                child: const Text('Details'),
              ),
            ],
          ),
          Row(
            children: [
              Flexible(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    mask(Money.format(summary.spent)),
                    style: const TextStyle(
                      fontSize: 34,
                      fontWeight: FontWeight.w300,
                      letterSpacing: -0.6,
                      height: 1,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                decoration: BoxDecoration(
                  color: p.group,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: p.line),
                ),
                child: CountUp(
                  value: pct,
                  format: (n) => '${n.round()}% used',
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: tone(pct).deep,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'of ${mask(Money.format(summary.limit))} budgeted',
            style: text.bodySmall?.copyWith(color: muted),
          ),
          const SizedBox(height: 14),
          Column(
            children: [
              for (var i = 0; i < summary.closest.length; i++)
                Entrance(
                  order: i + 1,
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: _BudgetLine(
                      name:
                          cats[summary.closest[i].budget.categoryId]?.name ??
                          'Uncategorized',
                      codepoint: cats[summary.closest[i].budget.categoryId]
                          ?.iconCodepoint,
                      spent: mask(Money.format(summary.closest[i].spent)),
                      limit: mask(
                        Money.format(summary.closest[i].budget.amountLimit),
                      ),
                      fraction: summary.closest[i].fraction,
                      hue: tone(
                        summary.closest[i].isOverspent
                            ? 101
                            : summary.closest[i].fraction * 100,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _BudgetLine extends StatelessWidget {
  const _BudgetLine({
    required this.name,
    required this.codepoint,
    required this.spent,
    required this.limit,
    required this.fraction,
    required this.hue,
  });

  final String name;
  final int? codepoint;
  final String spent;
  final String limit;
  final double fraction;
  final Hue hue;

  @override
  Widget build(BuildContext context) {
    final p = HomePalette.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    // An inset sub-card per category: raised card, recessed row, gauge.
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: dark ? const Color(0xFF222226) : Colors.white,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CategoryAvatar(codepoint: codepoint, size: 26),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 13, color: p.ink),
                ),
              ),
              Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: spent,
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: p.ink,
                      ),
                    ),
                    TextSpan(
                      text: ' / $limit',
                      style: TextStyle(color: p.muted),
                    ),
                  ],
                ),
                style: const TextStyle(
                  fontSize: 12.5,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Gauge(fraction: fraction, hue: hue),
        ],
      ),
    );
  }
}
