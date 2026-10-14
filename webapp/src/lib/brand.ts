/**
 * Single source of truth for the product name and brand-derived strings.
 *
 * The name was previously hardcoded in seven independent places here, which is
 * how stale `fintech-os-*` names survived in user-facing download filenames.
 * Anything user-visible that names the product should read from this module.
 *
 * Two sites deliberately keep literals instead of importing this, because they
 * are not JS-evaluated at runtime:
 *   - `src-tauri/tauri.conf.json` (build-time config)
 *   - the inline no-FOUC theme script in `app/layout.tsx`
 *
 * Deliberately NOT here — frozen storage/crypto contracts, not brand:
 *   - the `FTOS-OK` vault verifier in `lib/store.ts`
 *   - the Dexie database name `fintech_os` in `lib/db.ts`
 *   - the `.ftos` backup extension (paired with the Flutter backup magic)
 */

/** Product name, as shown to users. */
export const APP_NAME = 'Khazana';

/** Full title used for the document title and PWA `name`. */
export const APP_TITLE = 'Khazana — Private Wealth';

/** One-line product description for metadata. */
export const APP_DESCRIPTION = 'Offline-first, private personal finance & wealth management.';

/** Short positioning line shown under the wordmark. From the brand sheet. */
export const APP_TAGLINE = 'Your wealth. Your vault.';

/** The trust claims from the brand sheet's footer strip, shown on the gate. */
export const TRUST_POINTS: { title: string; detail: string }[] = [
  { title: '100% private', detail: 'No server. No tracking.' },
  { title: 'Encrypted', detail: 'AES-256 at rest. PIN never leaves the device.' },
  { title: 'Offline first', detail: 'Works everywhere. No internet required.' },
];

/**
 * Where "Send feedback" and "Report a problem" are addressed. The only place
 * the feedback address is written down in the web app.
 *
 * The legal pages (`app/terms`, `app/privacy`) each carry their own `CONTACT`
 * constant for the legal contact. Today it is the same inbox, but it is a
 * separate decision and deliberately not tied to this one.
 */
export const FEEDBACK_EMAIL = 'sandhoshsivan00@gmail.com';
