import 'package:flutter/material.dart';

import '../../../core/constants/category_icons.dart';
import '../../../core/constants/default_categories.dart';
import '../../../design_system/tokens/khazana_colors.dart';

/// A stable colour for a category icon: the default categories in order, so
/// the same category is the same colour on every screen.
Color categoryTint(BuildContext context, int? codepoint) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  final i = codepoint == null
      ? 7
      : kDefaultCategories.indexWhere((c) => c.icon.codePoint == codepoint);
  final palette = dark ? KhazanaColors.seriesDark : KhazanaColors.seriesLight;
  return palette[(i < 0 ? 7 : i) % palette.length];
}

/// The category glyph in a softly tinted circle — the leading avatar on a
/// money row.
class CategoryAvatar extends StatelessWidget {
  const CategoryAvatar({
    required this.codepoint,
    this.size = 40,
    this.fallback = Icons.category,
    super.key,
  });

  final int? codepoint;
  final double size;
  final IconData fallback;

  @override
  Widget build(BuildContext context) {
    final tint = categoryTint(context, codepoint);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.16),
        shape: BoxShape.circle,
      ),
      child: Icon(
        categoryIcon(codepoint, fallback: fallback),
        size: size * 0.45,
        color: tint,
      ),
    );
  }
}
