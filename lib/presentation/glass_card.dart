import 'package:flutter/material.dart';

import '../core/theme/app_tokens.dart';

/// Frosted "glass" surface (PRD §3B glassmorphism components).
///
/// Uses a translucent solid fill over the gradient backdrop rather than a live
/// `BackdropFilter` blur. Real-time backdrop blur is extremely expensive
/// (re-samples the scene every frame) and caused tab-switch jank, so we render
/// the frosted look with a translucent fill + border + soft shadow — which is
/// also the PRD §10A solid-surface fallback. Cheap, smooth, still glassy.
class GlassCard extends StatelessWidget {
  const GlassCard({
    required this.child,
    // 16, not 24. A trading screen earns its authority from density: every
    // point of padding is a point not spent on a figure, and at 24 a card
    // holding four numbers looked like a card holding one. The reference
    // dashboards this is measured against sit at 16 or below.
    this.padding = const EdgeInsets.all(AppSpacing.md),
    super.key,
  });

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final radius = BorderRadius.circular(AppRadii.card);
    // Slightly more opaque than the live-blur fill so text stays crisp without
    // sampling the backdrop.
    final fill = isDark
        ? AppColors.darkSurface // opaque charcoal surface
        : AppColors.lightSurface;
    final border =
        isDark ? AppColors.glassBorderDark : AppColors.glassBorderLight;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: fill,
        borderRadius: radius,
        border: Border.all(color: border),
        // Whisper of elevation — hairline border carries the definition.
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.35 : 0.05),
            blurRadius: 3,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: Padding(padding: padding, child: child),
    );
  }
}
