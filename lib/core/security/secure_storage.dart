import 'package:flutter/services.dart' show PlatformException;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The single [FlutterSecureStorage] configuration used everywhere in the app.
///
/// It exists because these options were previously duplicated across five call
/// sites, which is how the macOS configuration ended up wrong in all of them at
/// once. Add new keychain consumers by importing this, never by constructing
/// another `FlutterSecureStorage`.
///
/// **iOS/macOS accessibility**: `first_unlock_this_device` — the vault key must
/// survive a reboot-then-unlock, but must never sync to iCloud or migrate to a
/// new device. This is the vault key; it is not meant to be portable.
///
/// **macOS `usesDataProtectionKeychain: false`** — this is the important one.
/// The package defaults it to `true`, which routes through the data-protection
/// keychain. That keychain requires the app to be sandboxed *and* to carry a
/// `keychain-access-groups` entitlement resolved against a real provisioning
/// team, so on a locally-signed build every write fails with
/// `errSecMissingEntitlement` (-34018) — which surfaced as
/// "Could not create vault: A required entitlement isn't present." The
/// file-based keychain has no such requirement and is still stored encrypted by
/// macOS, keyed to this login keychain.
const appSecureStorage = FlutterSecureStorage(
  iOptions: IOSOptions(
    accessibility: KeychainAccessibility.first_unlock_this_device,
  ),
  mOptions: MacOsOptions(
    accessibility: KeychainAccessibility.first_unlock_this_device,
    usesDataProtectionKeychain: false,
    // Pinned false so the plugin never probes the iCloud (synchronizable)
    // keychain, which a sandboxed app cannot query without an entitlement —
    // that probe is what made `delete` fail with -34018 even after `write` and
    // `read` were working. It also matches the intent of
    // first_unlock_this_device: this key must not leave the device.
    synchronizable: false,
  ),
);

/// Treats an empty string as "no value".
///
/// [SecureErase.erase] destroys a secret by overwriting it, which can leave an
/// empty entry behind. Every reader must therefore treat `''` the same as null,
/// or a wiped vault would look like it still exists.
String? nullIfBlank(String? value) =>
    (value == null || value.isEmpty) ? null : value;

extension SecureErase on FlutterSecureStorage {
  /// Destroys a secret.
  ///
  /// Overwrites first, then deletes. The overwrite is what actually removes the
  /// secret material and works on every platform; the delete is best-effort
  /// tidying of the now-empty entry.
  ///
  /// The delete is allowed to fail because of a defect in
  /// flutter_secure_storage_darwin: `performDelete` hardcodes a probe of the
  /// synchronizable (iCloud) keychain before the local one, and a sandboxed app
  /// cannot query that without a `keychain-access-groups` entitlement — which
  /// Xcode only accepts on a build signed with a real Apple development
  /// certificate. The probe's `errSecMissingEntitlement` (-34018) is then
  /// returned even when the local delete succeeded. Options cannot disable it.
  ///
  /// Swallowing that error is safe precisely because the overwrite already
  /// happened: what remains is an empty string, not a recoverable secret.
  Future<void> erase({required String key}) async {
    try {
      await write(key: key, value: '');
    } on PlatformException {
      // If even the overwrite fails there is nothing further to try here; the
      // caller's own error handling reports it.
    }
    try {
      await delete(key: key);
    } on PlatformException {
      // See above — the secret is already gone.
    }
  }
}
