import 'package:flutter/material.dart';

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
