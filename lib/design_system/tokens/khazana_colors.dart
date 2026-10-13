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
/// The Ledger (light) values mirror `webapp/src/app/globals.css`, which is the
/// web app's real source of truth.
///
/// This file used to name `webapp/src/design-system/tokens/colors.ts` as its
/// contract. That file is DEAD — nothing in the live web app imports it, and
/// `globals.css` drifted away from it — so the contract was faithfully
/// maintained against a document nobody was reading. That is how the two
/// clients came to ship different greens.
///
/// Vault (dark) deliberately does NOT mirror the web. The web's dark accent
/// (#3A8B68) measures 4.39:1 on its own card and 4.12:1 on ours, both under the
/// 4.5:1 text bar; `vaultPrimary` below is 7.94:1. Parity is not worth shipping
/// a colour that fails on the two figures a finance app exists to show. The
/// web's dark accent is a defect there, not a target here.
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
  static const Color vaultBackground = Color(0xFF0E0E10);
  static const Color vaultSurface = Color(0xFF141417);
  static const Color vaultSurfaceElevated = Color(0xFF1C1C20);
  static const Color vaultSurfaceStrong = Color(0xFF26262B);
  static const Color vaultBorder = Color(0xFF26262B);
  static const Color vaultBorderStrong = Color(0xFF34343A);

  static const Color vaultTextPrimary = Color(0xFFF5F5F7);
  static const Color vaultTextSecondary = Color(0xFFA1A1A8);
  static const Color vaultTextMuted = Color(0xFF76767E);
  static const Color vaultTextDisabled = Color(0xFF48484E);

  static const Color vaultPrimary = Color(0xFFF5F5F7);
  static const Color vaultPrimaryHover = Color(0xFFFFFFFF);
  static const Color vaultPrimarySoft = Color(0xFF26262B);

  /// Text ON an emerald fill. Near-black reads 8.9:1; white would be 2.4:1.
  static const Color vaultPrimaryOn = Color(0xFF111214);

  static const Color vaultGold = Color(0xFFD9AD52);
  static const Color vaultGoldSoft = Color(0xFF302718);

  static const Color vaultSuccess = Color(0xFF34C759);
  static const Color vaultWarning = Color(0xFFFFB340);
  static const Color vaultDanger = Color(0xFFFF4F9A);
  static const Color vaultInfo = Color(0xFF3D86FF);

  // --- Ledger (light) -------------------------------------------------------
  // The page is #F6F7F5 and cards are white, so a card is the brightest
  // surface. That one step gives the light theme depth without a shadow.
  //
  // These are `--canvas`, `--card` and `--line` from globals.css verbatim.
  static const Color ledgerBackground = Color(0xFFF2F2F2);
  static const Color ledgerSurface = Color(0xFFF8F8F8);
  static const Color ledgerSurfaceSecondary = Color(0xFFEDEDEF);
  static const Color ledgerBorder = Color(0xFFE6E6E8);
  static const Color ledgerBorderStrong = Color(0xFFD4D4D8);

  static const Color ledgerTextPrimary = Color(0xFF111214);
  static const Color ledgerTextSecondary = Color(0xFF5C5C61);
  static const Color ledgerTextMuted = Color(0xFF8E8E93);
  static const Color ledgerTextDisabled = Color(0xFFB5B5B5);

  /// `--accent` from globals.css. 6.47:1 on a white card, up from the 5.35:1
  /// of the #087A56 this replaced.
  static const Color ledgerPrimary = Color(0xFF111214);
  static const Color ledgerPrimaryHover = Color(0xFF000000);
  static const Color ledgerPrimarySoft = Color(0xFFE9E9EC);
  static const Color ledgerPrimaryOn = Color(0xFFFFFFFF);

  static const Color ledgerGold = Color(0xFFA97922);
  static const Color ledgerGoldSoft = Color(0xFFF6EEDB);

  /// Gold as SMALL TEXT. `ledgerGold` is 3.9:1 on a card — enough for a graphic
  /// (3:1) but under the 4.5:1 body-text bar, so words use this darker step.
  static const Color ledgerGoldInk = Color(0xFF8E641B);

  /// `--income` / `--expense` from globals.css: 5.83:1 and 5.42:1 on a card.
  ///
  /// `ledgerSuccess` is deliberately NOT the same value as `ledgerPrimary` any
  /// more. They were both #087A56, which made a primary button pixel-identical
  /// to a profit figure — the one confusion this palette's own header says must
  /// never happen.
  static const Color ledgerSuccess = Color(0xFF0B8A1E);
  static const Color ledgerWarning = Color(0xFFB86E00);
  static const Color ledgerDanger = Color(0xFFD61F69);
  static const Color ledgerInfo = Color(0xFF1C6FFB);

  /// Categorical chart series. Emerald leads, gold follows.
  ///
  /// These are CHART steps, not UI steps: `vaultPrimary` sits outside the
  /// lightness band a categorical mark needs, so the emerald here is a darker
  /// step of the same hue.
  ///
  /// Validated in both themes — worst adjacent pair ΔE 8.1 under protanopia
  /// (target 8), normal-vision floor 18.2. The ORDER is the colourblind-safety
  /// mechanism; do not re-order.
  static const List<Color> seriesDark = [
    Color(0xFF3D86FF), // blue
    Color(0xFF34C759), // green
    Color(0xFFFF4F9A), // pink
    Color(0xFF8E8E93), // grey
    Color(0xFF86B4FF), // blue tint
    Color(0xFF8ADB98), // green tint
    Color(0xFFFD9CC6), // pink tint
    Color(0xFF5A5A60), // dark grey
  ];

  /// The Ledger step: the Zentra data colours, then tints and neutrals.
  static const List<Color> seriesLight = [
    Color(0xFF1C6FFB), // blue
    Color(0xFF29B340), // green
    Color(0xFFF33688), // pink
    Color(0xFFB5B5BB), // grey
    Color(0xFF7FB0FD), // blue tint
    Color(0xFF8ADB98), // green tint
    Color(0xFFFC9CC4), // pink tint
    Color(0xFF8E8E93), // dark grey
  ];

  /// Back-compat: callers that predate per-theme values get the Vault step.
  static const List<Color> series = seriesDark;

  /// Reserved neutral for "Other" / "Unclassified" — a coverage fact, not a
  /// category, so it must never compete with a real slice.
  static const Color seriesNeutralDark = Color(0xFF5A5A60);
  static const Color seriesNeutralLight = Color(0xFFCFCFD4);
}
