import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/router/app_router.dart';
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
      title: 'Fintech OS',
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
class _Responsive extends StatelessWidget {
  const _Responsive({required this.child});
  final Widget child;

  static const double _maxWidth = 640;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    if (width <= _maxWidth) return child;
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: _maxWidth),
        child: child,
      ),
    );
  }
}
