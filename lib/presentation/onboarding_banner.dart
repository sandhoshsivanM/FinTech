import 'package:flutter/material.dart';
import 'glass_card.dart';

import '../core/theme/semantic_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/branding.dart';
import '../core/router/app_router.dart';
import '../core/theme/app_tokens.dart';
import '../features/settings/providers/onboarding_providers.dart';
import '../features/settings/providers/sample_data_provider.dart';

/// First-run card on the dashboard: the three things worth doing first, and a
/// way to see the app with data in it before committing any of your own.
///
/// This used to be four sentences of advice with no buttons on it — one of them
/// read "Tap + on Transactions" while sitting on a screen that could simply
/// have taken you there. Telling someone where a control is, from a card that
/// could be the control, is the shape of a manual rather than an app.
class OnboardingBanner extends ConsumerWidget {
  const OnboardingBanner({super.key});

  /// In the order that makes the rest of the app work: money needs somewhere to
  /// sit before it can move.
  static const _starters = <(IconData, String, String, String)>[
    (
      Icons.account_balance,
      'Add an account',
      'Where your money sits.',
      Routes.accounts,
    ),
    (
      Icons.trending_up,
      'Add a holding',
      'A stock, fund or deposit you own.',
      Routes.investments,
    ),
    (
      Icons.add_circle_outline,
      'Add a transaction',
      'One thing you earned or spent.',
      Routes.addTransaction,
    ),
  ];

  Future<void> _loadSample(BuildContext context, WidgetRef ref) async {
    // No confirmation here: `load()` only adds records, it deletes nothing.
    final messenger = ScaffoldMessenger.of(context);
    final rootNav = Navigator.of(context, rootNavigator: true);
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );
    try {
      await ref.read(sampleDataProvider).load();
      if (rootNav.canPop()) rootNav.pop();
      // Loading the sample IS choosing a starting point, so the welcome card
      // has done its job; left up, it pushed the home screen below the fold.
      await ref.read(onboardingActionsProvider).markSeen();
      messenger.showSnackBar(
        const SnackBar(content: Text('Sample data loaded.')),
      );
    } catch (e) {
      if (rootNav.canPop()) rootNav.pop();
      messenger.showSnackBar(SnackBar(content: Text('Failed: $e')));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final seen = ref.watch(onboardingSeenProvider).valueOrNull ?? true;
    if (seen) return const SizedBox.shrink();

    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    final dark = Theme.of(context).brightness == Brightness.dark;
    return GlassCard(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.lg,
        AppSpacing.sm,
        AppSpacing.lg,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.waving_hand, color: context.colors.gold, size: 20),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  'Welcome to $kAppName',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.close, size: 18),
                tooltip: 'Dismiss',
                onPressed: () => ref.read(onboardingActionsProvider).markSeen(),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(right: AppSpacing.sm),
            child: Text(
              'Everything stays on this device, encrypted. Pick a starting '
              'point — nothing here leaves your phone.',
              style: TextStyle(fontSize: 13, color: muted, height: 1.4),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          for (final (icon, label, hint, route) in _starters)
            Padding(
              padding: const EdgeInsets.only(
                bottom: AppSpacing.sm,
                right: AppSpacing.md,
              ),
              child: InkWell(
                onTap: () => context.go(route),
                borderRadius: BorderRadius.circular(18),
                child: Semantics(
                  button: true,
                  label: '$label. $hint',
                  child: ExcludeSemantics(
                    child: Container(
                      decoration: BoxDecoration(
                        color: dark ? const Color(0xFF222226) : Colors.white,
                        borderRadius: BorderRadius.circular(18),
                      ),
                      padding: const EdgeInsets.symmetric(
                        vertical: AppSpacing.md,
                        horizontal: AppSpacing.md,
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 30,
                            height: 30,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: context.colors.info.withValues(
                                alpha: 0.14,
                              ),
                            ),
                            child: Icon(
                              icon,
                              size: 16,
                              color: context.colors.info,
                            ),
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  label,
                                  style: const TextStyle(
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                Text(
                                  hint,
                                  style: TextStyle(fontSize: 12, color: muted),
                                ),
                              ],
                            ),
                          ),
                          Icon(Icons.chevron_right, size: 18, color: muted),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Or fill the vault with a realistic year to see what the '
                  'app does. Erase it any time from Settings.',
                  style: TextStyle(fontSize: 12, color: muted, height: 1.35),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Padding(
                padding: const EdgeInsets.only(right: AppSpacing.md),
                child: FilledButton.icon(
                  onPressed: () => _loadSample(context, ref),
                  icon: const Icon(Icons.auto_awesome, size: 16),
                  label: const Text('Sample data'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
