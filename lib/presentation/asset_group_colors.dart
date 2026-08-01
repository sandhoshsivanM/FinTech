import 'package:flutter/material.dart';

import '../core/theme/app_tokens.dart';
import '../domain/entities/asset_group.dart';

/// Validated categorical palette for the seven chart groups.
///
/// Hues and steps come from the data-viz reference palette and were checked with
/// its validator against this app's chart surface: on the fixed
/// [kAssetGroupOrder] adjacency the set clears every gate (worst adjacent CVD
/// ΔE 9.1 protan, worst normal-vision ΔE 19.6).
///
/// Two rules come with it:
///   1. Render groups in [kAssetGroupOrder]. Re-ordered freely — for instance by
///      sorting slices largest-first — the worst pair collapses to ΔE 3.2 under
///      protanopia and the palette no longer separates.
///   2. Always ship the legend or direct labels. Three of these steps sit below
///      3:1 contrast on the light surface, so the labels are what stop identity
///      resting on colour alone.
Color groupColor(AssetGroup g) => switch (g) {
      AssetGroup.equity => const Color(0xFF2A78D6),
      AssetGroup.debt => const Color(0xFFEB6834),
      AssetGroup.gold => const Color(0xFF1BAF7A),
      AssetGroup.realEstate => const Color(0xFFEDA100),
      AssetGroup.retirement => const Color(0xFFE87BA4),
      AssetGroup.crypto => const Color(0xFF008300),
      AssetGroup.cash => const Color(0xFF4A3AA7),
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
  final base = groupColor(g);
  final toward = dark ? AppColors.darkSurface : AppColors.lightSurface;
  final n = count.clamp(1, kMaxGroupShades);
  return [
    for (var i = 0; i < n; i++)
      i == 0 ? base : Color.lerp(base, toward, 0.14 * i)!,
  ];
}
