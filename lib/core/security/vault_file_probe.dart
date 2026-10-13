import 'dart:typed_data';

/// Looks at a vault's database FILE, independently of the salt and verifier in
/// preferences.
///
/// Exists because preferences are not proof that a vault is absent. Commit
/// 2e10543 moved the salt and verifier from the keychain into preferences
/// without migrating them, so every updated install found empty preferences,
/// concluded it was a first run, and offered setup — and setup wrote a new salt
/// over a database that was still sitting on disk, full, and now permanently
/// undecryptable. The file is the ground truth; this is how the vault asks it.
abstract class VaultFileProbe {
  /// Whether an encrypted database for [vaultId] exists and is non-empty.
  Future<bool> hasData(String vaultId);

  /// Whether [key] decrypts that database. Opens it read-only: the file is
  /// never modified, whatever the answer.
  Future<bool> opensWith(String vaultId, Uint8List key);

  /// Moves the database aside (renamed, NOT deleted) so a new vault can be
  /// created without destroying the old one. Returns the new path.
  Future<String?> setAside(String vaultId);
}

/// For platforms with no vault file (and for tests that do not care): nothing
/// is ever found, so behaviour is exactly what it was before the probe existed.
class NoVaultFileProbe implements VaultFileProbe {
  const NoVaultFileProbe();
  @override
  Future<bool> hasData(String vaultId) async => false;
  @override
  Future<bool> opensWith(String vaultId, Uint8List key) async => false;
  @override
  Future<String?> setAside(String vaultId) async => null;
}
