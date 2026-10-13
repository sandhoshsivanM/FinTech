import 'package:flutter/material.dart';

import '../core/theme/app_tokens.dart';

/// The canvas painted behind every screen (scaffolds are transparent).
class AppBackground extends StatelessWidget {
  const AppBackground({required this.child, super.key});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    // A flat, neutral canvas. The old gradient and coloured glows tinted every
    // card on top of them; the porcelain/graphite look depends on surfaces
    // being exact, close greys, so the canvas stays one colour.
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return ColoredBox(
      color: isDark ? AppColors.darkCanvas : AppColors.lightCanvas,
      child: child,
    );
  }
}
