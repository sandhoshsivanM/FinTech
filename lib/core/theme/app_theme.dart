import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_tokens.dart';

/// Premium dark-first "glassmorphism" theme (PRD §10A dark canvas + §3B design
/// system). Scaffolds are transparent — the gradient background is painted
/// globally by [AppBackground] via MaterialApp.builder.
/// Applies tabular figures app-wide, and tightens tracking on the large sizes.
///
/// Tabular figures are the single largest difference between a screen that
/// looks like a finance product and one that does not. By default digits are
/// proportionally spaced — a 1 is narrower than a 0 — so ₹1,11,111 and
/// ₹9,99,999 are different widths, decimal points in a column do not line up,
/// and a figure that updates appears to twitch because its digits reflow. Every
/// terminal, ledger and broker app uses tabular figures for exactly this
/// reason, and no amount of alignment work compensates for their absence.
///
/// Applied to the whole theme rather than to money widgets alone, because the
/// moment one label opts out the column it sits in stops aligning, and tracking
/// down which one is a worse job than never allowing it.
///
/// Large sizes also get negative letter spacing. Type set at 32px carries the
/// tracking it was designed for at 16px, which at that size reads as loose.
TextTheme _numericTextTheme(TextTheme t) {
  const figures = [FontFeature.tabularFigures()];
  TextStyle? tight(TextStyle? s, double spacing) =>
      s?.copyWith(fontFeatures: figures, letterSpacing: spacing);

  return t.copyWith(
    displayLarge: tight(t.displayLarge, -1.5),
    displayMedium: tight(t.displayMedium, -1.0),
    displaySmall: tight(t.displaySmall, -0.8),
    headlineLarge: tight(t.headlineLarge, -0.8),
    headlineMedium: tight(t.headlineMedium, -0.6),
    headlineSmall: tight(t.headlineSmall, -0.4),
    titleLarge: tight(t.titleLarge, -0.2),
    titleMedium: tight(t.titleMedium, -0.1),
    titleSmall: tight(t.titleSmall, 0),
    bodyLarge: tight(t.bodyLarge, 0),
    bodyMedium: tight(t.bodyMedium, 0),
    bodySmall: tight(t.bodySmall, 0),
    labelLarge: tight(t.labelLarge, 0),
    labelMedium: tight(t.labelMedium, 0),
    labelSmall: tight(t.labelSmall, 0.2),
  );
}

abstract final class AppTheme {
  static ThemeData get dark => _build(Brightness.dark);
  static ThemeData get light => _build(Brightness.light);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;

    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.accentDeep,
      brightness: brightness,
    ).copyWith(
      primary: AppColors.accent,
      surface: isDark ? AppColors.darkSurface : AppColors.lightSurface,
      onSurface: isDark ? AppColors.darkOnSurface : AppColors.lightOnSurface,
      onSurfaceVariant:
          isDark ? AppColors.darkOnSurfaceMuted : const Color(0xFF475569),
    );

    final glassFill =
        isDark ? AppColors.glassFillDark : AppColors.glassFillLight;
    final glassBorder =
        isDark ? AppColors.glassBorderDark : AppColors.glassBorderLight;

    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: Colors.transparent,
      canvasColor: Colors.transparent,
      materialTapTargetSize: MaterialTapTargetSize.padded,
    );

    return base.copyWith(
      textTheme: _numericTextTheme(base.textTheme.apply(
        bodyColor: scheme.onSurface,
        displayColor: scheme.onSurface,
      )),
      appBarTheme: AppBarTheme(
        centerTitle: true,
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        foregroundColor: scheme.onSurface,
        titleTextStyle: base.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w700,
          color: scheme.onSurface,
          letterSpacing: 0.2,
        ),
        systemOverlayStyle:
            isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: scheme.surface, // opaque charcoal/white — hairline carries definition
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.card),
          side: BorderSide(color: glassBorder),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.accent,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, AppSpacing.minTouchTarget),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.button),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: scheme.onSurface,
          minimumSize: const Size(0, AppSpacing.minTouchTarget),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.button),
          ),
          side: BorderSide(color: glassBorder),
          textStyle: const TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: AppColors.accentGlow),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          backgroundColor: WidgetStateProperty.resolveWith((s) =>
              s.contains(WidgetState.selected)
                  ? AppColors.accent.withValues(alpha: 0.22)
                  : Colors.transparent),
          foregroundColor: WidgetStateProperty.resolveWith((s) =>
              s.contains(WidgetState.selected)
                  ? AppColors.accentGlow
                  : scheme.onSurfaceVariant),
          side: WidgetStatePropertyAll(BorderSide(color: glassBorder)),
          shape: WidgetStatePropertyAll(RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.button),
          )),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: glassFill,
        hintStyle: TextStyle(color: scheme.onSurfaceVariant),
        labelStyle: TextStyle(color: scheme.onSurfaceVariant),
        contentPadding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md, vertical: AppSpacing.md),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.button),
          borderSide: BorderSide(color: glassBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.button),
          borderSide: BorderSide(color: glassBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.button),
          borderSide: const BorderSide(color: AppColors.accent, width: 2),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 66,
        elevation: 0,
        backgroundColor: isDark
            ? AppColors.darkSurface.withValues(alpha: 0.92)
            : Colors.white.withValues(alpha: 0.92),
        surfaceTintColor: Colors.transparent,
        indicatorColor: AppColors.accent.withValues(alpha: 0.22),
        iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(
              color: s.contains(WidgetState.selected)
                  ? AppColors.accentGlow
                  : scheme.onSurfaceVariant,
            )),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontSize: 11,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w700
                : FontWeight.w500,
            color: states.contains(WidgetState.selected)
                ? AppColors.accentGlow
                : scheme.onSurfaceVariant,
          ),
        ),
      ),
      listTileTheme: ListTileThemeData(
        contentPadding:
            const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 4),
        iconColor: scheme.onSurfaceVariant,
        textColor: scheme.onSurface,
      ),
      dividerTheme: DividerThemeData(color: glassBorder, thickness: 1, space: 1),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: glassFill,
        side: BorderSide(color: glassBorder),
        labelStyle: TextStyle(color: scheme.onSurface),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.pill),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: isDark ? AppColors.darkSurface : Colors.white,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.card),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: isDark ? AppColors.darkSurface : Colors.white,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: isDark ? AppColors.darkSurface : null,
        contentTextStyle:
            TextStyle(color: isDark ? AppColors.darkOnSurface : null),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.button),
        ),
      ),
      progressIndicatorTheme:
          const ProgressIndicatorThemeData(color: AppColors.accent),
    );
  }
}
