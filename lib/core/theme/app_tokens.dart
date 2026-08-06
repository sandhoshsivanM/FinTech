import 'package:flutter/material.dart';

/// Design tokens (PRD §10A accessibility palette + §3B design-system tokens).
/// Aesthetic: premium "Khazana" look matching the web app — neutral charcoal
/// canvas (warm paper in light), slate-indigo accent, opaque surfaces with
/// hairline borders. Income/expense verified for contrast on both canvases.
abstract final class AppColors {
  // Brand / accent.
  //
  // Raised from a soft slate-indigo (#8B9BFF) to a saturated blue. The pale
  // version was chosen to sit quietly on a cream canvas; on the dark canvas it
  // reads as washed out, and an accent that does not carry is why "Add lot" and
  // a divider looked like the same weight of thing.
  static const Color accent = Color(0xFF4B7BEC);
  static const Color accentDeep = Color(0xFF3B6FE0);
  static const Color accentGlow = Color(0xFF7CA0FF);

  // Semantic money colours.
  //
  // Kept distinguishable by LIGHTNESS as well as hue: red and green are the
  // one pair a red-green colourblind reader cannot separate, and money is
  // exactly where that matters. Income sits lighter than expense, so a column
  // of figures still reads as two groups in greyscale.
  static const Color income = Color(0xFF2ED393);
  static const Color expense = Color(0xFFF4634A);

  // Budget progress thresholds (PRD §7C): green <70%, amber 70–90%, red >90%.
  static const Color budgetOk = Color(0xFF34C98A);
  static const Color budgetWarn = Color(0xFFE0A93A);
  static const Color budgetOver = Color(0xFFF06A4D);

  // Dark canvas — deep navy rather than neutral charcoal.
  //
  // A pure grey canvas makes a blue accent look like the only coloured thing on
  // screen. A canvas carrying a trace of the same blue lets the accent read as
  // the brightest point on a continuum instead of an intrusion, which is why
  // every trading terminal is navy and not grey.
  //
  // The surface is deliberately LIGHTER than the canvas. Cards previously sat
  // at #17191F on a #0E0F13 background — four points of separation, which is
  // below the threshold at which an edge is visible without a border, so every
  // card depended entirely on its hairline to exist.
  static const Color bgTop = Color(0xFF0D1220);
  static const Color bgBottom = Color(0xFF080B14);
  static const Color darkCanvas = Color(0xFF080B14);
  static const Color darkSurface = Color(0xFF141B2D);
  static const Color darkOnSurface = Color(0xFFE8ECF5);
  static const Color darkOnSurfaceMuted = Color(0xFF8B94AB);

  // Hairline surfaces (subtle fills + 1px borders, like the web's --fill/--line).
  static const Color glassFillDark = Color(0x14FFFFFF); // ~8% white fill
  static const Color glassBorderDark = Color(0x24FFFFFF); // ~14% white hairline

  // Light canvas (warm "paper", matches the web light theme).
  static const Color lightCanvas = Color(0xFFF7F6F3);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightOnSurface = Color(0xFF18191F);
  static const Color glassFillLight = Color(0x0D18191F); // ~5% ink fill
  static const Color glassBorderLight = Color(0x1718191F); // ~9% ink hairline

  /// Accent gradient for hero surfaces and primary actions.
  static const List<Color> accentGradient = [Color(0xFF4B7BEC), Color(0xFF3B5BDB)];
}

abstract final class AppSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 32;

  /// Minimum touch target (PRD §10A): 44pt iOS / 48dp Android — use 48 everywhere.
  static const double minTouchTarget = 48;
}

abstract final class AppRadii {
  static const double card = 20;
  static const double button = 14;
  static const double pill = 999;
}
