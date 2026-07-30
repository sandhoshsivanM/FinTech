import 'package:flutter/foundation.dart' show defaultTargetPlatform, TargetPlatform, kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/di/providers.dart';
import '../core/router/app_router.dart';
import '../features/capture/providers/capture_providers.dart';
import 'desktop_shell.dart';

/// Intent for the "new transaction" keyboard shortcut (PRD Phase 4, Web).
class _NewTransactionIntent extends Intent {
  const _NewTransactionIntent();
}

/// Intent for the "lock vault" keyboard shortcut.
class _LockIntent extends Intent {
  const _LockIntent();
}

/// True on the desktop platforms, where the app should present a desktop layout
/// rather than a phone layout stretched into a window.
///
/// Deliberately keyed on the PLATFORM, not on window width: a narrow window on a
/// Mac is still a Mac app and should keep its sidebar, and a wide Android tablet
/// still wants touch-sized targets. Web is excluded because it is served to
/// phones as often as to desktops, so it keeps the width-driven mobile shell.
bool get isDesktopPlatform =>
    !kIsWeb &&
    (defaultTargetPlatform == TargetPlatform.macOS ||
        defaultTargetPlatform == TargetPlatform.windows ||
        defaultTargetPlatform == TargetPlatform.linux);

/// Authenticated shell. Desktop gets a persistent sidebar ([DesktopShell]);
/// phones get bottom navigation. Re-locks the vault when backgrounded.
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
    // Start the on-device SMS / notification capture stream while unlocked
    // (Android only; a no-op elsewhere).
    ref.watch(captureListenerProvider);
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
    if (isDesktopPlatform) {
      return DesktopShell(child: widget.child);
    }
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
