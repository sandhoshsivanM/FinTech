import 'package:flutter/material.dart';

/// Khazana colour tokens — Vault (dark) and Ledger (light).
///
/// THE RULE THAT GOVERNS EVERYTHING HERE:
///
///     Emerald = interaction.   Gold = identity.
///
/// Emerald carries primary buttons, active navigation and focus. Gold carries
/// the mark, the wordmark and wealth-flavoured brand moments — it is never the
/// ordinary button colour.
///
/// This is the Dart mirror of `webapp/src/design-system/tokens/colors.ts`. The
/// two files are a contract: the domain layer already keeps Dart and TypeScript
/// in parity, and the UI now does the same. Change one, change the other.
abstract final class KhazanaColors {
  // --- Brand ramp, shared by both themes ------------------------------------
  static const Color emerald500 = Color(0xFF18C98A);
  static const Color emerald600 = Color(0xFF0FAF73);
  static const Color emerald700 = Color(0xFF087A56);
  static const Color gold500 = Color(0xFFD9AD52);
  static const Color gold600 = Color(0xFFB8892F);
  static const Color obsidian = Color(0xFF080D0B);
  static const Color forest = Color(0xFF0D1713);

  /// The emerald the mark's plate is filled with.
  static const Color brandPlate = Color(0xFF0D3D2B);

  // --- Vault (dark) ---------------------------------------------------------
  // Four surface levels. Jumping from near-black straight to a bright card is
  // what makes dark UI look flat; each step is a small, even lift.
  static const Color vaultBackground = Color(0xFF080D0B);
  static const Color vaultSurface = Color(0xFF101714);
  static const Color vaultSurfaceElevated = Color(0xFF151E1A);
  static const Color vaultSurfaceStrong = Color(0xFF1A2520);
  static const Color vaultBorder = Color(0xFF26342E);
  static const Color vaultBorderStrong = Color(0xFF34443C);

  static const Color vaultTextPrimary = Color(0xFFF4F7F5);
  static const Color vaultTextSecondary = Color(0xFFA0ADA7);
  static const Color vaultTextMuted = Color(0xFF718079);
  static const Color vaultTextDisabled = Color(0xFF4E5A55);

  static const Color vaultPrimary = Color(0xFF20C98A);
  static const Color vaultPrimaryHover = Color(0xFF2BDB99);
  static const Color vaultPrimarySoft = Color(0xFF12352A);

  /// Text ON an emerald fill. Near-black reads 8.9:1; white would be 2.4:1.
  static const Color vaultPrimaryOn = Color(0xFF06110C);

  static const Color vaultGold = Color(0xFFD9AD52);
  static const Color vaultGoldSoft = Color(0xFF302718);

  static const Color vaultSuccess = Color(0xFF20C98A);
  static const Color vaultWarning = Color(0xFFE5B84D);
  static const Color vaultDanger = Color(0xFFF06464);
  static const Color vaultInfo = Color(0xFF63A8FF);

  // --- Ledger (light) -------------------------------------------------------
  // The page is #F5F7F5 and cards are white, so a card is the brightest
  // surface. That one step gives the light theme depth without a shadow.
  static const Color ledgerBackground = Color(0xFFF5F7F5);
  static const Color ledgerSurface = Color(0xFFFFFFFF);
  static const Color ledgerSurfaceSecondary = Color(0xFFEDF2EF);
  static const Color ledgerBorder = Color(0xFFDCE4DF);
  static const Color ledgerBorderStrong = Color(0xFFC7D2CC);

  static const Color ledgerTextPrimary = Color(0xFF101613);
  static const Color ledgerTextSecondary = Color(0xFF53625B);
  static const Color ledgerTextMuted = Color(0xFF718079);
  static const Color ledgerTextDisabled = Color(0xFFA7B1AC);

  static const Color ledgerPrimary = Color(0xFF087A56);
  static const Color ledgerPrimaryHover = Color(0xFF066A4A);
  static const Color ledgerPrimarySoft = Color(0xFFE1F3EB);
  static const Color ledgerPrimaryOn = Color(0xFFFFFFFF);

  static const Color ledgerGold = Color(0xFFA97922);
  static const Color ledgerGoldSoft = Color(0xFFF6EEDB);

  /// Gold as SMALL TEXT. `ledgerGold` is 3.9:1 on a card — enough for a graphic
  /// (3:1) but under the 4.5:1 body-text bar, so words use this darker step.
  static const Color ledgerGoldInk = Color(0xFF8E641B);

  static const Color ledgerSuccess = Color(0xFF087A56);
  static const Color ledgerWarning = Color(0xFFA97922);
  static const Color ledgerDanger = Color(0xFFC73D46);
  static const Color ledgerInfo = Color(0xFF2672C8);

  /// Categorical chart series. Emerald leads, gold follows.
  ///
  /// These are CHART steps, not UI steps: `vaultPrimary` sits outside the
  /// lightness band a categorical mark needs, so the emerald here is a darker
  /// step of the same hue.
  ///
  /// Validated in both themes — worst adjacent pair ΔE 8.1 under protanopia
  /// (target 8), normal-vision floor 18.2. The ORDER is the colourblind-safety
  /// mechanism; do not re-order.
  static const List<Color> series = [
    Color(0xFF189E6E), // emerald
    Color(0xFFBE8420), // gold
    Color(0xFF2E92C4), // blue
    Color(0xFFC9538A), // rose
    Color(0xFF4F7CFF), // indigo
    Color(0xFFCC6435), // orange
    Color(0xFF8E7CC3), // violet
    Color(0xFF2E9E63), // green
  ];

  /// Reserved neutral for "Other" / "Unclassified" — a coverage fact, not a
  /// category, so it must never compete with a real slice.
  static const Color seriesNeutralDark = Color(0xFF718079);
  static const Color seriesNeutralLight = Color(0xFFA7B1AC);
}
