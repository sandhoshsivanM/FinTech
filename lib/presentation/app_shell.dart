import 'package:flutter/foundation.dart' show defaultTargetPlatform, TargetPlatform, kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/di/providers.dart';
import '../core/router/app_router.dart';
import '../core/router/nav_sections.dart';
import '../core/security/vault_state.dart';
import '../core/services/notification_sync_service.dart';
import '../features/capture/providers/capture_providers.dart';
import '../core/theme/app_tokens.dart';
import '../core/theme/semantic_colors.dart';
import 'desktop_shell.dart';
import 'section_tabs.dart';

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
  /// The five bottom-nav destinations.
  ///
  /// Labels are kept short on purpose: `NavigationBar` clips rather than wraps,
  /// and at five destinations on a 360dp phone "Transactions" does not fit at
  /// the theme's 11px label size. The screen itself is titled "Transactions";
  /// only the tab is abbreviated.
  /// The bar is driven by [navSections] — four sections plus a centre action.
  /// See `core/router/nav_sections.dart` for why it is four and not five.

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
      // Not forced: with the lock turned off, backgrounding the app must not
      // put a PIN screen in front of someone who asked never to see one.
      //
      // No reconcile here, deliberately. Reading due dates needs the vault key,
      // and this is the moment it is being purged — a reconcile started now
      // would race the lock and lose. The reminders were already written down on
      // unlock (see build), on resume (below), and after every write that
      // changed a date (NotificationReconcileOnWrite), so the OS is holding a
      // current set by the time we get here.
      ref.read(vaultUnlockProvider.notifier).lock();
    }
    if (state == AppLifecycleState.resumed) {
      // Catches a timezone change after travel: reminders are anchored to the
      // wall clock of wherever they were written.
      ref.read(notificationSyncProvider).scheduleReconcile();
    }
  }

  int _currentIndex(BuildContext context) {
    final here = GoRouterState.of(context).matchedLocation;
    // Longest-owning section wins, so a sub-page keeps its section lit.
    var best = -1;
    var bestLen = -1;
    for (var i = 0; i < navSections.length; i++) {
      for (final r in navSections[i].routes) {
        if ((here == r || here.startsWith('$r/')) && r.length > bestLen) {
          best = i;
          bestLen = r.length;
        }
      }
    }
    return best < 0 ? 0 : best;
  }

  @override
  Widget build(BuildContext context) {
    final index = _currentIndex(context);
    // Start the on-device SMS / notification capture stream while unlocked
    // (Android only; a no-op elsewhere).
    ref.watch(captureListenerProvider);
    // Write the coming weeks' reminders down the moment the vault opens.
    //
    // This is the only point at which the app can both read due dates and talk
    // to the OS scheduler, and until it existed the common path produced no
    // reminders at all: install, unlock, add a bill, close — nothing was ever
    // handed to AlarmManager, because the only other trigger is a resume that
    // never happened.
    //
    // On the transition, not on every state change: the vault emits Unlocking
    // and failed-PIN states too, and reconciling on those would rebuild the plan
    // against repositories that cannot be read yet.
    ref.listen(vaultUnlockProvider, (previous, next) {
      if (next is VaultUnlocked && previous is! VaultUnlocked) {
        ref.read(notificationSyncProvider).scheduleReconcile();
      }
    });
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
              // Cmd+L is a deliberate press, so it locks even when the lock is
              // otherwise off.
              ref.read(vaultUnlockProvider.notifier).lock(force: true);
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
    final section = navSections[index];
    return Scaffold(
      // One header for the whole app, owned here rather than repeated in every
      // screen. Screens used to each declare `AppBar(title: Text('Budget'))`,
      // which is why the section strip had nowhere to live: a shell cannot put
      // anything beneath a bar its child owns.
      appBar: AppBar(
        title: Text(section.label),
        actions: const [AvatarMenu(), SizedBox(width: AppSpacing.xs)],
        bottom: section.children.isEmpty
            ? null
            : PreferredSize(
                preferredSize: const Size.fromHeight(46),
                child: Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: SectionTabs(section: section),
                ),
              ),
      ),
      body: widget.child,
      // The one action worth permanent chrome. Docked into the bar's notch so
      // it reads as part of the navigation rather than as something floating
      // over the content.
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.go(Routes.addTransaction),
        tooltip: 'New transaction',
        child: const Icon(Icons.add),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      bottomNavigationBar: _SectionBar(index: index),
    );
  }
}

/// The bottom bar: four sections with a notch in the middle for the primary
/// action.
///
/// A `BottomAppBar` rather than `NavigationBar` because Material's
/// `NavigationBar` distributes its destinations evenly and has no notion of a
/// gap — docking a FAB into it overlaps the middle destination rather than
/// making room for it.
class _SectionBar extends StatelessWidget {
  const _SectionBar({required this.index});

  final int index;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // Two sections, the notch, then two more.
    const leftCount = 2;
    return BottomAppBar(
      height: 64,
      padding: EdgeInsets.zero,
      shape: const CircularNotchedRectangle(),
      notchMargin: 7,
      color: scheme.surface,
      child: Row(
        children: [
          for (var i = 0; i < leftCount; i++)
            Expanded(child: _BarItem(i: i, selected: index == i)),
          // The notch. Sized to the FAB plus its margin so the two halves stay
          // symmetrical regardless of how many sections there are.
          const SizedBox(width: 64),
          for (var i = leftCount; i < navSections.length; i++)
            Expanded(child: _BarItem(i: i, selected: index == i)),
        ],
      ),
    );
  }
}

class _BarItem extends StatelessWidget {
  const _BarItem({required this.i, required this.selected});

  final int i;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final section = navSections[i];
    final scheme = Theme.of(context).colorScheme;
    final color = selected ? context.colors.accent : scheme.onSurfaceVariant;
    return InkWell(
      onTap: () => context.go(section.route),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(selected ? section.activeIcon : section.icon, size: 22, color: color),
          const SizedBox(height: 3),
          Text(
            section.label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

/// Account-level destinations, behind the avatar.
///
/// Settings, Pro, Import and Search are things you do TO the vault rather than
/// screens you read, so they hang off the app bar instead of competing for a
/// slot in the navigation. Keeping them out of the bar is what let the bar
/// shrink to four sections that each mean something.
class AvatarMenu extends StatelessWidget {
  const AvatarMenu({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return PopupMenuButton<String>(
      tooltip: 'Account and tools',
      position: PopupMenuPosition.under,
      onSelected: (route) => context.go(route),
      itemBuilder: (context) => [
        for (final m in avatarMenu)
          PopupMenuItem(
            value: m.route,
            child: Row(
              children: [
                Icon(m.icon, size: 19, color: scheme.onSurfaceVariant),
                const SizedBox(width: AppSpacing.md),
                Text(m.label),
              ],
            ),
          ),
      ],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
        child: CircleAvatar(
          radius: 15,
          backgroundColor: scheme.primaryContainer,
          child: Icon(Icons.person_outline, size: 18, color: context.colors.accent),
        ),
      ),
    );
  }
}
