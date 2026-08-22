import 'package:flutter/material.dart';

import '../core/theme/app_tokens.dart';
import '../domain/entities/asset_group.dart';

/// The categorical palette for the seven chart groups.
///
/// Mirrors `SERIES_BY_KEY` in `webapp/src/domain/palette.ts` exactly. That file
/// is the source of truth: it authors the palette in OKLCH, and
/// `webapp/src/domain/palette.test.ts` asserts the separation and contrast
/// figures rather than quoting them. This file previously carried two stacked
/// headers claiming DIFFERENT validator results for the same seven colours
/// (ΔE 9.1 protan in one, 12.7 deuteranopia in the other) — numbers no check
/// could ever have contradicted.
///
/// Two slots are pinned for MEANING, not position:
///   * gold   -> the gold hue. A slice labelled "Gold" rendering blue — or, as
///               an earlier palette had it, green — reads as a bug to anyone
///               looking at the legend.
///   * equity -> the emerald. The brand-leading colour, and almost always the
///               largest slice.
///
/// **A step per theme.** The previous set used one value for both grounds,
/// which forced every hue into the middle of the lightness range: washed out on
/// Vault and weak on Ledger at once. Same hue in both themes, different
/// lightness — a series must not change identity when the theme does.
///
/// **Every PAIR separates, not just neighbours.** The old set guaranteed only
/// adjacent pairs in draw order, which is not what a reader sees: a book holding
/// just equity and real-estate renders those two side by side though four slots
/// separate them in the list. Under that realistic test the old palette fell to
/// ΔE 3.0 (deuteranopia). This one holds every pair at ≥8, so slice order is a
/// free choice rather than a hazard.
Color groupColor(AssetGroup g, {bool dark = true}) => dark
    ? switch (g) {
        AssetGroup.equity => const Color(0xFF4EB982),
        AssetGroup.debt => const Color(0xFFA4AAF6),
        AssetGroup.gold => const Color(0xFFC19C3A),
        AssetGroup.realEstate => const Color(0xFF63A1D5),
        AssetGroup.retirement => const Color(0xFFEA8760),
        AssetGroup.crypto => const Color(0xFF73C7CC),
        AssetGroup.cash => const Color(0xFFCA7CB4),
      }
    : switch (g) {
        AssetGroup.equity => const Color(0xFF008451),
        AssetGroup.debt => const Color(0xFF757AC2),
        AssetGroup.gold => const Color(0xFFA07C06),
        AssetGroup.realEstate => const Color(0xFF2F6D9E),
        AssetGroup.retirement => const Color(0xFF983E14),
        AssetGroup.crypto => const Color(0xFF3E9498),
        AssetGroup.cash => const Color(0xFF8D447A),
      };

/// Most steps a single hue family can carry before they stop separating.
const kMaxGroupShades = 5;

/// An ordinal ramp within one group's hue, for the sunburst's outer ring.
///
/// The children of a group share their parent's hue and differ only in
/// lightness. That is a composite encoding — family hue picks the asset class,
/// lightness step picks the child — and it is the legitimate way past the
/// seven-hue ceiling that [groupColor] runs into.
///
/// **Not implemented as opacity**, despite that being the obvious reading of
/// "the parent hue at lower opacity". The app draws its charts over a gradient
/// backdrop, so an alpha-blended arc's effective colour depends on where it
/// happens to sit on screen, and its contrast cannot be verified at all.
/// Lerping toward the surface colour produces the same visual effect with a
/// colour that is actually knowable.
///
/// Capped at [kMaxGroupShades]: past five, adjacent steps are indistinguishable
/// and the chart is lying about how many things it can tell apart. Callers with
/// more children than that should bucket the tail into an "Other" slice rather
/// than asking for a sixth shade.
///
/// The step index must come from a **stable key** — an enum position, an
/// alphabetical rank — never from value order. Colour keyed on rank means a
/// price movement repaints the chart, and the user learns that the colours mean
/// nothing.
List<Color> groupShades(AssetGroup g, int count, {required bool dark}) {
  final base = groupColor(g, dark: dark);
  final toward = dark ? AppColors.darkSurface : AppColors.lightSurface;
  final n = count.clamp(1, kMaxGroupShades);
  return [
    for (var i = 0; i < n; i++)
      i == 0 ? base : Color.lerp(base, toward, 0.14 * i)!,
  ];
}
