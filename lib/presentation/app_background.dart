import 'package:flutter/material.dart';

import '../core/theme/app_tokens.dart';

/// Global gradient backdrop painted behind every screen (scaffolds are
/// transparent). Adapts to light/dark and adds a subtle accent glow for a
/// premium fintech feel.
class AppBackground extends StatelessWidget {
  const AppBackground({required this.child, super.key});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final colors = isDark
        ? const [AppColors.bgTop, AppColors.bgBottom]
        : const [Color(0xFFFAF9F6), AppColors.lightCanvas]; // warm paper

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: colors,
        ),
      ),
      child: Stack(
        children: [
          // Soft accent glow, top-right.
          Positioned(
            top: -120,
            right: -80,
            child: _Glow(
              color: AppColors.accent
                  .withValues(alpha: isDark ? 0.10 : 0.08),
              size: 320,
            ),
          ),
          // Cooler glow, bottom-left.
          Positioned(
            bottom: -140,
            left: -100,
            child: _Glow(
              color: AppColors.accentGlow
                  .withValues(alpha: isDark ? 0.06 : 0.06),
              size: 360,
            ),
          ),
          child,
        ],
      ),
    );
  }
}

class _Glow extends StatelessWidget {
  const _Glow({required this.color, required this.size});
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: [color, color.withValues(alpha: 0)],
          ),
        ),
      ),
    );
  }
}
