// The Zentra tokens the cards screen uses, mirrored from
// packages/domain-ts/tokens.css (light and dark). Only these; no new colours.
import 'package:flutter/material.dart';

import 'card_maths.dart';

class CardPalette {
  const CardPalette._(
    this.card,
    this.tray,
    this.line,
    this.ink,
    this.muted,
    this.income,
    this.expense,
    this.warn,
    this.accentOn,
  );
  final Color card, tray, line, ink, muted, income, expense, warn, accentOn;

  static const light = CardPalette._(
    Color(0xFFF8F8F8),
    Color(0xFFECECEE),
    Color(0xFFE6E6E8),
    Color(0xFF111214),
    Color(0xFF6E6E73),
    Color(0xFF0BA722),
    Color(0xFFE5197A),
    Color(0xFFB86E00),
    Color(0xFFFFFFFF),
  );
  static const dark = CardPalette._(
    Color(0xFF1C1C20),
    Color(0xFF17171A),
    Color(0xFF26262B),
    Color(0xFFF5F5F7),
    Color(0xFF8E8E93),
    Color(0xFF34C759),
    Color(0xFFFF4F9A),
    Color(0xFFFFB340),
    Color(0xFF111214),
  );

  static CardPalette of(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? dark : light;

  /// Card faces cycle through brand plate, ink surface and gold ink; the chip is gold.
  static const faces = [
    Color(0xFF0D3D2B),
    Color(0xFF111214),
    Color(0xFF8E641B),
  ];
  static const gold = Color(0xFFC99A3D);

  Color tone(Tone t) => switch (t) {
    Tone.ok => income,
    Tone.warn => warn,
    Tone.bad => expense,
    Tone.quiet => muted,
  };
}
