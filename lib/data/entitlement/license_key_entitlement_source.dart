import 'dart:async';

import '../../core/entitlement/entitlement_cache.dart';
import '../../core/entitlement/license_public_key.dart';
import '../../domain/entitlement/entitlement.dart';
import '../../domain/entitlement/entitlement_source.dart';
import '../../domain/entitlement/license_key.dart';

/// Entitlement from an Ed25519-signed licence key, for builds with no app
/// store: the notarized DMG, the Tauri desktop app, Linux, Windows.
///
/// Makes no network calls, ever — not to verify, not to activate, not to
/// "check in". Verification is a signature check against a key compiled into
/// the binary, so Pro works offline and we never learn that this person exists.
class LicenseKeyEntitlementSource implements EntitlementSource {
  LicenseKeyEntitlementSource(this._cache);

  final PrefsEntitlementCache _cache;
  final _controller = StreamController<Entitlement>.broadcast();

  @override
  Stream<Entitlement> changes() => _controller.stream;

  /// Re-verifies the stored key rather than trusting the cached boolean.
  ///
  /// This is why the raw key is kept alongside the entitlement: the cache is a
  /// convenience for the first frame, and the signature is the actual truth.
  @override
  Future<RestoreOutcome> restore() async {
    final stored = _cache.readLicenseKey();
    if (stored == null) return const RestoreAbsent();

    if (kLicensePublicKeyIsPlaceholder) {
      // No real public key compiled in yet. Refusing a genuine key would be a
      // lie, so report that we could not check rather than that it is invalid.
      return const RestoreUnavailable('No licence public key in this build.');
    }

    final check = await LicenseKey.verify(stored, kLicensePublicKey);
    if (!check.isValid) return const RestoreAbsent();

    return RestoreFound(Entitlement(
      isPro: true,
      source: ProSource.licenseKey,
      grantedAt: check.issuedAt,
      orderRef: check.orderRef,
    ));
  }

  /// Applies a key the user just typed or pasted.
  ///
  /// Returns the verdict so the UI can say *why* a key was refused —
  /// "that looks like a key for a different product" and "we could not verify
  /// that key" send the user to very different next steps.
  Future<LicenseCheck> activate(String raw) async {
    if (kLicensePublicKeyIsPlaceholder) {
      return const LicenseCheck(LicenseVerdict.badSignature);
    }
    final check = await LicenseKey.verify(raw, kLicensePublicKey);
    if (!check.isValid) return check;

    _cache.writeLicenseKey(raw.trim());
    _controller.add(Entitlement(
      isPro: true,
      source: ProSource.licenseKey,
      grantedAt: check.issuedAt,
      orderRef: check.orderRef,
    ));
    return check;
  }

  /// There is no in-app purchase on this channel — buying happens at the
  /// merchant's hosted checkout, in a browser, and comes back as a key.
  @override
  Future<PurchaseOutcome> purchase() async =>
      const PurchaseFailed('Purchases on this build are made on the website.');

  /// No store to ask, so no localised price. The paywall shows the configured
  /// price rather than inventing one.
  @override
  Future<String?> displayPrice() async => null;

  /// Nothing to acknowledge — a signature is self-contained.
  @override
  Future<void> complete(Entitlement entitlement) async {}

  @override
  Future<void> dispose() async => _controller.close();
}
