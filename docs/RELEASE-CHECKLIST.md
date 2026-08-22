# Release checklist

`.github/workflows/release.yml` has pointed at "the release checklist in the
repo" since it was written. This is that file.

Work top to bottom. Anything marked **BLOCKER** cannot be worked around.

---

## Once, before the first paid release

These have external waiting periods measured in weeks. Every day of delay here
is a day added to launch.

- [ ] **BLOCKER** Google Play Console account ($25, identity verification takes
      days). Then **start the 12-tester / 14-day closed test immediately** —
      individual developer accounts cannot reach production without it, and it
      is the longest pole in the entire launch.
- [ ] **BLOCKER** Apple Developer Program ($99/yr). Confirm the team ID; the one
      committed in `ios/Runner.xcodeproj` may be stale — the only signing
      identity on the build machine belongs to a different team.
- [ ] Custom domain, and point Netlify at it. `*.netlify.app` on a free tier is
      not a credible URL for a paid finance product.
- [ ] Support email on that domain. Both stores require a working support URL.
- [ ] Merchant of record (LemonSqueezy or Paddle), **not** raw Stripe — an MoR
      owns Indian GST and EU VAT on your behalf.
- [ ] **BLOCKER** Mint the Ed25519 licence pair:
      `dart run tool/mint_licenses.dart --generate-keypair`.
      Private key → password manager **and** a paper backup. Paste the public
      key into **both** `lib/core/entitlement/license_public_key.dart` and
      `webapp/src/lib/entitlement/licensePublicKey.ts` — they must match byte
      for byte. Until then every licence key is refused, by design.
- [ ] Mint a key pool and upload it to the merchant as a code list:
      `dart run tool/mint_licenses.dart --private-key <b64> --count 1000 > keys.txt`
- [ ] **BLOCKER** Create the Android release keystore. Back it up off-machine —
      **losing it means you can never update the app on Play, ever.**
- [ ] App Store Connect: create `khazana_pro` as a **non-consumable**, enable
      **Universal Purchase** (one buy covers iPhone/iPad/Mac) and **Family
      Sharing**. Play Console: same id, one-time product.
- [ ] `macos/Runner/Configs/Signing.local.xcconfig` with a real Developer ID,
      `KHAZANA_HARDENED_RUNTIME = YES` and
      `KHAZANA_INJECT_BASE_ENTITLEMENTS = NO`. Set all of them together — a
      half-configured build compiles and then crashes at launch on library
      validation.
- [ ] Upgrade `flutter_secure_storage` off `^10.0.0-beta.4`. It guards the vault
      salt; a beta is not a shipping dependency for a paid security product.

---

## Every release

### 1. Code

- [ ] `tool/check_versions.sh` passes (five files state the version).
- [ ] Bump `version:` in `pubspec.yaml`, then re-run the check and fix all five.
- [ ] `flutter analyze` clean.
- [ ] `flutter test --exclude-tags golden` green.
- [ ] `cd webapp && npx tsc --noEmit && npx vitest run && npm run build` green.
- [ ] Working tree committed. CI has never built an uncommitted state.

### 2. The tests CI does not run

`integration_test/` needs a device, so CI skips it — which means the tests
guarding **encryption at rest** never run automatically. Run them by hand:

- [ ] `flutter test integration_test/encryption_roundtrip_test.dart -d macos`
- [ ] `flutter test integration_test/keychain_macos_test.dart -d macos`

### 3. Data safety, on a real device

The failures here are silent and permanent, so they are checked by hand:

- [ ] Backup → wipe → restore round trip, **on both clients**.
- [ ] "Erase all data" removes the `receipts/` directory, not only DB rows.
- [ ] Upgrade-in-place from the previous released build, with data present.
      Nothing lost, no migration crash.
- [ ] **Bundle identifiers unchanged.** macOS keys WebView and container storage
      to the bundle id — changing `com.khazana.app` gives the app an empty
      container and the user's vault vanishes. This has happened. Do not change
      an identifier without a migration that copies the old container first.

### 4. Entitlement

- [ ] `flutter test test/unit/feature_gate_test.dart` — the always-free
      invariant.
- [ ] `flutter test test/unit/license_key_test.dart` and
      `npx vitest run src/lib/entitlement/` — both verifiers agree on the shared
      fixture.
- [ ] Sandbox purchase via a StoreKit `.storekit` config and a Play licence
      tester. Then **delete the app, reinstall, confirm silent restore**.
- [ ] Confirm `completePurchase()` fires. **Play auto-refunds anything
      unacknowledged after three days**, silently — this bug refunds every
      customer and looks like nothing at all for 72 hours.
- [ ] Airplane mode on a Pro device: **still Pro**.
- [ ] App Store build contains no licence-key field
      (`--dart-define=KHAZANA_CHANNEL=appStore`).

### 5. Store artifacts

- [ ] `flutter build appbundle --release --dart-define=KHAZANA_CHANNEL=play`
- [ ] Signed with the **release** keystore, not debug.
- [ ] Shipped manifest: `INTERNET` present, `READ_SMS`/`RECEIVE_SMS` absent,
      `allowBackup="false"`. (The `android` job in `release-mobile.yml` asserts
      all four.)
- [ ] `flutter build ipa --release --dart-define=KHAZANA_CHANNEL=appStore`,
      passes Xcode validation with no ITMS errors.
- [ ] iOS 1024 icon has **no alpha** (ITMS-90717 is an upload failure).
- [ ] `ITSAppUsesNonExemptEncryption` present in both Info.plists, or every
      upload stalls on the export-compliance questionnaire.
- [ ] macOS: `codesign -dv` shows a real identity and `runtime`, then
      `xcrun notarytool submit … --wait` and `xcrun stapler staple`.
- [ ] **Desktop installers are signed.** An unsigned build is refused by
      Gatekeeper and warned about by SmartScreen — fatal to conversion on a
      *paid* download.

### 6. Store metadata

- [ ] Screenshots regenerated if the UI changed. Build them from
      **Settings → Load sample data** with demo market data **on** — never from
      a real vault.
- [ ] `docs/store-listing.md` copy still accurate for this version.
- [ ] Play Data Safety form and Apple Privacy Nutrition Labels reviewed.
- [ ] Privacy policy and terms reachable **in-app** and from both listings.

### 7. After

- [ ] Tag `vX.Y.Z` — `release-mobile.yml` asserts the tag matches `pubspec.yaml`.
- [ ] Staged rollout on Play (start at 20%). Phased release on Apple.
- [ ] Watch crash rates and refund rate for 48 hours before going to 100%.

---

## If something goes wrong

- **Play halt:** Play Console → Release → halt rollout. Works only while staged,
  which is why rollouts start at 20%.
- **Apple:** you cannot pull a live version. Ship a fix and use Phased Release
  to slow the damage.
- **A bad licence key batch:** re-mint and re-issue via the merchant's order
  lookup. There is deliberately **no revocation list** — a fetched one needs a
  server, and a baked-in one goes stale and eventually locks out an honest
  buyer, which is worse than the piracy it would prevent.
