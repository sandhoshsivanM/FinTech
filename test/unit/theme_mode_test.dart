import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:khazana/core/theme/app_theme.dart';
import 'package:khazana/features/settings/providers/theme_providers.dart';

/// Theme selection, and the contrast both themes have to clear.
///
/// The theme was hardcoded twice — first to light, then to dark — and a
/// hardcoded theme is a claim about someone's room made from the other side of
/// the world.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('defaults to following the OS', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    expect(container.read(themeModeProvider), ThemeMode.system);
  });

  test('a choice survives a restart', () async {
    final first = ProviderContainer();
    await first.read(themeModeProvider.notifier).set(ThemeMode.light);
    first.dispose();

    final second = ProviderContainer();
    addTearDown(second.dispose);
    // Read once to trigger build(), which is what starts the load. Reading only
    // after the delay would time the wait from before the work began.
    expect(second.read(themeModeProvider), ThemeMode.system);
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(second.read(themeModeProvider), ThemeMode.light,
        reason: 'the stored choice must arrive, not be lost');
  });

  test('an unrecognised stored value falls back instead of throwing',
      () async {
    // A preference written by a future build must not stop an older one from
    // rendering at all.
    SharedPreferences.setMockInitialValues(
        {'theme_mode_v1': 'solarized-midnight'});
    final container = ProviderContainer();
    addTearDown(container.dispose);
    container.read(themeModeProvider);
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(container.read(themeModeProvider), ThemeMode.system);
  });

  group('both themes are usable, not just the one being looked at', () {
    /// WCAG relative luminance.
    double luminance(Color c) => c.computeLuminance();

    double contrast(Color a, Color b) {
      final l1 = luminance(a), l2 = luminance(b);
      final hi = l1 > l2 ? l1 : l2;
      final lo = l1 > l2 ? l2 : l1;
      return (hi + 0.05) / (lo + 0.05);
    }

    for (final (name, theme) in [
      ('light', AppTheme.light),
      ('dark', AppTheme.dark),
    ]) {
      test('$name: body text on a card clears 4.5:1', () {
        final s = theme.colorScheme;
        expect(contrast(s.onSurface, s.surface), greaterThanOrEqualTo(4.5),
            reason: 'primary text must be readable in $name');
      });

      test('$name: muted text on a card clears 4.5:1', () {
        // Muted text carries dates, sources and units — the parts a person
        // checks when a number looks wrong. It is not decoration and does not
        // get the relaxed 3:1 large-text allowance.
        final s = theme.colorScheme;
        expect(
            contrast(s.onSurfaceVariant, s.surface), greaterThanOrEqualTo(4.5),
            reason: 'secondary text must be readable in $name');
      });

      test('$name: a card is distinguishable from the page behind it', () {
        // Cards used to sit four points from the canvas, below the threshold
        // at which an edge is visible, so every card depended on its border to
        // exist at all.
        final s = theme.colorScheme;
        final canvas = name == 'dark'
            ? const Color(0xFF080B14)
            : const Color(0xFFF1F4F9);
        expect((luminance(s.surface) - luminance(canvas)).abs(),
            greaterThan(0.008),
            reason: 'the surface and the canvas must differ in $name');
      });
    }
  });

  test('both themes use tabular figures', () {
    // The single largest difference between a screen that looks like a finance
    // product and one that does not. Losing it in one theme would make that
    // theme silently worse in a way nobody would name.
    for (final theme in [AppTheme.light, AppTheme.dark]) {
      final features = theme.textTheme.bodyMedium?.fontFeatures ?? const [];
      expect(features.map((f) => f.feature), contains('tnum'));
    }
  });
}
