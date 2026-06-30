import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/router/app_router.dart';
import 'core/router/layout_providers.dart';
import 'core/theme/app_theme.dart';
import 'presentation/app_background.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: FintechOsApp()));
}

class FintechOsApp extends ConsumerWidget {
  const FintechOsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Khazana',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      // Default to light (user preference); the gradient backdrop + glass
      // surfaces give the premium look in both themes.
      themeMode: ThemeMode.light,
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
