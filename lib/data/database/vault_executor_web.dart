import 'package:drift/drift.dart';

/// The Flutter **web** target is not supported, and this file exists only to
/// keep the conditional import in `encrypted_executor.dart` resolvable.
///
/// It used to return `WasmDatabase.inMemory(sqlite3)`: the encryption key was
/// ignored, nothing was written anywhere, and **every record was lost on
/// refresh** — while the README advertised Web as a supported platform. A
/// finance vault that silently forgets everything when the tab reloads is worse
/// than no web build at all.
///
/// The honest fix is not encrypted IndexedDB persistence for Flutter. The
/// Next.js app in `webapp/` already *is* the web client: it has real encrypted
/// persistence (Dexie + WebCrypto AES-256-GCM), a service worker, and more
/// screens than this target ever had. Building a second, weaker web client to
/// sit beside it would be work spent competing with ourselves.
///
/// `flutter build web` therefore fails loudly here rather than producing an
/// installable data-loss machine.
QueryExecutor openVaultExecutor(Uint8List key, String path) {
  throw UnsupportedError(
    'Khazana does not ship a Flutter web build. The web client is the Next.js '
    'app in webapp/, which persists an encrypted vault to IndexedDB. '
    'See docs/ARCHITECTURE.md.',
  );
}
