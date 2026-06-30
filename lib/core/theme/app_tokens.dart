import 'package:flutter/material.dart';

/// Design tokens (PRD §10A accessibility palette + §3B design-system tokens).
/// Aesthetic: modern dark "glassmorphism" fintech — slate canvas, blue accent,
/// frosted translucent surfaces. Income/expense verified on the dark canvas.
abstract final class AppColors {
  // Brand / accent — refined slate-indigo (matches the Khazana web app's dark
  // accent), replacing the old bright blue.
  static const Color accent = Color(0xFF8B9BFF);
  static const Color accentDeep = Color(0xFF6F80F0);
  static const Color accentGlow = Color(0xFFAAB6FF);

  // Semantic money colors (web-tuned for the neutral dark canvas).
  static const Color income = Color(0xFF34C98A);
  static const Color expense = Color(0xFFF06A4D);

  // Budget progress thresholds (PRD §7C): green <70%, amber 70–90%, red >90%.
  static const Color budgetOk = Color(0xFF34C98A);
  static const Color budgetWarn = Color(0xFFE0A93A);
  static const Color budgetOver = Color(0xFFF06A4D);

  // Dark canvas — neutral near-black charcoal (premium, not slate-blue).
  static const Color bgTop = Color(0xFF121317);
  static const Color bgBottom = Color(0xFF0E0F13);
  static const Color darkCanvas = Color(0xFF0E0F13);
  static const Color darkSurface = Color(0xFF17191F);
  static const Color darkOnSurface = Color(0xFFE9EAEE);
  static const Color darkOnSurfaceMuted = Color(0xFF9CA0A8);

  // Hairline surfaces (subtle fills + 1px borders, like the web's --fill/--line).
  static const Color glassFillDark = Color(0x10FFFFFF); // ~6% white fill
  static const Color glassBorderDark = Color(0x1AFFFFFF); // ~10% white hairline

  // Light canvas (warm "paper", matches the web light theme).
  static const Color lightCanvas = Color(0xFFF7F6F3);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightOnSurface = Color(0xFF18191F);
  static const Color glassFillLight = Color(0x0D18191F); // ~5% ink fill
  static const Color glassBorderLight = Color(0x1718191F); // ~9% ink hairline

  /// Accent gradient for hero surfaces and primary actions.
  static const List<Color> accentGradient = [Color(0xFF8B9BFF), Color(0xFF6F80F0)];
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
