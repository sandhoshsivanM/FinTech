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
/// Asset-group colours. Mirrors `ASSET_GROUP_META` on web exactly.
///
/// Two slots are pinned for MEANING, not for position:
///   * gold   -> the gold hue. A slice labelled "Gold" that renders blue (or,
///              as the web previously had it, green) reads as a bug to anyone
///              looking at the legend.
///   * equity -> the emerald. It is the brand-leading colour and almost always
///              the largest slice.
///
/// The remaining five were then SEARCHED rather than chosen, over every
/// assignment, scoring the pairs that actually sit next to each other in
/// `AssetGroup.values` draw order. The winner clears all six dataviz checks in
/// both themes: worst adjacent pair ΔE 12.7 under deuteranopia (target 8) and a
/// normal-vision floor of 21.7.
///
/// Changing one entry re-orders the adjacencies and invalidates that result, so
/// re-run the validator if you touch this.
Color groupColor(AssetGroup g) => switch (g) {
      AssetGroup.equity => const Color(0xFF189E6E),
      AssetGroup.debt => const Color(0xFF8E7CC3),
      AssetGroup.gold => const Color(0xFFBE8420),
      AssetGroup.realEstate => const Color(0xFF2E92C4),
      AssetGroup.retirement => const Color(0xFFCC6435),
      AssetGroup.crypto => const Color(0xFF4F7CFF),
      AssetGroup.cash => const Color(0xFFC9538A),
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
