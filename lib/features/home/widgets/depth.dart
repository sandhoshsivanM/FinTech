import 'package:flutter/material.dart';

/// The Zentra data hues: blue is the default, green and pink carry in/out,
/// amber is "close to a limit". Only ever used on data.
enum Hue {
  blue(Color(0xFF4691FE), Color(0xFF1C6FFB)),
  green(Color(0xFF7FD48D), Color(0xFF29B340)),
  pink(Color(0xFFFD6FAB), Color(0xFFF33688)),
  amber(Color(0xFFF2C46F), Color(0xFFE39A16));

  const Hue(this.light, this.deep);
  final Color light;
  final Color deep;

  /// The tone for a progress value in percent: blue while fine, amber near the
  /// limit (80%+), pink once over it.
  static Hue forCoverage(num pct) => pct >= 100
      ? Hue.blue
      : pct >= 60
      ? Hue.amber
      : Hue.pink;

  static Hue forPercent(double pct) => pct > 100
      ? Hue.pink
      : pct >= 80
      ? Hue.amber
      : Hue.blue;
}

/// A thick glossy pill gauge with the value on a chip at its tip, in a recessed
/// white track — the spec's `.opt-gauge`.
class Gauge extends StatelessWidget {
  const Gauge({
    required this.fraction,
    required this.hue,
    this.height = 26,
    super.key,
  });

  final double fraction;
  final Hue hue;
  final double height;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final f = fraction.isFinite ? fraction.clamp(0.0, 1.0) : 0.0;
    final inner = height - 6;
    return Container(
      height: height,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: dark ? const Color(0xFF222226) : Colors.white,
        borderRadius: BorderRadius.circular(height),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: dark ? 0.35 : 0.06),
            blurRadius: 3,
            offset: const Offset(0, 1),
            spreadRadius: -1,
          ),
        ],
      ),
      child: LayoutBuilder(
        builder: (context, box) {
          return Align(
            alignment: Alignment.centerLeft,
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: f),
              duration: reduce
                  ? Duration.zero
                  : const Duration(milliseconds: 750),
              curve: Curves.easeOutCubic,
              builder: (context, v, _) => Container(
                width: (box.maxWidth * v).clamp(46.0, box.maxWidth),
                height: inner,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(inner),
                  gradient: LinearGradient(
                    colors: [
                      Color.lerp(hue.deep, Colors.white, 0.45)!,
                      hue.deep,
                    ],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: hue.deep.withValues(alpha: 0.45),
                      blurRadius: 12,
                      offset: const Offset(0, 6),
                      spreadRadius: -6,
                    ),
                  ],
                ),
                foregroundDecoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(inner),
                  gradient: const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0x66FFFFFF), Color(0x00FFFFFF)],
                    stops: [0, 0.55],
                  ),
                ),
                alignment: Alignment.centerRight,
                padding: const EdgeInsets.only(right: 3),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7),
                  decoration: BoxDecoration(
                    color: const Color(0x40FFFFFF),
                    borderRadius: BorderRadius.circular(inner),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    '${(fraction.isFinite ? fraction * 100 : 0).round()}%',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 10.5,
                      height: 1.2,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
