import 'dart:math';
import 'dart:typed_data';

import 'package:pointycastle/export.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'key_derivation_service.dart';

/// Everything needed to unlock a vault with a PIN, none of which is a secret.
///
/// The vault key used to live in the OS keychain so a biometric unlock could
/// retrieve it. That made the keychain load-bearing for *every* launch, and on
/// macOS a keychain item is bound to the code signature that created it — so any
/// rebuild turned the app into a stranger asking for another app's secret, and
/// the user was met with a password prompt they could not get past.
///
/// This store holds only:
///
///  * the **salt** — random, per vault, and useless on its own. Salts are not
///    secret; their job is to make precomputed attacks useless, not to hide.
///  * the **verifier** — a SHA-256 hash of the derived key. Confirms a PIN is
///    correct without storing anything that can produce the key. Reversing it
///    means breaking SHA-256, and even then you would land on the derived key
///    only by first guessing the PIN through 600,000 PBKDF2 iterations.
///
/// The derived key itself is **never written here**. It is recomputed from the
/// PIN at every unlock and kept only in memory. That is strictly better than
/// what it replaces: there is now no key at rest at all in the default flow.
///
/// Biometric unlock is the one exception, and it is opt-in — see
/// `SecureKeyStore`, which is used only when the user turns it on.
class VaultCredentialStore {
  VaultCredentialStore({SharedPreferences? prefs}) : _injected = prefs;

  final SharedPreferences? _injected;

  static const _saltPrefix = 'vault_salt_';
  static const _verifierPrefix = 'vault_verifier_';
  static const _biometricPrefix = 'vault_biometric_';
  static const _deviceKeyPrefix = 'vault_device_key_';
  static const _lockDisabledPrefix = 'vault_lock_disabled_';

  /// Domain separation, so the stored hash cannot be confused with, or replayed
  /// against, any other SHA-256 the app computes over the same key.
  static const _verifierDomain = 'khazana-vault-verifier-v1';

  Future<SharedPreferences> get _prefs async =>
      _injected ?? await SharedPreferences.getInstance();

  String _saltKey(String vaultId) => '$_saltPrefix$vaultId';
  String _verifierKey(String vaultId) => '$_verifierPrefix$vaultId';
  String _biometricKey(String vaultId) => '$_biometricPrefix$vaultId';
  String _deviceKeyKey(String vaultId) => '$_deviceKeyPrefix$vaultId';
  String _lockDisabledKey(String vaultId) => '$_lockDisabledPrefix$vaultId';

  /// True once a vault has completed setup.
  ///
  /// Requires BOTH a salt and a verifier: a half-written vault (killed between
  /// the two writes) must read as "not set up" rather than as a vault whose PIN
  /// can never be verified.
  Future<bool> vaultExists(String vaultId) async {
    final p = await _prefs;
    final salt = p.getString(_saltKey(vaultId));
    final verifier = p.getString(_verifierKey(vaultId));
    return salt != null &&
        salt.isNotEmpty &&
        verifier != null &&
        verifier.isNotEmpty;
  }

  /// Creates and stores a fresh random salt.
  Future<Uint8List> createSalt(String vaultId) async {
    final salt = _randomBytes(KeyDerivationService.saltLengthBytes);
    final p = await _prefs;
    await p.setString(_saltKey(vaultId), KeyDerivationService.toHex(salt));
    return salt;
  }

  Future<Uint8List?> readSalt(String vaultId) async {
    final p = await _prefs;
    final hex = p.getString(_saltKey(vaultId));
    if (hex == null || hex.isEmpty) return null;
    return _fromHex(hex);
  }

  /// Records the verifier for [key]. Written last, so [vaultExists] only
  /// reports true once the vault is fully usable.
  Future<void> storeVerifier(String vaultId, Uint8List key) async {
    final p = await _prefs;
    await p.setString(_verifierKey(vaultId), _verifierFor(key));
  }

  /// Whether [key] is the vault's key.
  ///
  /// Compared in constant time. A timing-variable compare on a verifier leaks
  /// how many leading bytes matched, which is a real oracle even though the
  /// value is not itself secret.
  Future<bool> verify(String vaultId, Uint8List key) async {
    final p = await _prefs;
    final stored = p.getString(_verifierKey(vaultId));
    if (stored == null || stored.isEmpty) return false;
    return _constantTimeEquals(stored, _verifierFor(key));
  }

  /// Whether the user has opted into biometric unlock for this vault.
  Future<bool> biometricEnabled(String vaultId) async {
    final p = await _prefs;
    return p.getBool(_biometricKey(vaultId)) ?? false;
  }

  Future<void> setBiometricEnabled(String vaultId, bool enabled) async {
    final p = await _prefs;
    await p.setBool(_biometricKey(vaultId), enabled);
  }

  // -- Opening without a PIN ------------------------------------------------
  //
  // Everything above is built so there is NO key at rest: the key is recomputed
  // from the PIN at each unlock and held only in memory, and even a thief with
  // the disk finds nothing that decrypts the database.
  //
  // The methods below deliberately give that up. When the user turns the lock
  // off, the derived key is written here in plain preferences, beside the
  // database it opens. That is not a weakened protection, it is no protection:
  // anyone who can read the file can read the vault. It exists because a person
  // may reasonably decide that a machine only they use does not need a PIN
  // every launch, and the honest way to offer that is to say plainly what it
  // costs rather than to pretend the encryption still means something.
  //
  // Kept out of the keychain on purpose. The keychain would prompt on every
  // launch, which is the exact friction being removed.

  /// Whether this device opens the vault without asking for a PIN.
  Future<bool> lockDisabled(String vaultId) async {
    final p = await _prefs;
    return p.getBool(_lockDisabledKey(vaultId)) ?? false;
  }

  Future<void> setLockDisabled(String vaultId, bool disabled) async {
    final p = await _prefs;
    await p.setBool(_lockDisabledKey(vaultId), disabled);
  }

  /// The stored key, or null when the lock is on.
  Future<Uint8List?> readDeviceKey(String vaultId) async {
    final p = await _prefs;
    final hex = p.getString(_deviceKeyKey(vaultId));
    if (hex == null || hex.isEmpty) return null;
    return _fromHex(hex);
  }

  Future<void> storeDeviceKey(String vaultId, Uint8List key) async {
    final p = await _prefs;
    await p.setString(_deviceKeyKey(vaultId), KeyDerivationService.toHex(key));
  }

  Future<void> clearDeviceKey(String vaultId) async {
    final p = await _prefs;
    await p.remove(_deviceKeyKey(vaultId));
  }

  Future<void> deleteVault(String vaultId) async {
    final p = await _prefs;
    await p.remove(_saltKey(vaultId));
    await p.remove(_verifierKey(vaultId));
    await p.remove(_biometricKey(vaultId));
    await p.remove(_deviceKeyKey(vaultId));
    await p.remove(_lockDisabledKey(vaultId));
  }

  static String _verifierFor(Uint8List key) {
    final digest = SHA256Digest();
    final domain = Uint8List.fromList(_verifierDomain.codeUnits);
    digest.update(domain, 0, domain.length);
    digest.update(key, 0, key.length);
    final out = Uint8List(digest.digestSize);
    digest.doFinal(out, 0);
    return KeyDerivationService.toHex(out);
  }

  static bool _constantTimeEquals(String a, String b) {
    if (a.length != b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a.codeUnitAt(i) ^ b.codeUnitAt(i);
    }
    return diff == 0;
  }

  static Uint8List _randomBytes(int n) {
    final rnd = Random.secure();
    return Uint8List.fromList(List.generate(n, (_) => rnd.nextInt(256)));
  }

  static Uint8List _fromHex(String hex) {
    final out = Uint8List(hex.length ~/ 2);
    for (var i = 0; i < out.length; i++) {
      out[i] = int.parse(hex.substring(i * 2, i * 2 + 2), radix: 16);
    }
    return out;
  }
}
