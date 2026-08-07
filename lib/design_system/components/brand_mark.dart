import 'package:flutter/material.dart';

/// The Khazana mark.
///
/// Renders the SUPPLIED brand artwork from `assets/brand/khazana-mark.png` —
/// the same 1024px master every platform icon is generated from — rather than a
/// stand-in glyph. The web app draws the identical file, so the two clients
/// cannot drift apart.
///
/// Raster, so it is used at 24px and up. Anything smaller (a tab-bar glyph,
/// say) should use an outline icon instead: below that size the bevel and the
/// keyhole stop resolving.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 34, this.glow = false});

  final double size;

  /// A soft gold halo, matching the artwork's own lighting. For the unlock
  /// screen, where the mark is the largest thing on screen.
  final bool glow;

  @override
  Widget build(BuildContext context) {
    final image = Image.asset(
      'assets/brand/khazana-mark.png',
      width: size,
      height: size,
      fit: BoxFit.contain,
      filterQuality: FilterQuality.medium,
    );
    if (!glow) return image;
    return DecoratedBox(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFD9AD52).withValues(alpha: 0.22),
            blurRadius: size * 0.55,
            spreadRadius: size * 0.02,
          ),
        ],
      ),
      child: image,
    );
  }
}

/// KHAZANA, wide-tracked caps. The Flutter twin of the web `WordMark`.
class WordMark extends StatelessWidget {
  const WordMark({super.key, this.fontSize = 18, this.color});

  final double fontSize;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Text(
      'KHAZANA',
      style: TextStyle(
        fontSize: fontSize,
        fontWeight: FontWeight.w700,
        // The tracking is what carries the identity here.
        letterSpacing: fontSize * 0.22,
        color: color ?? Theme.of(context).colorScheme.onSurface,
      ),
    );
  }
}
