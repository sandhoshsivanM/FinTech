/// Single source of truth for the product name and brand-derived strings.
///
/// The name used to be hardcoded in ~45 places, which is how a previous rebrand
/// pass left `fintech_os` leaking into the web title, the macOS product name and
/// the iOS CFBundleName. Anything user-visible that names the product should
/// read from here.
///
/// Deliberately NOT here (they are frozen on-disk/crypto contracts, not brand):
///   * the backup magic `0x46544F53` ("FTOS") in `features/import/backup_service.dart`
///   * the `khazana/capture` platform channel names (must match the Kotlin side)
///   * vault/log database filenames (already brand-free: `vault_<id>.db`)
library;

/// Product name, as shown to users.
const kAppName = 'Khazana';

/// Marketing version, as shown to users and stamped into backups and logs.
///
/// Must match `version:` in pubspec.yaml, `webapp/package.json`,
/// `webapp/src-tauri/tauri.conf.json` and `APP_VERSION` in
/// `webapp/src/lib/store.ts`. Those five drifted to 1.0.0 / 0.1.0 / 0.1.0 /
/// 1.0.0 once already, and because the GitHub release workflow reads the Tauri
/// value, a `v1.0.0` tag would have published a release named "Khazana 0.1.0"
/// containing backups stamped 1.0.0. `tool/check_versions.sh` asserts they
/// agree, and CI runs it.
const kAppVersion = '1.0.0';

/// [kAppVersion] split for the backup header, which stores three bytes rather
/// than a string. Keep in step with the constant above.
const kAppVersionMajor = 1;
const kAppVersionMinor = 0;
const kAppVersionPatch = 0;

/// Short positioning line shown under the wordmark on the unlock screen.
const kAppTagline = 'Your wealth. Your vault.';

/// Public site. The store listings, the legal links below and the support
/// address all hang off this, so it moves in one place.
const kSiteUrl = 'https://khazana-app.netlify.app';

/// Privacy policy. Both stores require this URL in the listing, and Play
/// additionally requires it to be reachable from inside the app for anything
/// handling financial data.
const kPrivacyPolicyUrl = '$kSiteUrl/privacy';

/// Terms of use / EULA. Mirrors the root LICENSE file.
const kTermsUrl = '$kSiteUrl/terms';

/// The only support channel — there is no server, so there is no in-app
/// ticketing and no telemetry to tell us something broke.
const kSupportEmail = 'sandhoshsivan00@gmail.com';

/// Encrypted-backup file extension.
///
/// FROZEN: paired with the `0x46544F53` magic in the backup header. Changing it
/// makes every existing backup unrestorable, so it stays `.ftos` even though the
/// letters come from the old name.
const kBackupExtension = '.ftos';
