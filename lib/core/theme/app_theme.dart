import 'package:flutter/material.dart';

import 'app_tokens.dart';

/// Light + dark themes. All 11 screens are golden-tested in both (PRD §4A).
abstract final class AppTheme {
  static ThemeData get light => _build(Brightness.light);
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.accent,
      brightness: brightness,
      surface: isDark ? AppColors.darkSurface : AppColors.lightSurface,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor:
          isDark ? AppColors.darkCanvas : AppColors.lightCanvas,
      // PRD §10A: minimum 48dp touch targets across the app.
      materialTapTargetSize: MaterialTapTargetSize.padded,
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(AppSpacing.minTouchTarget * 2,
              AppSpacing.minTouchTarget),
        ),
      ),
      cardTheme: CardThemeData(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.card),
        ),
      ),
      // PRD §10A: focus ring visible for keyboard navigation (Web).
      focusColor: AppColors.accent.withValues(alpha: 0.4),
    );
  }
}
