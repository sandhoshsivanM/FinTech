import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, TargetPlatform, kIsWeb;
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
import '../features/home/home_palette.dart';
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
    // -1 when no section owns the route (Settings, Search, Import…): those
    // pages used to fall back to Home, so Settings opened under the Home
    // greeting with the Home tab lit.
    return best;
  }

  /// The title for a page outside the four sections.
  static String _titleFor(String here) {
    for (final m in avatarMenu) {
      if (here == m.route || here.startsWith('${m.route}/')) return m.label;
    }
    return 'Khazana';
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
        const SingleActivator(LogicalKeyboardKey.keyN):
            const _NewTransactionIntent(),
        const SingleActivator(LogicalKeyboardKey.keyL, control: true):
            const _LockIntent(),
        const SingleActivator(LogicalKeyboardKey.keyL, meta: true):
            const _LockIntent(),
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
        child: Focus(autofocus: true, child: _buildScaffold(context, index)),
      ),
    );
  }

  Widget _buildScaffold(BuildContext context, int index) {
    if (isDesktopPlatform) {
      return DesktopShell(child: widget.child);
    }
    final section = index >= 0 ? navSections[index] : null;
    final here = GoRouterState.of(context).matchedLocation;
    final ownsAction = routesWithOwnPrimaryAction.contains(here);
    final home = here == Routes.dashboard;
    return Scaffold(
      // One header for the whole app, owned here rather than repeated in every
      // screen. Screens used to each declare `AppBar(title: Text('Budget'))`,
      // which is why the section strip had nowhere to live: a shell cannot put
      // anything beneath a bar its child owns.
      appBar: AppBar(
        // Home greets; every other section is titled by its name.
        // Sections open with a large, light heading on the left, like the
        // reference's "Overview" — not a small bold label in the middle.
        title: home
            ? const _HomeGreeting()
            : Text(
                section?.label ?? _titleFor(here),
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w400,
                  letterSpacing: -0.8,
                ),
              ),
        // The greeting reads left-to-right like a sentence; centred under the
        // notch it looked like a heading with nothing to head.
        centerTitle: false,
        toolbarHeight: home ? null : 64,
        // Home: the bar takes the header's colour so the two read as one
        // surface, and stays flat when the sheet scrolls under it.
        backgroundColor: home ? HomePalette.of(context).header : null,
        scrolledUnderElevation: home ? 0 : null,
        surfaceTintColor: home ? Colors.transparent : null,
        actions: const [
          AvatarMenu(),
          SizedBox(width: AppSpacing.xs),
        ],
        bottom: section == null || section.children.isEmpty
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
      // it reads as part of the navigation rather than as floating over the
      // content — and suppressed where the screen already owns a primary
      // action, so the two do not sit a thumb-width apart offering to add
      // different things.
      floatingActionButton: ownsAction
          ? null
          : Builder(
              builder: (context) {
                final pill = HomePalette.of(context);
                // Raised above the floating bar: a ring in the page colour
                // separates it from the bar, and a soft shadow lifts it.
                return Container(
                  height: 66,
                  width: 66,
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Theme.of(context).scaffoldBackgroundColor,
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x59000000),
                        blurRadius: 20,
                        offset: Offset(0, 8),
                      ),
                    ],
                  ),
                  child: FloatingActionButton(
                    onPressed: () => context.go(Routes.addTransaction),
                    tooltip: 'New transaction',
                    // The same solid pill as the active tab: one control
                    // colour for the whole bar.
                    backgroundColor: pill.pill,
                    foregroundColor: pill.pillInk,
                    // The glow comes from the container above, so the button
                    // itself stays flat.
                    elevation: 0,
                    focusElevation: 0,
                    hoverElevation: 0,
                    highlightElevation: 0,
                    shape: const CircleBorder(),
                    child: const Icon(Icons.add_rounded, size: 28),
                  ),
                );
              },
            ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      bottomNavigationBar: _SectionBar(index: index, notched: !ownsAction),
    );
  }
}

/// The bottom bar: a floating, rounded dock of four sections, with the primary
/// action raised over a gap in the middle.
///
/// Still a `BottomAppBar` (the shell tests look for one, and it brings the
/// safe-area handling), but transparent: the visible bar is the rounded dock
/// inside it, inset from the screen edges. The + is docked to its top edge.
class _SectionBar extends StatelessWidget {
  const _SectionBar({required this.index, required this.notched});

  final int index;

  /// Whether to leave the centre gap. False on screens that own their primary
  /// action — a gap with no button in it is just a hole in the bar.
  final bool notched;

  @override
  Widget build(BuildContext context) {
    // Two sections, the gap, then two more.
    const leftCount = 2;
    return BottomAppBar(
      height: 76,
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
      color: Colors.transparent,
      elevation: 0,
      child: Container(
        decoration: BoxDecoration(
          // The raised surface: white in light, #222226 in dark.
          color: Theme.of(context).brightness == Brightness.dark
              ? const Color(0xFF222226)
              : Colors.white,
          borderRadius: BorderRadius.circular(28),
          boxShadow: const [
            BoxShadow(
              color: Color(0x40111214),
              blurRadius: 30,
              offset: Offset(0, 16),
              spreadRadius: -14,
            ),
          ],
        ),
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Row(
          children: [
            for (var i = 0; i < leftCount; i++)
              Expanded(
                child: _BarItem(i: i, selected: index == i),
              ),
            // The gap under the raised +, kept symmetrical. Collapses when
            // there is no button, so the four sections spread evenly.
            SizedBox(width: notched ? 76 : 0),
            for (var i = leftCount; i < navSections.length; i++)
              Expanded(
                child: _BarItem(i: i, selected: index == i),
              ),
          ],
        ),
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
    final pill = HomePalette.of(context);
    final color = selected ? pill.ink : scheme.onSurfaceVariant;
    return InkWell(
      borderRadius: BorderRadius.circular(22),
      onTap: () => context.go(section.route),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // The selected pill grows in behind the icon.
          AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            width: selected ? 50 : 32,
            height: 30,
            decoration: BoxDecoration(
              color: selected ? pill.pill : Colors.transparent,
              borderRadius: BorderRadius.circular(15),
              boxShadow: selected
                  ? const [
                      BoxShadow(
                        color: Color(0x40000000),
                        blurRadius: 12,
                        offset: Offset(0, 5),
                        spreadRadius: -4,
                      ),
                    ]
                  : null,
            ),
            child: Icon(
              selected ? section.activeIcon : section.icon,
              size: 20,
              color: selected ? pill.pillInk : color,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            section.label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

/// "Good morning, [vault name]" with a waving hand — the Home title.
class _HomeGreeting extends ConsumerWidget {
  const _HomeGreeting();

  static String _hello(int hour) => hour < 5
      ? 'Good evening'
      : hour < 12
      ? 'Good morning'
      : hour < 17
      ? 'Good afternoon'
      : 'Good evening';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name = ref.watch(selectedVaultProvider).name;
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '${_hello(DateTime.now().hour)},',
          style: text.bodySmall?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        // An icon, not the 👋 emoji: the bundled Inter has no emoji glyphs, and
        // the fallback rendered as a missing-glyph box on iOS.
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                name,
                overflow: TextOverflow.ellipsis,
                style: text.titleMedium?.copyWith(fontWeight: FontWeight.w500),
              ),
            ),
            const SizedBox(width: 6),
            Icon(
              Icons.waving_hand_rounded,
              size: 18,
              color: context.colors.gold,
            ),
          ],
        ),
      ],
    );
  }
}

/// Account-level destinations, behind the avatar.
///
/// Settings, Import and Search are things you do TO the vault rather than
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
          backgroundColor: scheme.primary,
          child: Icon(Icons.person_outline, size: 18, color: scheme.onPrimary),
        ),
      ),
    );
  }
}
