import 'dart:io';
import 'dart:typed_data';

import '../../core/security/vault_file_probe.dart';
import 'encrypted_executor.dart';
import 'vault_paths.dart';

VaultFileProbe createVaultFileProbe() => const FileVaultProbe();

/// Native: inspects `vault_<id>.db` in the documents directory.
class FileVaultProbe implements VaultFileProbe {
  const FileVaultProbe();

  Future<File> _file(String vaultId) async =>
      File(await vaultFilePath(vaultDbFileName(vaultId)));

  @override
  Future<bool> hasData(String vaultId) async {
    final f = await _file(vaultId);
    return await f.exists() && await f.length() > 0;
  }

  @override
  Future<bool> opensWith(String vaultId, Uint8List key) async {
    final f = await _file(vaultId);
    if (!await f.exists()) return false;
    return keyOpensDatabase(key, f.path);
  }

  @override
  Future<String?> setAside(String vaultId) async {
    final f = await _file(vaultId);
    if (!await f.exists()) return null;
    final stamp = DateTime.now().millisecondsSinceEpoch;
    // The logs database is encrypted with the same key, so it goes too —
    // otherwise the new vault would fail to open it.
    final logs = File(await vaultFilePath('logs_$vaultId.db'));
    if (await logs.exists()) await logs.rename('${logs.path}.set-aside-$stamp');
    final moved = await f.rename('${f.path}.set-aside-$stamp');
    return moved.path;
  }
}
