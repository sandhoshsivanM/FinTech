import 'package:flutter/material.dart';

import '../../design_system/tokens/khazana_colors.dart';

/// Design tokens (PRD §10A accessibility palette + §3B design-system tokens).
///
/// Aesthetic: the Khazana identity, kept in step with the web app — a
/// green-cast near-black canvas (cream in light), an antique-gold accent, and
/// opaque surfaces with hairline borders.
///
/// The load-bearing rule: emerald is a SURFACE, gold is the ACCENT, and green
/// is reserved for gain. Green is both the brand's ground colour and the sign
/// of a profit, and those two must never be confusable — so nothing in the
/// chrome is green. Income/expense are contrast-verified on both canvases.
abstract final class AppColors {
  // Brand / accent.
  //
  // Emerald. The design system's core rule is "emerald = interaction, gold =
  // identity", so the accent that drives buttons, active nav and focus is
  // green, and gold is reserved for the mark. Near-black on emerald reads
  // 8.9:1, so primary buttons take dark text rather than white.
  /// Brand plate — the emerald the mark sits on. Matches `--brand-plate` on web.
  static const Color brandPlate = KhazanaColors.brandPlate;

  /// Brand gold — IDENTITY ONLY. The mark, the wordmark, wealth moments.
  /// Never a button colour: emerald is the interaction colour. Matches
  /// `--gold` on web.
  static const Color brandGold = KhazanaColors.vaultGold;

  static const Color accent = KhazanaColors.vaultPrimary;
  static const Color accentDeep = KhazanaColors.vaultPrimaryHover;
  static const Color accentGlow = KhazanaColors.emerald500;

  // Semantic money colours.
  //
  // Kept distinguishable by LIGHTNESS as well as hue: red and green are the
  // one pair a red-green colourblind reader cannot separate, and money is
  // exactly where that matters. Income sits lighter than expense, so a column
  // of figures still reads as two groups in greyscale.
  static const Color income = KhazanaColors.vaultSuccess;
  static const Color expense = KhazanaColors.vaultDanger;

  // Budget progress thresholds (PRD §7C): green <70%, amber 70–90%, red >90%.
  static const Color budgetOk = Color(0xFF34C98A);
  static const Color budgetWarn = KhazanaColors.vaultWarning;
  static const Color budgetOver = Color(0xFFF06A4D);

  // Dark canvas — near-black with a green cast, not neutral charcoal.
  //
  // A pure grey canvas would make the gold look like the only coloured thing on
  // screen. Carrying a trace of the brand emerald puts the canvas and the
  // accent on one continuum, so the gold reads as the brightest point of a
  // scale rather than an intrusion.
  //
  // The surface is deliberately LIGHTER than the canvas. Cards previously sat
  // at #17191F on a #0E0F13 background — four points of separation, which is
  // below the threshold at which an edge is visible without a border, so every
  // card depended entirely on its hairline to exist.
  static const Color bgTop = KhazanaColors.forest;
  static const Color bgBottom = KhazanaColors.vaultBackground;
  static const Color darkCanvas = KhazanaColors.vaultBackground;
  // #17203A, not #141B2D. The test asserting a card is distinguishable from the
  // page caught this at 0.0078 against a 0.008 floor — close enough to pass by
  // eye on a good monitor and not on a dim one, which is exactly the kind of
  // margin that should be decided by a number rather than by whoever is looking.
  static const Color darkSurface = KhazanaColors.vaultSurfaceElevated;
  static const Color darkOnSurface = KhazanaColors.vaultTextPrimary;
  static const Color darkOnSurfaceMuted = KhazanaColors.vaultTextSecondary;

  // Hairline surfaces (subtle fills + 1px borders, like the web's --fill/--line).
  static const Color glassFillDark = Color(0x14FFFFFF); // ~8% white fill
  static const Color glassBorderDark = Color(0x24FFFFFF); // ~14% white hairline

  // Light canvas — cream, from the brand sheet's light lockup.
  //
  // A cool blue-grey under a gold accent reads as an accident; a warm cream
  // reads as chosen. This is the same reasoning as the green-cast dark canvas —
  // a theme is a pair of deliberate choices, not one choice inverted.
  //
  // Note the accent is DEEPER in light than in dark: the sheet's #D4A93F only
  // manages ~3.2:1 on cream, which fails text contrast.
  //
  // Cards are pure white ON the tinted canvas rather than the other way round,
  // so a card is the brightest surface in light exactly as it is in dark. Both
  // themes then read as "the data sits above the page".
  static const Color lightCanvas = KhazanaColors.ledgerBackground;
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightOnSurface = KhazanaColors.ledgerTextPrimary;
  static const Color glassFillLight = Color(0x0D141A24); // ~5% ink fill
  static const Color glassBorderLight = Color(0x1F141A24); // ~12% ink hairline

  /// Accent gradient for hero surfaces and primary actions.
  static const List<Color> accentGradient = [KhazanaColors.vaultPrimary, KhazanaColors.emerald600];
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
