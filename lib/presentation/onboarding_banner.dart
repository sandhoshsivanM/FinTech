import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme/app_tokens.dart';
import '../features/settings/providers/onboarding_providers.dart';

/// First-run welcome card shown once on the dashboard (PRD Phase 4 onboarding).
class OnboardingBanner extends ConsumerWidget {
  const OnboardingBanner({super.key});

  static const _tips = [
    (Icons.lock, 'Everything stays on this device, encrypted.'),
    (Icons.add, 'Tap + on Transactions, or use natural language quick-add.'),
    (Icons.pie_chart_outline, 'Set category budgets and savings goals.'),
    (Icons.account_balance, 'Import broker holdings and bank statements.'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final seen = ref.watch(onboardingSeenProvider).valueOrNull ?? true;
    if (seen) return const SizedBox.shrink();

    return Container(
      decoration: BoxDecoration(
        color: AppColors.accent.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: AppColors.accent.withValues(alpha: 0.25)),
      ),
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.md, AppSpacing.md, AppSpacing.sm, AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.waving_hand,
                  color: AppColors.accent, size: 20),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text('Welcome to Fintech OS',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700)),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.close, size: 18),
                tooltip: 'Dismiss',
                onPressed: () =>
                    ref.read(onboardingActionsProvider).markSeen(),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          for (final t in _tips)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                children: [
                  Icon(t.$1, size: 15, color: AppColors.accent),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                      child: Text(t.$2,
                          style: const TextStyle(fontSize: 13))),
                ],
              ),
            ),
          const SizedBox(height: AppSpacing.xs),
        ],
      ),
    );
  }
}
