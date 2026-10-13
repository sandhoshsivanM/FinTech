import 'package:flutter/material.dart';

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
/// Zentra series: blue, green, pink, grey, then tints of those. Gold takes the
/// one Zentra amber so a slice labelled "Gold" never reads as a bug.
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
        AssetGroup.equity => const Color(0xFF3D86FF),
        AssetGroup.debt => const Color(0xFF34C759),
        AssetGroup.gold => const Color(0xFFF0B03A),
        AssetGroup.realEstate => const Color(0xFFFF4F9A),
        AssetGroup.retirement => const Color(0xFF8E8E93),
        AssetGroup.crypto => const Color(0xFF86B4FF),
        AssetGroup.cash => const Color(0xFFFD9CC6),
      }
    : switch (g) {
        AssetGroup.equity => const Color(0xFF1C6FFB),
        AssetGroup.debt => const Color(0xFF29B340),
        AssetGroup.gold => const Color(0xFFE39A16),
        AssetGroup.realEstate => const Color(0xFFF33688),
        AssetGroup.retirement => const Color(0xFF8E8E93),
        AssetGroup.crypto => const Color(0xFF7FB0FD),
        AssetGroup.cash => const Color(0xFFFC9CC4),
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
  final n = count.clamp(1, kMaxGroupShades);
  // Alternate lighter and darker steps around the base, so neighbours always
  // differ by a full step in opposite directions. A one-way fade at 14% a step
  // left adjacent sector slices looking like the same colour.
  const light = Color(0xFFFFFFFF);
  const deep = Color(0xFF0B1530);
  return [
    for (var i = 0; i < n; i++)
      if (i == 0)
        base
      else if (i.isOdd)
        Color.lerp(base, light, 0.30 * ((i + 1) ~/ 2))!
      else
        Color.lerp(base, deep, 0.28 * (i ~/ 2))!,
  ];
}
