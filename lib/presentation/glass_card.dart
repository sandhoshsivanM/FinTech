import 'dart:ui';

import 'package:flutter/material.dart';

import '../core/theme/app_tokens.dart';

/// Glassmorphism surface (PRD Phase 4 visual upgrade) with a mandatory fallback
/// (PRD §10A): if backdrop blur is unsupported or the user prefers reduced
/// motion / transparency, render a solid surface so text stays readable.
class GlassCard extends StatelessWidget {
  const GlassCard({
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.lg),
    super.key,
  });

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surface = Theme.of(context).colorScheme.surface;

    // Fallback: solid surface when transparency/animations are disabled
    // (accessibility) — never render unreadable text over a blur.
    final useSolid = media.disableAnimations || media.highContrast;

    final radius = BorderRadius.circular(AppRadii.card);
    final content = Padding(padding: padding, child: child);

    if (useSolid) {
      return Card(
        shape: RoundedRectangleBorder(borderRadius: radius),
        child: content,
      );
    }

    return ClipRRect(
      borderRadius: radius,
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
        child: Container(
          decoration: BoxDecoration(
            color: surface.withValues(alpha: isDark ? 0.55 : 0.7),
            borderRadius: radius,
            border: Border.all(
              color: Colors.white.withValues(alpha: isDark ? 0.08 : 0.4),
            ),
          ),
          child: content,
        ),
      ),
    );
  }
}
