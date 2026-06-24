import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/di/providers.dart';
import '../core/router/app_router.dart';

/// Intent for the "new transaction" keyboard shortcut (PRD Phase 4, Web).
class _NewTransactionIntent extends Intent {
  const _NewTransactionIntent();
}

/// Intent for the "lock vault" keyboard shortcut.
class _LockIntent extends Intent {
  const _LockIntent();
}

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
    (Routes.transactions, Icons.receipt_long_outlined, 'Cash Flow'),
    (Routes.investments, Icons.trending_up_outlined, 'Investments'),
    (Routes.reports, Icons.bar_chart_outlined, 'Reports'),
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
    // Keyboard shortcuts (PRD Phase 4): N = new transaction, Cmd/Ctrl+L = lock.
    return Shortcuts(
      shortcuts: <ShortcutActivator, Intent>{
        const SingleActivator(LogicalKeyboardKey.keyN): const _NewTransactionIntent(),
        const SingleActivator(LogicalKeyboardKey.keyL, control: true): const _LockIntent(),
        const SingleActivator(LogicalKeyboardKey.keyL, meta: true): const _LockIntent(),
      },
      child: Actions(
        actions: <Type, Action<Intent>>{
          _NewTransactionIntent: CallbackAction<_NewTransactionIntent>(
            onInvoke: (_) {
              context.go(Routes.addTransaction);
              return null;
            },
          ),
          _LockIntent: CallbackAction<_LockIntent>(
            onInvoke: (_) {
              ref.read(vaultUnlockProvider.notifier).lock();
              return null;
            },
          ),
        },
        child: Focus(
          autofocus: true,
          child: _buildScaffold(context, index),
        ),
      ),
    );
  }

  Widget _buildScaffold(BuildContext context, int index) {
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
