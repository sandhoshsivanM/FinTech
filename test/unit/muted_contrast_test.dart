import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/core/theme/app_theme.dart';
import 'package:khazana/features/home/home_palette.dart';

double _contrast(Color a, Color b) {
  double lum(Color c) {
    double ch(double v) => v <= 0.03928
        ? v / 12.92
        : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }

  final l1 = lum(a), l2 = lum(b);
  return (math.max(l1, l2) + 0.05) / (math.min(l1, l2) + 0.05);
}

void main() {
  test('light muted text clears 4.5:1 on card and sheet', () {
    const p = HomePalette.light;
    expect(p.muted, const Color(0xFF6E6E73));
    expect(_contrast(p.muted, p.group), greaterThanOrEqualTo(4.5));
    expect(_contrast(p.muted, p.sheet), greaterThanOrEqualTo(4.5));
  });

  test('dark muted text clears 4.5:1 on card and sheet', () {
    const p = HomePalette.dark;
    expect(
      _contrast(p.muted, const Color(0xFF1C1C20)),
      greaterThanOrEqualTo(4.5),
    );
    expect(
      _contrast(p.muted, const Color(0xFF0E0E10)),
      greaterThanOrEqualTo(4.5),
    );
  });

  test('the accent is the Zentra pill in both themes', () {
    expect(HomePalette.light.pill, const Color(0xFF111214));
    expect(HomePalette.dark.pill, const Color(0xFFF5F5F7));
    expect(AppTheme.light.colorScheme.primary, const Color(0xFF111214));
    expect(AppTheme.dark.colorScheme.primary, const Color(0xFFF5F5F7));
  });
}
