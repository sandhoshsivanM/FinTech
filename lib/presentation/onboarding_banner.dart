import 'package:flutter/material.dart';

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
    // No confirmation here, and only here: this card is shown on a dashboard
    // with nothing on it, so the wipe inside `load()` has nothing to destroy.
    // Settings keeps its dialog, where that is not true.
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
      messenger.showSnackBar(
          const SnackBar(content: Text('Sample data loaded.')));
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

    return Container(
      decoration: BoxDecoration(
        color: context.colors.accent.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: context.colors.accent.withValues(alpha: 0.25)),
      ),
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.md, AppSpacing.md, AppSpacing.sm, AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.waving_hand, color: context.colors.accent, size: 20),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text('Welcome to $kAppName',
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
              padding: const EdgeInsets.only(bottom: AppSpacing.xs),
              child: InkWell(
                onTap: () => context.go(route),
                borderRadius: BorderRadius.circular(AppRadii.card),
                child: Semantics(
                  button: true,
                  label: '$label. $hint',
                  child: ExcludeSemantics(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          vertical: AppSpacing.sm, horizontal: AppSpacing.xs),
                      child: Row(
                        children: [
                          Icon(icon, size: 18, color: context.colors.accent),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(label,
                                    style: const TextStyle(
                                        fontSize: 13.5,
                                        fontWeight: FontWeight.w600)),
                                Text(hint,
                                    style: TextStyle(
                                        fontSize: 12, color: muted)),
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
          const Divider(height: AppSpacing.lg),
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
              OutlinedButton.icon(
                onPressed: () => _loadSample(context, ref),
                icon: const Icon(Icons.auto_awesome, size: 16),
                label: const Text('Sample data'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
