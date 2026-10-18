# Release checklist

`.github/workflows/release.yml` has pointed at "the release checklist in the
repo" since it was written. This is that file.

Work top to bottom. Anything marked **BLOCKER** cannot be worked around.

---

## Play Console: what you do

Everything below needs your identity, your payment details or a secret, so none
of it can be done for you. Do it in this order. Copy-paste answers for every
form are in `docs/store-listing.md` (section "Google Play"); the graphics are in
`docs/play-store/`.

1. [ ] **Create a Play Console developer account** at
       https://play.google.com/console ($25 once). Choose *Personal* or
       *Organization* honestly: the type decides the testing rule below. Complete
       identity verification (it can take days) and the contact details, which
       are shown publicly.
2. [ ] **Create the app**: name `Khazana: Private Money Vault`, English (India),
       *App*, *Free*, then accept the declarations. The package name is fixed at
       first upload: `com.khazana.app` (never change it; see "Bundle identifiers unchanged" below).
3. [ ] **Generate an UPLOAD keystore.** Run this yourself, in a terminal, on a
       machine you trust. Pick strong passwords when prompted and put them in a
       password manager. Never commit the file or paste the passwords anywhere
       except GitHub secrets:

       keytool -genkeypair -v -storetype PKCS12 \
         -keystore ~/khazana-upload.jks -alias upload \
         -keyalg RSA -keysize 2048 -validity 10000

       Back the `.jks` up off the machine (password manager attachment and an
       encrypted offline copy). With Play App Signing (step 5) a lost *upload*
       key can be reset through Play support, but a lost key with nothing backed
       up still costs you days.
4. [ ] **Add the four GitHub secrets** (repo Settings, Secrets and variables,
       Actions). `release-mobile.yml` refuses to build without the first one:

       ANDROID_KEYSTORE_BASE64   output of:  base64 -i ~/khazana-upload.jks | pbcopy
       ANDROID_STORE_PASSWORD    the keystore password you chose
       ANDROID_KEY_ALIAS         upload   (the -alias above)
       ANDROID_KEY_PASSWORD      the key password you chose

       Then tag `v1.0.0` (or run the workflow manually) and download the
       `khazana-android-aab` artifact. It is signed with the upload key.
5. [ ] **Enable Play App Signing** when creating the first release (it is the
       default for new apps): Google holds the real app-signing key and you sign
       uploads with the upload key from step 3. Do not opt out.
6. [ ] **Fill in App content** (Policy, App content): privacy policy URL
       `https://khazana-app.netlify.app/privacy/` (first redeploy the web app so
       the updated notification-access paragraph is live and check it in a
       browser), ads = No, app access = the reviewer instructions, content rating
       questionnaire, target audience 18+, data safety, financial features. All
       answers are in `docs/store-listing.md`.
7. [ ] **Main store listing**: short and full description, `icon-512.png`,
       `feature-graphic.png` and the eight screenshots from `docs/play-store/`.
8. [ ] **Closed testing**: Testing, Closed testing, create a track, upload the
       AAB, add testers (an email list or a Google Group), roll out, and share
       the opt-in link. Add release notes from the listing doc.
 9. [ ] **Run the test properly**: if the account is a *personal* one created
       after 13 Nov 2023, Play requires **at least 12 testers opted in
       continuously for 14 days** before you may apply for production. Recruit
       14 to 15 so a couple of drop-outs do not reset the clock. Ask testers to
       actually open the app (and tell you what breaks). Organization accounts
       are exempt from this rule.
10. [ ] **Apply for production access** once the 14 days are met (Dashboard,
       "Apply for production"), answer the questions about what testers did and
       what you changed, then create the production release. Start the staged
       rollout at 20 percent (see "After" below).
11. [ ] **After approval**: keep `versionCode` strictly increasing (`+2`, `+3`...
       in `pubspec.yaml`), and re-check the Data safety form whenever a network
       call, SDK or permission is added.

---

## Once, before the first public release

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
      not a credible URL for a finance product.
- [ ] Support email on that domain. Both stores require a working support URL.
- [ ] **BLOCKER** Create the Android release keystore. Back it up off-machine —
      **losing it means you can never update the app on Play, ever.**
- [ ] `macos/Runner/Configs/Signing.local.xcconfig` with a real Developer ID,
      `KHAZANA_HARDENED_RUNTIME = YES` and
      `KHAZANA_INJECT_BASE_ENTITLEMENTS = NO`. Set all of them together — a
      half-configured build compiles and then crashes at launch on library
      validation.
- [ ] Upgrade `flutter_secure_storage` off `^10.0.0-beta.4`. It guards the vault
      salt; a beta is not a shipping dependency for a security product.

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

### 4. Everything is free

- [ ] `flutter test test/widget/everything_free_test.dart` and
      `npx vitest run src/app/everythingFree.test.tsx` — no screen is gated, no
      paywall copy, no `/pro` route.

### 5. Store artifacts

- [ ] `flutter build appbundle --release --flavor play --dart-define=KHAZANA_CHANNEL=play`
      (the **play** flavor — never upload a `sideload` build to Play: it declares
      `READ_SMS`/`RECEIVE_SMS`.)
- [ ] Signed with the **release** keystore, not debug.
- [ ] Shipped manifest: `INTERNET` present, `READ_SMS`/`RECEIVE_SMS` absent,
      `allowBackup="false"`, `com.android.vending.BILLING` absent. (The
      `android` job in `release-mobile.yml` asserts all five.)
- [ ] `flutter build ipa --release --dart-define=KHAZANA_CHANNEL=appStore`,
      passes Xcode validation with no ITMS errors.
- [ ] iOS 1024 icon has **no alpha** (ITMS-90717 is an upload failure).
- [ ] `ITSAppUsesNonExemptEncryption` present in both Info.plists, or every
      upload stalls on the export-compliance questionnaire.
- [ ] macOS: `codesign -dv` shows a real identity and `runtime`, then
      `xcrun notarytool submit … --wait` and `xcrun stapler staple`.
- [ ] **Desktop installers are signed.** An unsigned build is refused by
      Gatekeeper and warned about by SmartScreen — fatal to adoption of a
      downloaded finance app.

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
- [ ] Watch crash rates and store reviews for 48 hours before going to 100%.

---

## If something goes wrong

- **Play halt:** Play Console → Release → halt rollout. Works only while staged,
  which is why rollouts start at 20%.
- **Apple:** you cannot pull a live version. Ship a fix and use Phased Release
  to slow the damage.
