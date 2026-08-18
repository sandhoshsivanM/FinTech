import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'presentation/app_shell.dart' show isDesktopPlatform;

import 'core/branding.dart';
import 'core/router/app_router.dart';
import 'core/router/layout_providers.dart';
import 'core/services/notification_providers.dart';
import 'core/services/notification_service.dart';
import 'core/theme/app_theme.dart';
import 'features/settings/providers/theme_providers.dart';
import 'presentation/app_background.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Eager, and before runApp, for one reason: a notification tapped from a cold
  // start is waiting in getNotificationAppLaunchDetails(), and nothing reads it
  // unless the plugin is initialised. Left lazy — as it was — every such tap
  // landed on the dashboard regardless of what the notification was about.
  //
  // Cheap and safe to do here: it loads the tz database and registers channels,
  // touches no vault data, and asks for no permission (that happens in Settings,
  // on a tap, once the user knows what they are agreeing to).
  final notifications = NotificationService();
  await notifications.init();

  runApp(ProviderScope(
    overrides: [
      notificationServiceProvider.overrideWithValue(notifications),
    ],
    child: const KhazanaApp(),
  ));
}

class KhazanaApp extends ConsumerWidget {
  const KhazanaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: kAppName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      // Follows the OS unless the user has chosen, in Settings → Appearance.
      // This was hardcoded — first to light, then to dark — and a hardcoded
      // theme is a claim about someone's room made from the other side of the
      // world.
      themeMode: ref.watch(themeModeProvider),
      routerConfig: router,
      builder: (context, child) => AppBackground(
        child: _Responsive(child: child ?? const SizedBox()),
      ),
    );
  }
}

/// Centers and caps content width on large screens (web/desktop/tablet) so the
/// mobile-first layout doesn't stretch edge-to-edge. Phones are unaffected.
/// Screens that want a multi-panel desktop layout opt into a wider cap via
/// [wideLayoutProvider] (e.g. the calendar ledger).
class _Responsive extends ConsumerWidget {
  const _Responsive({required this.child});
  final Widget child;

  static const double _mobileMaxWidth = 640;
  static const double _wideMaxWidth = 1280;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Desktop draws its own full-width layout (sidebar + content), so capping
    // the width here would put a phone-sized column in the middle of the window.
    if (isDesktopPlatform) return child;
    final maxWidth =
        ref.watch(wideLayoutProvider) ? _wideMaxWidth : _mobileMaxWidth;
    final width = MediaQuery.sizeOf(context).width;
    if (width <= maxWidth) return child;
    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: child,
      ),
    );
  }
}
