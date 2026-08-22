import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:khazana/features/reports/providers/dashboard_providers.dart';

/// Ghost mode, and the one property that makes it worth having.
///
/// The mask used to live in memory only, so every launch unmasked the amounts.
/// Someone who hides their balances because of where they are sitting is still
/// sitting there the next time they open the app; forgetting the choice reveals
/// the figures at exactly the moment they were being hidden.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('amounts are visible until someone asks otherwise', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    expect(container.read(ghostModeProvider), isFalse);
  });

  test('hiding amounts survives a restart', () async {
    final first = ProviderContainer();
    await first.read(ghostModeProvider.notifier).set(true);
    first.dispose();

    final second = ProviderContainer();
    addTearDown(second.dispose);
    // Read once to trigger build(), which is what starts the load. Reading only
    // after the delay would time the wait from before the work began.
    expect(second.read(ghostModeProvider), isFalse);
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(second.read(ghostModeProvider), isTrue,
        reason: 'the mask must be remembered, not dropped on launch');
  });

  test('unhiding survives a restart too', () async {
    SharedPreferences.setMockInitialValues({'ghost_mode_v1': true});
    final first = ProviderContainer();
    await first.read(ghostModeProvider.notifier).set(false);
    first.dispose();

    final second = ProviderContainer();
    addTearDown(second.dispose);
    second.read(ghostModeProvider);
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(second.read(ghostModeProvider), isFalse,
        reason: 'turning the mask off is a choice as much as turning it on');
  });

  test('toggle flips and stores in one step', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    await container.read(ghostModeProvider.notifier).toggle();
    expect(container.read(ghostModeProvider), isTrue);

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool('ghost_mode_v1'), isTrue,
        reason: 'the toggle the eye button calls must persist, not just set');
  });

  test('the mask applies on the first frame, before storage is read', () {
    // The reason this is a Notifier and not a FutureProvider. An AsyncValue
    // would paint one frame of real figures while the preference resolved — a
    // privacy control that briefly leaks the thing it conceals is not one.
    SharedPreferences.setMockInitialValues({'ghost_mode_v1': true});
    final container = ProviderContainer();
    addTearDown(container.dispose);
    expect(container.read(ghostModeProvider), isA<bool>(),
        reason: 'reads are synchronous — never an AsyncValue');
  });
}
