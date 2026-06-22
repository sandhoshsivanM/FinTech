import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/di/providers.dart';
import '../core/router/app_router.dart';

/// Authenticated shell: bottom navigation across the core feature screens.
/// Re-locks the vault when the app is backgrounded (PRD security).
class AppShell extends ConsumerStatefulWidget {
  const AppShell({required this.child, super.key});
  final Widget child;

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell>
    with WidgetsBindingObserver {
  static const _tabs = [
    (Routes.dashboard, Icons.dashboard_outlined, 'Dashboard'),
    (Routes.transactions, Icons.receipt_long_outlined, 'Transactions'),
    (Routes.search, Icons.search, 'Search'),
    (Routes.budget, Icons.pie_chart_outline, 'Budget'),
    (Routes.settings, Icons.settings_outlined, 'Settings'),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) {
      ref.read(vaultUnlockProvider.notifier).lock();
    }
  }

  int _currentIndex(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final idx = _tabs.indexWhere((t) => location.startsWith(t.$1));
    return idx < 0 ? 0 : idx;
  }

  @override
  Widget build(BuildContext context) {
    final index = _currentIndex(context);
    return Scaffold(
      body: widget.child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => context.go(_tabs[i].$1),
        destinations: [
          for (final t in _tabs)
            NavigationDestination(
              icon: Icon(t.$2),
              label: t.$3,
              tooltip: t.$3,
            ),
        ],
      ),
    );
  }
}
