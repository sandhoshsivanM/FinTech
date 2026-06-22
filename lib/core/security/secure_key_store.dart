import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'key_derivation_service.dart';

/// Stores per-vault secrets in the OS keychain / Keystore (PRD §14):
/// a 32-byte random salt per vault. The PIN and derived key are NEVER persisted.
///
/// iOS: `first_unlock_this_device` so vault secrets do not sync to iCloud.
class SecureKeyStore {
  SecureKeyStore([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock_this_device,
              ),
            );

  final FlutterSecureStorage _storage;

  static const _saltPrefix = 'vault_salt_';
  static const _existsPrefix = 'vault_exists_';
  static const _keyPrefix = 'vault_key_';

  String _saltKey(String vaultId) => '$_saltPrefix$vaultId';
  String _existsKey(String vaultId) => '$_existsPrefix$vaultId';
  String _keyKey(String vaultId) => '$_keyPrefix$vaultId';

  /// True once a vault has completed setup (so the app shows unlock vs. setup).
  Future<bool> vaultExists(String vaultId) async {
    return (await _storage.read(key: _existsKey(vaultId))) == '1';
  }

  /// Creates and stores a fresh random salt for a new vault.
  Future<Uint8List> createSalt(String vaultId) async {
    final salt = _randomBytes(KeyDerivationService.saltLengthBytes);
    await _storage.write(
      key: _saltKey(vaultId),
      value: KeyDerivationService.toHex(salt),
    );
    await _storage.write(key: _existsKey(vaultId), value: '1');
    return salt;
  }

  /// Reads the stored salt for an existing vault, or null if none.
  Future<Uint8List?> readSalt(String vaultId) async {
    final hex = await _storage.read(key: _saltKey(vaultId));
    if (hex == null) return null;
    return _fromHex(hex);
  }

  /// Persists the derived 32-byte key in the hardware-backed keychain so a
  /// later biometric unlock can retrieve it without re-entering the PIN.
  /// The PIN itself is never stored.
  Future<void> storeDerivedKey(String vaultId, Uint8List key) async {
    await _storage.write(
      key: _keyKey(vaultId),
      value: KeyDerivationService.toHex(key),
    );
  }

  /// Reads the stored derived key (used for biometric unlock). Null if absent.
  Future<Uint8List?> readDerivedKey(String vaultId) async {
    final hex = await _storage.read(key: _keyKey(vaultId));
    if (hex == null) return null;
    return _fromHex(hex);
  }

  Future<void> deleteVault(String vaultId) async {
    await _storage.delete(key: _saltKey(vaultId));
    await _storage.delete(key: _existsKey(vaultId));
    await _storage.delete(key: _keyKey(vaultId));
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
