import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../data/entitlement/license_key_entitlement_source.dart';
import '../../data/entitlement/store_entitlement_source.dart';
import '../../domain/entitlement/entitlement.dart';
import '../../domain/entitlement/entitlement_source.dart';
import '../../domain/entitlement/feature_gate.dart';
import '../../domain/entitlement/pro_feature.dart';
import 'distribution_channel.dart';
import 'entitlement_cache.dart';
import 'entitlement_notifier.dart';

/// SharedPreferences, resolved once.
final sharedPreferencesProvider = FutureProvider<SharedPreferences>(
  (ref) => SharedPreferences.getInstance(),
);

final entitlementCacheProvider = Provider<PrefsEntitlementCache>((ref) {
  final prefs = ref.watch(sharedPreferencesProvider).requireValue;
  return PrefsEntitlementCache(prefs);
});

/// The adapter for this build's distribution channel.
///
/// Chosen at compile time. The App Store build never constructs a licence-key
/// source, and the direct build never constructs a store one — see
/// [distribution_channel.dart] for why that is structural rather than an `if`.
final entitlementSourceProvider = Provider<EntitlementSource>((ref) {
  final source = switch (kChannel) {
    Channel.appStore || Channel.play => StoreEntitlementSource(),
    Channel.direct =>
      LicenseKeyEntitlementSource(ref.watch(entitlementCacheProvider)),
  };
  ref.onDispose(source.dispose);
  return source;
});

/// The licence source, when this build has one. Null in store builds.
///
/// Used by the Pro screen to activate a pasted key. Typed as nullable so a
/// store build cannot reach the activation path even by mistake.
final licenseSourceProvider = Provider<LicenseKeyEntitlementSource?>((ref) {
  final source = ref.watch(entitlementSourceProvider);
  return source is LicenseKeyEntitlementSource ? source : null;
});

/// The live entitlement.
///
/// A [StateNotifierProvider] to match `vaultUnlockProvider` — the shell and the
/// router already know how to watch that shape.
final entitlementProvider =
    StateNotifierProvider<EntitlementNotifier, Entitlement>((ref) {
  // Compile-time developer unlock. Recorded honestly as devOverride so a
  // screenshot taken with it on is identifiable as such.
  if (kProOverride) {
    return EntitlementNotifier(
      source: _NullSource(),
      cache: MemoryEntitlementCache(
        const Entitlement(isPro: true, source: ProSource.devOverride),
      ),
    );
  }

  final notifier = EntitlementNotifier(
    source: ref.watch(entitlementSourceProvider),
    cache: ref.watch(entitlementCacheProvider),
  );
  // Background reconciliation; never awaited, so it cannot delay first paint.
  notifier.start();
  return notifier;
});

/// The one-line question most widgets actually ask.
final isProProvider = Provider<bool>((ref) => ref.watch(entitlementProvider).isPro);

/// Gate decision for a single feature.
///
/// `ref.watch(gateProvider(ProFeature.taxCentre))` — the family key is an enum,
/// so a typo is a compile error rather than a silently-unlocked Pro feature.
final gateProvider = Provider.family<GateDecision, ProFeature>(
  (ref, feature) => gateFor(feature, ref.watch(entitlementProvider)),
);

/// The store's localised price string, e.g. "₹999". Null until the store
/// answers, or always on a direct build — the paywall falls back to the
/// configured price rather than showing a wrong one.
final proPriceProvider = FutureProvider<String?>(
  (ref) => ref.watch(entitlementSourceProvider).displayPrice(),
);

/// A source that does nothing, for the dev-override path.
class _NullSource implements EntitlementSource {
  @override
  Stream<Entitlement> changes() => const Stream.empty();
  @override
  Future<RestoreOutcome> restore() async =>
      const RestoreUnavailable('Developer override.');
  @override
  Future<PurchaseOutcome> purchase() async =>
      const PurchaseFailed('Developer override.');
  @override
  Future<String?> displayPrice() async => null;
  @override
  Future<void> complete(Entitlement entitlement) async {}
  @override
  Future<void> dispose() async {}
}
