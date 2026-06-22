import 'package:drift/drift.dart';

import 'vault_executor_io.dart'
    if (dart.library.js_interop) 'vault_executor_web.dart' as impl;

/// Opens the vault's database executor for the current platform:
/// native → AES-256 SQLCipher (FFI); web → sqlite3.wasm (PRD §2).
QueryExecutor openVaultExecutor(Uint8List key, String path) =>
    impl.openVaultExecutor(key, path);
