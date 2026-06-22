import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _storage = FlutterSecureStorage(
  iOptions: IOSOptions(
    accessibility: KeychainAccessibility.first_unlock_this_device,
  ),
);
const _key = 'onboarding_seen_v1';

/// Whether the first-run onboarding has been dismissed (PRD Phase 4 onboarding).
final onboardingSeenProvider = FutureProvider<bool>((ref) async {
  return (await _storage.read(key: _key)) == '1';
});

final onboardingActionsProvider =
    Provider<OnboardingActions>((ref) => OnboardingActions(ref));

class OnboardingActions {
  OnboardingActions(this._ref);
  final Ref _ref;
  Future<void> markSeen() async {
    await _storage.write(key: _key, value: '1');
    _ref.invalidate(onboardingSeenProvider);
  }
}
