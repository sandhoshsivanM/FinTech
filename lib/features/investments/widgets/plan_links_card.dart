import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import 'package:khazana_domain/services/sip_schedule.dart';
import '../../../presentation/glass_card.dart';
import '../providers/sip_providers.dart';

/// The way into Target vs Actual and SIPs from the portfolio screen, each with
/// a one-line summary so the state is visible without opening either.
class PlanLinksCard extends ConsumerWidget {
  const PlanLinksCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final view = ref.watch(allocationViewProvider).valueOrNull;
    final plans = ref.watch(sipPlansProvider).valueOrNull ?? const [];
    final today = ref.watch(sipTodayProvider);

    final String allocationLine;
    if (view == null) {
      allocationLine = 'Compare your mix with your targets';
    } else if (!view.report.hasTargets) {
      allocationLine = 'Set targets to see where new money should go';
    } else {
      final under = view.report.under.length;
      allocationLine = under == 0
          ? 'All categories within 2% of target'
          : '$under categor${under == 1 ? 'y is' : 'ies are'} under target';
    }
    final active = plans.where((p) => p.active).length;
    final sipLine = active == 0
        ? 'Track SIPs and record each one with a tap'
        : '${Money.whole(monthlyTotal(plans, today))} a month · $active active';

    return GlassCard(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Column(
        children: [
          ListTile(
            leading: const Icon(Icons.donut_large_outlined),
            title: const Text('Target vs Actual'),
            subtitle: Text(allocationLine),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go(Routes.investmentsAllocation),
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.event_repeat_outlined),
            title: const Text('SIPs'),
            subtitle: Text(sipLine),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go(Routes.investmentsSips),
          ),
        ],
      ),
    );
  }
}
