import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../design_system/tokens/khazana_colors.dart';
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
/// The design-system type scale, applied to Material's slots.
///
/// Sizes and line heights come from `design_system/tokens/typography.ts` and its
/// Dart mirror, so the mobile app and the web app set the same ramp. Tabular
/// figures are on for every slot: this is a finance app, and columns of numbers
/// that do not line up look broken however good the rest of the design is.
///
/// Tracking tightens as size grows — large type needs less air between letters,
/// which is the opposite of what Material's defaults assume.
TextTheme _numericTextTheme(TextTheme t) {
  const figures = [FontFeature.tabularFigures()];

  TextStyle? spec(TextStyle? s, double size, double height, FontWeight w, double tracking) =>
      s?.copyWith(
        fontSize: size,
        height: height / size,
        fontWeight: w,
        letterSpacing: tracking,
        fontFeatures: figures,
      );

  return t.copyWith(
    // Display / headings
    displayLarge: spec(t.displayLarge, 48, 56, FontWeight.w700, -1.4),
    displayMedium: spec(t.displayMedium, 40, 48, FontWeight.w700, -1.1),
    displaySmall: spec(t.displaySmall, 32, 40, FontWeight.w700, -0.9),
    headlineLarge: spec(t.headlineLarge, 32, 40, FontWeight.w700, -0.9),
    headlineMedium: spec(t.headlineMedium, 24, 32, FontWeight.w700, -0.6),
    headlineSmall: spec(t.headlineSmall, 20, 28, FontWeight.w600, -0.4),
    // Titles
    titleLarge: spec(t.titleLarge, 20, 28, FontWeight.w600, -0.3),
    titleMedium: spec(t.titleMedium, 16, 24, FontWeight.w600, -0.15),
    titleSmall: spec(t.titleSmall, 14, 22, FontWeight.w600, -0.1),
    // Body
    bodyLarge: spec(t.bodyLarge, 16, 24, FontWeight.w400, 0),
    bodyMedium: spec(t.bodyMedium, 14, 22, FontWeight.w400, 0),
    bodySmall: spec(t.bodySmall, 13, 20, FontWeight.w400, 0),
    // Labels
    labelLarge: spec(t.labelLarge, 14, 22, FontWeight.w600, 0),
    labelMedium: spec(t.labelMedium, 13, 20, FontWeight.w500, 0),
    labelSmall: spec(t.labelSmall, 12, 18, FontWeight.w500, 0.2),
  );
}

abstract final class AppTheme {
  static ThemeData get dark => _build(Brightness.dark);
  static ThemeData get light => _build(Brightness.light);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;

    // Vault and Ledger are a PAIR OF CHOICES, not one choice inverted. The
    // accent in particular differs: Vault's #20C98A reads 3.0:1 on a white
    // card, which fails text contrast, so Ledger steps down to #087A56.
    final primary =
        isDark ? KhazanaColors.vaultPrimary : KhazanaColors.ledgerPrimary;
    final onPrimary =
        isDark ? KhazanaColors.vaultPrimaryOn : KhazanaColors.ledgerPrimaryOn;

    final scheme = ColorScheme.fromSeed(
      seedColor: primary,
      brightness: brightness,
    ).copyWith(
      primary: primary,
      onPrimary: onPrimary,
      primaryContainer: isDark
          ? KhazanaColors.vaultPrimarySoft
          : KhazanaColors.ledgerPrimarySoft,
      onPrimaryContainer: primary,
      secondary: isDark ? KhazanaColors.vaultGold : KhazanaColors.ledgerGold,
      surface: isDark
          ? KhazanaColors.vaultSurfaceElevated
          : KhazanaColors.ledgerSurface,
      surfaceContainerHighest: isDark
          ? KhazanaColors.vaultSurfaceStrong
          : KhazanaColors.ledgerSurfaceSecondary,
      onSurface: isDark
          ? KhazanaColors.vaultTextPrimary
          : KhazanaColors.ledgerTextPrimary,
      onSurfaceVariant: isDark
          ? KhazanaColors.vaultTextSecondary
          : KhazanaColors.ledgerTextSecondary,
      outline: isDark ? KhazanaColors.vaultBorder : KhazanaColors.ledgerBorder,
      outlineVariant: isDark
          ? KhazanaColors.vaultBorderStrong
          : KhazanaColors.ledgerBorderStrong,
      error: isDark ? KhazanaColors.vaultDanger : KhazanaColors.ledgerDanger,
    );

    final glassFill =
        isDark ? AppColors.glassFillDark : AppColors.glassFillLight;
    final glassBorder =
        isDark ? AppColors.glassBorderDark : AppColors.glassBorderLight;

    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      // Inter, bundled in assets/fonts. Without this the app fell back to the
      // platform default — SF Pro on iOS, Roboto on Android — so the two mobile
      // builds and the web app were all set in different faces.
      fontFamily: 'Inter',
      // Inter carries no emoji, and naming a family removes the platform's
      // automatic fallback — which turned the greeting's wave into a tofu box.
      // The emoji fonts must be listed explicitly.
      fontFamilyFallback: const [
        'Apple Color Emoji',
        'Noto Color Emoji',
        'Segoe UI Emoji',
      ],
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
          backgroundColor: scheme.primary,
          // Near-black on Vault emerald (8.9:1); white on Ledger emerald
          // (5.4:1). White on Vault would be 2.4:1 — unreadable.
          foregroundColor: scheme.onPrimary,
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
        style: TextButton.styleFrom(foregroundColor: scheme.primary),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          backgroundColor: WidgetStateProperty.resolveWith((s) =>
              s.contains(WidgetState.selected)
                  ? scheme.primaryContainer
                  : Colors.transparent),
          foregroundColor: WidgetStateProperty.resolveWith((s) =>
              s.contains(WidgetState.selected)
                  ? scheme.primary
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
          borderSide: BorderSide(color: scheme.primary, width: 2),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 66,
        elevation: 0,
        backgroundColor: isDark
            ? AppColors.darkSurface.withValues(alpha: 0.92)
            : Colors.white.withValues(alpha: 0.92),
        surfaceTintColor: Colors.transparent,
        indicatorColor: scheme.primaryContainer,
        iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(
              color: s.contains(WidgetState.selected)
                  ? scheme.primary
                  : scheme.onSurfaceVariant,
            )),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontSize: 11,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w700
                : FontWeight.w500,
            color: states.contains(WidgetState.selected)
                ? scheme.primary
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
          ProgressIndicatorThemeData(color: scheme.primary),
    );
  }
}
