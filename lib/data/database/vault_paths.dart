import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// The vault database's file name. FROZEN: it is how an installed app finds
/// its user's data. Renaming it orphans every existing vault, exactly as the
/// bundle-ID change in ce8cf61 did.
String vaultDbFileName(String vaultId) => 'vault_$vaultId.db';

/// Resolves the on-disk path for a vault file. On web there is no filesystem
/// (the executor is in-memory), so the path is just a logical name and
/// path_provider — which has no web implementation — is not called.
Future<String> vaultFilePath(String fileName) async {
  if (kIsWeb) return fileName;
  final dir = await getApplicationDocumentsDirectory();
  return p.join(dir.path, fileName);
}
