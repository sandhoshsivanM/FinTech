import 'package:flutter/material.dart';

import '../features/home/home_palette.dart';

/// The app's one progress bar: a rounded track with a diagonal-stripe fill
/// that grows in. Replaces the solid Material bars that each screen used to
/// style on its own, so every bar in the app now reads the same way.
///
/// [color] defaults to the data blue; screens that mean something by colour
/// (over budget, behind on a goal) pass their own.
class StripedBar extends StatelessWidget {
  const StripedBar({
    required this.value,
    this.color,
    this.height = 8,
    super.key,
  });

  final double value;
  final Color? color;
  final double height;

  @override
  Widget build(BuildContext context) {
    final palette = HomePalette.of(context);
    final fill = color ?? palette.blue;
    final reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final radius = BorderRadius.circular(height);
    return ClipRRect(
      borderRadius: radius,
      child: SizedBox(
        height: height,
        child: Stack(children: [
          Positioned.fill(
            child: ColoredBox(
                color: Theme.of(context)
                    .colorScheme
                    .onSurfaceVariant
                    .withValues(alpha: 0.12)),
          ),
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: value.isFinite ? value.clamp(0, 1) : 0),
            duration: reduce ? Duration.zero : const Duration(milliseconds: 700),
            curve: Curves.easeOutCubic,
            builder: (context, v, _) => FractionallySizedBox(
              widthFactor: v,
              child: ClipRRect(
                borderRadius: radius,
                child: CustomPaint(
                  painter: HatchPainter(fill,
                      gap: height < 6 ? 4 : 5, stroke: height < 6 ? 1.5 : 2),
                  size: Size(double.infinity, height),
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}
