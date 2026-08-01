import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/branding.dart';
import '../core/di/providers.dart';
import '../core/router/app_router.dart';
import '../core/theme/app_tokens.dart';

/// A navigable destination in the desktop sidebar.
typedef _Dest = ({String route, IconData icon, String label});

/// A titled group of destinations.
typedef _Section = ({String title, List<_Dest> items});

/// Desktop navigation: a persistent sidebar, not a phone's bottom bar.
///
/// The mobile shell exposes five bottom-nav tabs, which leaves eight
/// substantial modules (budget, liabilities, insurance, safety net, goals,
/// recurring, search, reports) reachable only via a dashboard chip or a link
/// from their owning tab — effectively invisible on a large screen. A desktop
/// window has room to show everything at once, so it does, grouped rather than
/// as one flat list.
///
/// Every screen in the app appears here. That is not an aspiration: it is
/// asserted by `test/widget/desktop_shell_test.dart`, which walks [Routes] and
/// fails if a route has no sidebar entry. Adding a screen without adding it here
/// breaks the build.
const _sections = <_Section>[
  (
    title: 'Overview',
    items: [
      (route: Routes.dashboard, icon: Icons.dashboard_outlined, label: 'Dashboard'),
      (route: Routes.score, icon: Icons.speed_outlined, label: 'Score'),
      (route: Routes.reports, icon: Icons.bar_chart_outlined, label: 'Reports'),
      (route: Routes.safetyNet, icon: Icons.health_and_safety_outlined, label: 'Safety Net'),
    ],
  ),
  (
    title: 'Money',
    items: [
      (route: Routes.transactions, icon: Icons.receipt_long_outlined, label: 'Cash Flow'),
      (route: Routes.calendar, icon: Icons.calendar_month_outlined, label: 'Calendar'),
      (route: Routes.budget, icon: Icons.pie_chart_outline, label: 'Budget'),
      (route: Routes.recurring, icon: Icons.repeat, label: 'Recurring'),
      (route: Routes.search, icon: Icons.search, label: 'Search'),
    ],
  ),
  (
    title: 'Wealth',
    items: [
      (route: Routes.investments, icon: Icons.trending_up_outlined, label: 'Investments'),
      (route: Routes.investmentsBreakdown, icon: Icons.donut_small_outlined, label: 'Breakdown'),
      (route: Routes.liabilities, icon: Icons.credit_card_outlined, label: 'Liabilities'),
      (route: Routes.insurance, icon: Icons.umbrella_outlined, label: 'Insurance'),
      (route: Routes.goals, icon: Icons.flag_outlined, label: 'Goals'),
    ],
  ),
  (
    title: 'Data',
    items: [
      (route: Routes.captureInbox, icon: Icons.inbox_outlined, label: 'Capture Inbox'),
      (route: Routes.bankImport, icon: Icons.upload_file_outlined, label: 'Import'),
      (route: Routes.settings, icon: Icons.settings_outlined, label: 'Settings'),
    ],
  ),
];

/// Every route the sidebar links to, in display order.
///
/// Exposed so `test/widget/navigation_test.dart` can assert that no screen is
/// missing from it. Reading `_sections` from a test would mean making the whole
/// private structure public; this is the one fact the test needs.
List<String> get desktopSidebarRoutes =>
    [for (final s in _sections) ...s.items.map((d) => d.route)];

class DesktopShell extends ConsumerWidget {
  const DesktopShell({required this.child, super.key});

  final Widget child;

  /// Longest-prefix match, so a child route such as
  /// `/app/investments/add-lot` keeps "Investments" highlighted rather than
  /// falling back to the first item.
  static String? _activeRoute(String location) {
    String? best;
    for (final section in _sections) {
      for (final d in section.items) {
        if (location == d.route || location.startsWith('${d.route}/')) {
          if (best == null || d.route.length > best.length) best = d.route;
        }
      }
    }
    // `location.startsWith(route)` would make /app/investments match
    // /app/investments-breakdown; the explicit '/' guard above avoids that.
    return best;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).matchedLocation;
    final active = _activeRoute(location);

    return Scaffold(
      body: Row(
        children: [
          _Sidebar(active: active),
          const VerticalDivider(width: 1, thickness: 1),
          // No width cap here: a desktop window should use its width. The
          // mobile shell keeps its 640px cap.
          Expanded(child: child),
        ],
      ),
    );
  }
}

class _Sidebar extends ConsumerWidget {
  const _Sidebar({required this.active});

  final String? active;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;

    return SizedBox(
      width: 248,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _BrandHeader(),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
              children: [
                for (final section in _sections) ...[
                  Padding(
                    padding: const EdgeInsets.only(
                      left: AppSpacing.md,
                      right: AppSpacing.md,
                      top: AppSpacing.md,
                      bottom: AppSpacing.xs,
                    ),
                    child: Text(
                      section.title.toUpperCase(),
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                            letterSpacing: 1.1,
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                  ),
                  for (final d in section.items)
                    _NavItem(dest: d, selected: d.route == active),
                ],
              ],
            ),
          ),
          const Divider(height: 1),
          _LockButton(),
        ],
      ),
    );
  }
}

class _BrandHeader extends StatelessWidget {
  const _BrandHeader();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.md, AppSpacing.lg, AppSpacing.md, AppSpacing.sm),
      child: Row(
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: AppColors.accentGradient),
              borderRadius: BorderRadius.circular(9),
            ),
            child: const Icon(Icons.shield_rounded,
                color: Colors.white, size: 17),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  kAppName,
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
                Text(
                  kAppTagline,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({required this.dest, required this.selected});

  final _Dest dest;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm, vertical: 1),
      child: Material(
        color: selected
            ? AppColors.accent.withValues(alpha: 0.13)
            : Colors.transparent,
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: () => context.go(dest.route),
          child: Padding(
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm, vertical: 9),
            child: Row(
              children: [
                Icon(
                  dest.icon,
                  size: 18,
                  color: selected ? AppColors.accent : scheme.onSurfaceVariant,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    dest.label,
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight:
                          selected ? FontWeight.w700 : FontWeight.w500,
                      color: selected ? AppColors.accent : scheme.onSurface,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LockButton extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () =>
                  ref.read(vaultUnlockProvider.notifier).lock(),
              icon: const Icon(Icons.lock_outline, size: 16),
              label: const Text('Lock vault'),
            ),
          ),
        ],
      ),
    );
  }
}
