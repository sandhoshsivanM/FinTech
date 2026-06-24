import 'package:flutter/material.dart';

/// Design tokens (PRD §10A accessibility palette + §3B design-system tokens).
/// Aesthetic: modern dark "glassmorphism" fintech — slate canvas, blue accent,
/// frosted translucent surfaces. Income/expense verified on the dark canvas.
abstract final class AppColors {
  // Brand / accent
  static const Color accent = Color(0xFF3B82F6); // brighter blue for dark UI
  static const Color accentDeep = Color(0xFF1A56DB);
  static const Color accentGlow = Color(0xFF60A5FA);

  // Semantic money colors (PRD §10A — pass contrast on both light and dark).
  static const Color income = Color(0xFF10B981);
  static const Color expense = Color(0xFFEF4444);

  // Budget progress thresholds (PRD §7C): green <70%, amber 70–90%, red >90%.
  static const Color budgetOk = Color(0xFF10B981);
  static const Color budgetWarn = Color(0xFFF59E0B);
  static const Color budgetOver = Color(0xFFEF4444);

  // Dark canvas (the primary surface, PRD "dark canvas").
  static const Color bgTop = Color(0xFF0F172A);
  static const Color bgBottom = Color(0xFF0A0F1E);
  static const Color darkCanvas = Color(0xFF0F172A);
  static const Color darkSurface = Color(0xFF1E293B);
  static const Color darkOnSurface = Color(0xFFE2E8F0);
  static const Color darkOnSurfaceMuted = Color(0xFF94A3B8);

  // Glass surfaces (translucent over the gradient canvas).
  static const Color glassFillDark = Color(0x14FFFFFF); // ~8% white
  static const Color glassBorderDark = Color(0x1FFFFFFF); // ~12% white

  // Light canvas (secondary theme).
  static const Color lightCanvas = Color(0xFFF1F5F9);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightOnSurface = Color(0xFF0F172A);
  static const Color glassFillLight = Color(0xCCFFFFFF);
  static const Color glassBorderLight = Color(0x14000000);

  /// Brand gradient used for hero surfaces and primary actions.
  static const List<Color> accentGradient = [Color(0xFF3B82F6), Color(0xFF1A56DB)];
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
