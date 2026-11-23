import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/features/capture/providers/capture_settings.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// "How far back to read SMS": 1 day unless the user picks more. A fixed 90
/// days queued hundreds of captures for review in one tap.
void main() {
  Future<int> settled(ProviderContainer c) async {
    c.read(captureSmsHistoryDaysProvider);
    await Future<void>.delayed(Duration.zero);
    return c.read(captureSmsHistoryDaysProvider);
  }

  test('defaults to one day', () async {
    SharedPreferences.setMockInitialValues({});
    final c = ProviderContainer();
    addTearDown(c.dispose);
    expect(await settled(c), 1);
  });

  test('a chosen window is remembered', () async {
    SharedPreferences.setMockInitialValues({});
    final c = ProviderContainer();
    addTearDown(c.dispose);
    await c.read(captureSmsHistoryDaysProvider.notifier).set(30);
    final again = ProviderContainer();
    addTearDown(again.dispose);
    expect(await settled(again), 30);
  });

  test('a nonsense saved value falls back to one day', () async {
    SharedPreferences.setMockInitialValues({'capture_sms_history_days_v1': 0});
    final c = ProviderContainer();
    addTearDown(c.dispose);
    expect(await settled(c), 1);
  });

  test('labels read naturally', () {
    expect(smsHistoryLabel(1), '1 day');
    expect(smsHistoryLabel(7), '7 days');
    expect(smsHistoryDayOptions, [1, 2, 7, 30, 90]);
  });
}
