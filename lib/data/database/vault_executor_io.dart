import 'package:drift/drift.dart';

import 'encrypted_executor.dart';

/// Native (mobile/desktop): AES-256 SQLCipher via FFI (PRD §2).
QueryExecutor openVaultExecutor(Uint8List key, String path) =>
    openEncrypted(key, path);
