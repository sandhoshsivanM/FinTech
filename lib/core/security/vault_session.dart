import 'dart:typed_data';

/// An unlocked vault: its id and the in-memory derived encryption key.
///
/// The key lives only for the lifetime of the session and is handed to the
/// SQLCipher database open (PRD §2 biometric-linked key).
class VaultSession {
  const VaultSession({required this.vaultId, required this.key});

  final String vaultId;
  final Uint8List key;
}
