import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/glass_card.dart';

/// The Score tab: the weekly "why" behind the Dashboard's grade.
///
/// Placeholder. The real screen lands once the four-category health score
/// exists — building it against the current four pillars (savings / buffer /
/// debt / investing) would mean writing the category cards twice.
///
/// It ships as a stub rather than as a missing tab so that the navigation
/// restructure is complete and verifiable on its own: every screen reachable,
/// every tab resolving, before any of them changes what it renders.
class ScoreScreen extends ConsumerWidget {
  const ScoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: const Text('Score'),
      ),
      body: SafeArea(
        child: DataGate(
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.md),
            children: [
              GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Your financial health score',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      'The full breakdown lands here shortly. For now, the score '
                      'and its four categories are on the Dashboard.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Wrap(
                      spacing: AppSpacing.sm,
                      runSpacing: AppSpacing.sm,
                      children: [
                        OutlinedButton.icon(
                          onPressed: () => context.go(Routes.dashboard),
                          icon: const Icon(Icons.dashboard_outlined, size: 18),
                          label: const Text('Dashboard'),
                        ),
                        OutlinedButton.icon(
                          onPressed: () => context.go(Routes.reports),
                          icon: const Icon(Icons.bar_chart_outlined, size: 18),
                          label: const Text('Full reports'),
                        ),
                        OutlinedButton.icon(
                          onPressed: () => context.go(Routes.safetyNet),
                          icon: const Icon(Icons.health_and_safety_outlined,
                              size: 18),
                          label: const Text('Safety Net'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
