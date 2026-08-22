import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../domain/entitlement/entitlement.dart';

/// Where the entitlement lives between launches.
///
/// **`SharedPreferences`, deliberately not the vault database and not the
/// keychain.** Three reasons, each of which has bitten a design that chose
/// otherwise:
///
///  1. It must survive "Erase all data". The entitlement is a record of a
///     purchase, not financial data. Storing it in the vault would mean wiping
///     your transactions also revoked something you paid for, which is
///     indefensible.
///  2. It must be readable *before* unlock. The app boots to `/unlock`, and the
///     paywall, the Settings row and the restore button all have to know the
///     state before any key exists.
///  3. The keychain would be worse, for the reason already written down in
///     `lib/core/security/vault_credential_store.dart`: on macOS each keychain
///     item is bound to the code signature, so every rebuild prompts for the
///     login password. A purchase receipt is not worth that.
///
/// A plaintext boolean someone could flip is not a threat worth designing
/// against — anyone able to edit preferences could equally paste a leaked
/// licence key. What matters is that the cache is not the *trust anchor*: the
/// artefact (store receipt, signed key) is re-verified on launch, and the cache
/// only decides what to show in the meantime.
abstract interface class EntitlementCache {
  Entitlement read();
  void write(Entitlement entitlement);
  void clear();
}

class PrefsEntitlementCache implements EntitlementCache {
  PrefsEntitlementCache(this._prefs);

  final SharedPreferences _prefs;

  static const String entitlementKey = 'khazana_entitlement_v1';
  static const String licenseKeyKey = 'khazana_license_v1';

  @override
  Entitlement read() {
    final raw = _prefs.getString(entitlementKey);
    if (raw == null) return Entitlement.free;
    try {
      return Entitlement.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      // A cache written by a newer build, or half-written by a crash. Degrade
      // to Free rather than throwing — this runs before the first frame, and
      // an exception here is a launch failure, not a billing bug.
      return Entitlement.free;
    }
  }

  @override
  void write(Entitlement entitlement) {
    _prefs.setString(entitlementKey, jsonEncode(entitlement.toJson()));
  }

  @override
  void clear() {
    _prefs.remove(entitlementKey);
    _prefs.remove(licenseKeyKey);
  }

  /// The raw licence key, kept so it can be re-verified on every launch rather
  /// than trusting the cached boolean.
  String? readLicenseKey() => _prefs.getString(licenseKeyKey);

  void writeLicenseKey(String key) => _prefs.setString(licenseKeyKey, key);
}

/// In-memory cache for tests and for the brief window before SharedPreferences
/// has loaded.
class MemoryEntitlementCache implements EntitlementCache {
  MemoryEntitlementCache([this._value = Entitlement.free]);

  Entitlement _value;

  @override
  Entitlement read() => _value;

  @override
  void write(Entitlement entitlement) => _value = entitlement;

  @override
  void clear() => _value = Entitlement.free;
}
