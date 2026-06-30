import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/services/safety_net.dart';
import '../../../presentation/data_gate.dart';
import '../providers/safety_net_providers.dart';

/// Read-only "Safety Net" readiness dashboard — parity with the web app's
/// `/safety-net` page. One score over emergency fund + insurance + safe assets.
class SafetyNetScreen extends StatelessWidget {
  const SafetyNetScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Safety Net')),
      body: const DataGate(child: _Body()),
    );
  }
}

Color _coverColor(double pct) => pct >= 100
    ? AppColors.income
    : pct >= 60
        ? AppColors.budgetWarn
        : AppColors.expense;

class _Body extends ConsumerWidget {
  const _Body();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sn = ref.watch(safetyNetProvider);
    final scoreColor = sn.score >= 70
        ? AppColors.income
        : sn.score >= 40
            ? AppColors.budgetWarn
            : AppColors.expense;

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.md),
      children: [
        // Readiness hero
        Card(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Row(
              children: [
                SizedBox(
                  width: 84,
                  height: 84,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      SizedBox(
                        width: 84,
                        height: 84,
                        child: CircularProgressIndicator(
                          value: sn.score / 100,
                          strokeWidth: 8,
                          backgroundColor: AppColors.darkOnSurfaceMuted
                              .withValues(alpha: 0.18),
                          valueColor: AlwaysStoppedAnimation(scoreColor),
                        ),
                      ),
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('${sn.score}',
                              style: TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w800,
                                  color: scoreColor)),
                          Text(sn.grade,
                              style: Theme.of(context).textTheme.labelSmall),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Safety-net readiness',
                          style: Theme.of(context).textTheme.labelMedium),
                      const SizedBox(height: 4),
                      Text(sn.summary,
                          style: Theme.of(context).textTheme.bodyMedium),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),

        for (final c in sn.components) _ComponentCard(component: c),

        const SizedBox(height: AppSpacing.sm),
        Text(
          'Guideline only, not advice — life ≈ 10× annual income; health ≥ ₹5L. '
          'Annual premiums: ${Money.format(sn.premium)}.',
          style: Theme.of(context)
              .textTheme
              .labelSmall
              ?.copyWith(color: AppColors.darkOnSurfaceMuted),
        ),
      ],
    );
  }
}

class _ComponentCard extends StatelessWidget {
  const _ComponentCard({required this.component});
  final SafetyComponent component;

  @override
  Widget build(BuildContext context) {
    final pct = component.coveredPct;
    final color = _coverColor(pct);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(component.label,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
                Text('${pct.clamp(0, 999).round()}%',
                    style: TextStyle(fontWeight: FontWeight.w700, color: color)),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: (pct / 100).clamp(0.0, 1.0),
                minHeight: 7,
                backgroundColor:
                    AppColors.darkOnSurfaceMuted.withValues(alpha: 0.18),
                valueColor: AlwaysStoppedAnimation(color),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              '${Money.format(component.current)} of '
              '${Money.format(component.recommended)} recommended'
              '${component.gap > Decimal.zero ? ' · ${Money.format(component.gap)} short' : ' · covered'}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 2),
            Text(component.detail,
                style: Theme.of(context)
                    .textTheme
                    .labelSmall
                    ?.copyWith(color: AppColors.darkOnSurfaceMuted)),
          ],
        ),
      ),
    );
  }
}
