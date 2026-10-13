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
    this.padding = const EdgeInsets.all(AppSpacing.lg),
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
        ? AppColors
              .darkSurface // opaque charcoal surface
        : AppColors.lightSurface;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: fill,
        borderRadius: radius,
        // A faint light edge and a soft drop, not a grey box outline: the
        // way the reference lifts #F8F8F8 cards off a #F2F2F2 canvas. One
        // colour on every side — Flutter cannot round a border whose sides
        // differ.
        border: Border.all(
          color: isDark ? const Color(0x12FFFFFF) : const Color(0xE6FFFFFF),
        ),
        boxShadow: [
          BoxShadow(
            color: isDark ? const Color(0x8C000000) : const Color(0x47111214),
            blurRadius: 26,
            offset: const Offset(0, 10),
            spreadRadius: -18,
          ),
        ],
      ),
      child: Padding(padding: padding, child: child),
    );
  }
}
