import 'package:flutter/material.dart';

/// Design tokens (PRD §10A accessibility palette + §3B theme tokens).
///
/// Income green (#10B981) and expense red (#EF4444) both pass WCAG AA contrast
/// on the dark canvas — verified in the PRD.
abstract final class AppColors {
  // Brand
  static const Color accent = Color(0xFF1A56DB);

  // Semantic money colors (PRD §10A — verified contrast).
  static const Color income = Color(0xFF10B981);
  static const Color expense = Color(0xFFEF4444);

  // Budget progress thresholds (PRD §7C): green <70%, amber 70–90%, red >90%.
  static const Color budgetOk = Color(0xFF10B981);
  static const Color budgetWarn = Color(0xFFF59E0B);
  static const Color budgetOver = Color(0xFFEF4444);

  // Dark canvas
  static const Color darkCanvas = Color(0xFF0F172A);
  static const Color darkSurface = Color(0xFF1E293B);
  static const Color darkOnSurface = Color(0xFFE2E8F0);

  // Light canvas
  static const Color lightCanvas = Color(0xFFF8FAFC);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightOnSurface = Color(0xFF1E293B);
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
  static const double card = 16;
  static const double button = 12;
}
