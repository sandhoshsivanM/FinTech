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

/// Short positioning line shown under the wordmark on the unlock screen.
const kAppTagline = 'Your wealth. Your vault.';

/// Encrypted-backup file extension.
///
/// FROZEN: paired with the `0x46544F53` magic in the backup header. Changing it
/// makes every existing backup unrestorable, so it stays `.ftos` even though the
/// letters come from the old name.
const kBackupExtension = '.ftos';
