import 'package:flutter/material.dart';

import '../../design_system/tokens/khazana_colors.dart';

/// Semantic colours that differ between Vault (dark) and Ledger (light).
///
/// ── Why this exists ────────────────────────────────────────────────────────
///
/// `AppColors.income`, `.expense`, `.accent` and the budget steps were `const`
/// fields pointing at the **Vault** values, and roughly 250 widget sites read
/// them directly. A `const` cannot know the active theme, so those sites
/// rendered the dark-theme colour in light mode — the exact failure
/// `app_theme.dart` warns about two lines above where it builds the scheme:
///
///     "Vault and Ledger are a PAIR OF CHOICES, not one choice inverted. The
///      accent in particular differs: Vault's #20C98A reads 3.0:1 on a white
///      card, which fails text contrast, so Ledger steps down to #087A56."
///
/// `ledgerPrimary` was created for that reason and then never reached the
/// widgets. Measured on a white card, the values those sites actually used are:
///
///     income  #20C98A → 2.15:1   (Ledger's #087A56 → 5.35:1)
///     expense #F06464 → 3.13:1   (Ledger's #C73D46 → 5.02:1)
///
/// Both are below the 4.5:1 bar for text, on the two figures a finance app
/// exists to show. This is an accessibility defect, not a preference.
///
/// A single value cannot fix it: a green legible on white is unreadable on the
/// near-black Vault canvas and vice versa, which is why the pair exists. The
/// colour therefore has to be read from the theme, and a `ThemeExtension` is
/// how Flutter carries semantics the Material `ColorScheme` has no slot for —
/// `ColorScheme` offers no "income" or "over budget".
///
/// Reach these through `context.colors`, never through a `const`.
@immutable
class SemanticColors extends ThemeExtension<SemanticColors> {
  const SemanticColors({
    required this.income,
    required this.expense,
    required this.accent,
    required this.accentGlow,
    required this.gold,
    required this.goldInk,
    required this.warn,
    required this.info,
    required this.budgetOk,
    required this.budgetWarn,
    required this.budgetOver,
  });

  /// Money in. Never the same value as [accent] — see [accent].
  final Color income;

  /// Money out.
  final Color expense;

  /// The interaction colour: primary buttons, active nav, focus.
  ///
  /// Mirrors `ColorScheme.primary`, exposed here so a widget needing one
  /// semantic colour does not have to read from two different places.
  final Color accent;

  /// The brighter accent step, for glows and gradient ends. Decorative — never
  /// put text on it.
  final Color accentGlow;

  /// Identity gold. Never an ordinary button colour.
  final Color gold;

  /// Gold as small text. Plain [gold] clears the 3:1 graphic bar but not the
  /// 4.5:1 text bar on a light card.
  final Color goldInk;

  final Color warn;
  final Color info;

  /// Budget progress steps (PRD §7C): ok <70%, warn 70–90%, over >90%.
  final Color budgetOk;
  final Color budgetWarn;
  final Color budgetOver;

  /// Vault — the dark theme.
  static const dark = SemanticColors(
    income: KhazanaColors.vaultSuccess,
    expense: KhazanaColors.vaultDanger,
    accent: KhazanaColors.vaultPrimary,
    accentGlow: KhazanaColors.emerald500,
    gold: KhazanaColors.vaultGold,
    goldInk: KhazanaColors.vaultGold,
    warn: KhazanaColors.vaultWarning,
    info: KhazanaColors.vaultInfo,
    budgetOk: KhazanaColors.vaultSuccess,
    budgetWarn: KhazanaColors.vaultWarning,
    budgetOver: KhazanaColors.vaultDanger,
  );

  /// Ledger — the light theme. These are the steps `khazana_colors.dart`
  /// already contrast-verified against a white card; they simply were not
  /// reaching the widgets.
  static const light = SemanticColors(
    income: KhazanaColors.ledgerSuccess,
    expense: KhazanaColors.ledgerDanger,
    accent: KhazanaColors.ledgerPrimary,
    accentGlow: KhazanaColors.emerald600,
    gold: KhazanaColors.ledgerGold,
    goldInk: KhazanaColors.ledgerGoldInk,
    warn: KhazanaColors.ledgerWarning,
    info: KhazanaColors.ledgerInfo,
    budgetOk: KhazanaColors.ledgerSuccess,
    budgetWarn: KhazanaColors.ledgerWarning,
    budgetOver: KhazanaColors.ledgerDanger,
  );

  static SemanticColors of(Brightness b) =>
      b == Brightness.dark ? dark : light;

  @override
  SemanticColors copyWith({
    Color? income,
    Color? expense,
    Color? accent,
    Color? accentGlow,
    Color? gold,
    Color? goldInk,
    Color? warn,
    Color? info,
    Color? budgetOk,
    Color? budgetWarn,
    Color? budgetOver,
  }) {
    return SemanticColors(
      income: income ?? this.income,
      expense: expense ?? this.expense,
      accent: accent ?? this.accent,
      accentGlow: accentGlow ?? this.accentGlow,
      gold: gold ?? this.gold,
      goldInk: goldInk ?? this.goldInk,
      warn: warn ?? this.warn,
      info: info ?? this.info,
      budgetOk: budgetOk ?? this.budgetOk,
      budgetWarn: budgetWarn ?? this.budgetWarn,
      budgetOver: budgetOver ?? this.budgetOver,
    );
  }

  @override
  SemanticColors lerp(ThemeExtension<SemanticColors>? other, double t) {
    if (other is! SemanticColors) return this;
    return SemanticColors(
      income: Color.lerp(income, other.income, t)!,
      expense: Color.lerp(expense, other.expense, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      accentGlow: Color.lerp(accentGlow, other.accentGlow, t)!,
      gold: Color.lerp(gold, other.gold, t)!,
      goldInk: Color.lerp(goldInk, other.goldInk, t)!,
      warn: Color.lerp(warn, other.warn, t)!,
      info: Color.lerp(info, other.info, t)!,
      budgetOk: Color.lerp(budgetOk, other.budgetOk, t)!,
      budgetWarn: Color.lerp(budgetWarn, other.budgetWarn, t)!,
      budgetOver: Color.lerp(budgetOver, other.budgetOver, t)!,
    );
  }
}

/// `context.colors.income` — the only supported way to read a semantic colour.
extension SemanticColorsX on BuildContext {
  SemanticColors get colors {
    // Falls back rather than throwing: a widget rendered in a bare
    // `MaterialApp` under test would otherwise crash on a null extension, and a
    // missing colour is not worth failing a test that is about something else.
    return Theme.of(this).extension<SemanticColors>() ??
        SemanticColors.of(Theme.of(this).brightness);
  }
}
