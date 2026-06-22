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

    return Card(
      color: AppColors.accent.withValues(alpha: 0.08),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.waving_hand, color: AppColors.accent),
                const SizedBox(width: AppSpacing.sm),
                Text('Welcome to Fintech OS',
                    style: Theme.of(context).textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            for (final t in _tips)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    Icon(t.$1, size: 16),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(child: Text(t.$2)),
                  ],
                ),
              ),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () =>
                    ref.read(onboardingActionsProvider).markSeen(),
                child: const Text('Got it'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
