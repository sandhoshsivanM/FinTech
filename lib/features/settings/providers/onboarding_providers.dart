import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// First-run UI flags: whether the welcome banner and the guided tour have been
/// seen.
///
/// These live in preferences, not the keychain. They used to be keychain
/// entries, which meant the Dashboard — the first screen after unlock, opened
/// every single time — triggered an OS keychain access prompt purely to find
/// out whether to show a banner.
///
/// Nothing here is a secret. "Has this person seen the tour" is not worth a
/// password dialog, and putting it behind one taught users to click through
/// prompts without reading them, which is the opposite of what a security
/// prompt is for.
const _key = 'onboarding_seen_v1';
const _tourKey = 'tour_seen_v1';

Future<bool> _flag(String key) async =>
    (await SharedPreferences.getInstance()).getBool(key) ?? false;

Future<void> _setFlag(String key, bool value) async =>
    (await SharedPreferences.getInstance()).setBool(key, value);

/// Whether the first-run onboarding has been dismissed (PRD Phase 4 onboarding).
final onboardingSeenProvider = FutureProvider<bool>((ref) => _flag(_key));

/// Whether the first-run guided tour (area-by-area walkthrough) has been seen.
final tourSeenProvider = FutureProvider<bool>((ref) => _flag(_tourKey));

final onboardingActionsProvider =
    Provider<OnboardingActions>((ref) => OnboardingActions(ref));

class OnboardingActions {
  OnboardingActions(this._ref);
  final Ref _ref;

  Future<void> markSeen() async {
    await _setFlag(_key, true);
    _ref.invalidate(onboardingSeenProvider);
  }

  Future<void> markTourSeen() async {
    await _setFlag(_tourKey, true);
    _ref.invalidate(tourSeenProvider);
  }

  /// Replays the tour (clears the flag so it shows again).
  Future<void> resetTour() async {
    await _setFlag(_tourKey, false);
    _ref.invalidate(tourSeenProvider);
  }
}
