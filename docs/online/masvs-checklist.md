# OWASP MASVS checklist: Khazana Online mobile (L2 + R)

- **Target:** MASVS Level 2 plus Resilience (`R`), the level design section 14.1 sets for the Flutter apps.
- **App:** `mobile-online/` (Flutter, `com.khazana.online`), as it stands at base commit 8f1de24. Paths are relative to the repository root.
- **Date:** 2026-10-27. This is a **code-read**, not a test run and not a pentest. A pentest against MASVS L2+R is still needed (design section 14.5).
- **Standard wording:** the control IDs and one-line summaries follow MASVS v2. The published text was not checked from here, so **verify each ID and summary against the MASVS version the pentest firm uses** before this checklist goes into a scope letter.
- **Backend controls** are cited where the app depends on them. They are ASVS (server) controls, not MASVS, and are marked as such.

## Status key

| Status | Meaning |
|---|---|
| **Done** | The control is in the code, and the evidence is cited. |
| **Partial** | Some of the control is in place. The gap is named. |
| **Missing** | The control is not in the code, or the code does the opposite. |
| **Unknown** | The code cannot settle it. It needs a build, a device, or a measurement. |

## Summary

| Group | Done | Partial | Missing | Unknown |
|---|---|---|---|---|
| STORAGE | 0 | 2 | 0 | 0 |
| CRYPTO | 0 | 2 | 0 | 0 |
| AUTH | 0 | 1 | 2 | 0 |
| NETWORK | 0 | 1 | 1 | 0 |
| PLATFORM | 3 | 0 | 0 | 0 |
| CODE | 0 | 3 | 1 | 1 |
| RESILIENCE (R) | 0 | 0 | 4 | 0 |
| PRIVACY | 1 | 1 | 1 | 0 |

No control is **Done** for a Level 2 storage, crypto, or auth requirement. The app is a scaffold: sign-in with a passkey or Google is "coming soon", and there is no local unlock. The gaps below are the work of the next mobile slice, plus the external test.

## STORAGE

| ID | Level | Requirement (summary) | Status | Evidence | Gap and next step |
|---|---|---|---|---|---|
| MASVS-STORAGE-1 | L1 | Sensitive data goes only into platform secure storage. | Partial | `lib/core/key_store.dart:19-22` (keys and token in `FlutterSecureStorage`). `lib/core/key_store.dart:22` constructs it with the **default options**. Locked package: `flutter_secure_storage` 10.3.4. Default iOS accessibility is `unlocked` (`apple_options.dart`, 10.3.4). | iOS items are readable while unlocked and are **not** `ThisDeviceOnly`, so they can move to a new device through an encrypted backup. For a device-bound key that defeats the binding. Next: `IOSOptions(accessibility: KeychainAccessibility.unlocked_this_device)`, and review whether `first_unlock_this_device` is needed for background work. |
| MASVS-STORAGE-2 | L1 | No sensitive data leaks through logs, backups, keyboard cache, clipboard, or screenshots. | Partial | No `print`, `debugPrint` or logging in `lib/` (grep, 0 hits). The development subject field (`lib/features/sign_in_screen.dart:68`) does not set `enableSuggestions: false`. | Backups: `android/app/src/main/AndroidManifest.xml` sets no `android:allowBackup`, so Android's default (backup on) applies. Add `allowBackup="false"` and `dataExtractionRules`, as the offline app does. Screenshots and the app switcher: see RESILIENCE-3 and the FLAG_SECURE note in the design section 14.2. Keyboard: set `enableSuggestions: false` on every field that takes a secret (recovery phrase, later). |

## CRYPTO

| ID | Level | Requirement (summary) | Status | Evidence | Gap and next step |
|---|---|---|---|---|---|
| MASVS-CRYPTO-1 | L1 | Vetted algorithms and libraries; no home-made crypto. | Partial | `lib/core/dpop.dart`: ECDSA P-256 and SHA-256 from `pointycastle` (a published library), deterministic signatures (RFC 6979), `Random.secure()` for `jti` (`dpop.dart:33`). Tests in `test/dpop_test.dart` cover proof structure, verification, the JWK and the RFC 7638 thumbprint. They are not published RFC test vectors. | The design (section 14.2) names libsodium or the platform crypto. `pointycastle` is a reasonable choice, but it is not the one the design picked. Record the decision in an ADR, or move to the platform library. The design's hybrid post-quantum plan is not started. |
| MASVS-CRYPTO-2 | L1/L2 | Keys are generated and kept where they cannot be copied out: hardware or non-exportable. | Partial | `lib/core/dpop.dart:50` `export()` writes the raw private scalar. `lib/core/gateway_client.dart:60` stores it. `lib/core/dpop.dart` header says the key is loaded into memory to sign. | The key **is exportable**, so it is not hardware-bound. This is the scaffold the code itself describes. Next: a Secure Enclave or StrongBox key, generated and used without leaving the chip (design section 14.2 and 14.4, "a stolen token is useless"). |

## AUTH

| ID | Level | Requirement (summary) | Status | Evidence | Gap and next step |
|---|---|---|---|---|---|
| MASVS-AUTH-1 | L1 | Remote authentication uses a secure protocol, and sessions are protected. | Partial | DPoP proofs on every request (`lib/core/gateway_client.dart:_send`). Access token kept in memory. Refresh token rotates and a refused refresh clears the session (`gateway_client.dart:_refresh`, tests `test/gateway_client_test.dart:59-86`). Server: dev sign-in refused outside Development (`backend/services/Identity/Khazana.Identity.Infrastructure/DependencyInjection.cs:78-82`, unit test in `Khazana.Identity.Tests/UnitTests.cs:193-196`). | Passkey and Google sign-in are not built (`sign_in_screen.dart:61-63`, "coming soon"), so the only working provider is `dev`. The `dev` code path is compiled into release builds (`gateway_client.dart:signIn`). Server-side refresh reuse detection and token lifetime are **Unknown** here (backend review). |
| MASVS-AUTH-2 | L2 | Local authentication (app unlock) protects the app after the device is unlocked, with an idle timeout. | Missing | No `local_auth` package in `pubspec.yaml` or `pubspec.lock`. No PIN, biometric, or auto-lock code in `lib/`. | Design sections 14.2 and 14.3 require a PIN or biometric unlock with auto-lock, and an optional wipe after 10 wrong PINs. Not started. |
| MASVS-AUTH-3 | L2 | Step-up re-authentication for sensitive actions. | Missing | None. No code for pairing approval, device removal, or export exists yet. | Design section 14.3 lists the actions. Build the step-up prompt with a PIN fallback when the screens are built (see the accessibility audit, section 3). |

## NETWORK

| ID | Level | Requirement (summary) | Status | Evidence | Gap and next step |
|---|---|---|---|---|---|
| MASVS-NETWORK-1 | L1 | Traffic is protected with TLS, and cleartext is limited to what is needed. | Partial | Release Android: no `usesCleartextTraffic`, so cleartext is blocked by default (`android/app/src/main/AndroidManifest.xml`). Debug only: `android/app/src/debug/res/xml/network_security_config_debug.xml:3-8`, for `10.0.2.2` and `localhost`. | iOS: `ios/Runner/Info.plist` sets `NSAllowsLocalNetworking` in **every** build, so release can reach local addresses over http. `lib/core/config.dart:6-9` falls back to `http://localhost:5196` and does not refuse http in release. Next: refuse a non-https gateway when `kReleaseMode` is set, and move local networking to a debug-only plist. |
| MASVS-NETWORK-2 | L2 | Certificate pinning with backup pins and a remote kill-switch, as the design requires. | Missing | No pinning, `SecurityContext`, or `badCertificateCallback` in `lib/` or the platform folders (grep, 0 hits). | Design section 14.2: two backup pins and a remote kill-switch. Not started. Plan the pin rotation process before the pins go in. |

## PLATFORM

| ID | Level | Requirement (summary) | Status | Evidence | Gap and next step |
|---|---|---|---|---|---|
| MASVS-PLATFORM-1 | L1 | The app asks only for the permissions it needs. | Done | `AndroidManifest.xml`: `INTERNET` only. iOS `Info.plist` requests no usage descriptions. | Pairing by QR will need the camera. Add the permission and a usage string when the feature is built, and the text alternative from the accessibility audit. |
| MASVS-PLATFORM-2 | L1 | IPC, deep links and exported components are safe. | Done | `AndroidManifest.xml`: the only exported component is the launcher `MainActivity` (`exported="true"` is required for the launcher). No other intent filters. `ios/Runner/Info.plist` has no `CFBundleURLTypes` (grep, 0 hits). | Re-check when pairing adds a deep link (the pairing link would be a deep link). It must not carry a secret in the URL. |
| MASVS-PLATFORM-3 | L1 | WebViews are configured safely, if used. | Done | No WebView package in `pubspec.lock` (grep, 0 hits). | None until a WebView is added. |

## CODE

| ID | Level | Requirement (summary) | Status | Evidence | Gap and next step |
|---|---|---|---|---|---|
| MASVS-CODE-1 | L1 | The release build is signed with a proper key, and the app is provisioned. | Missing | `android/app/build.gradle.kts:37`: release uses `signingConfigs.getByName("debug")`, with a TODO. `.github/workflows/release-mobile.yml` is the **offline** app's release job; there is no release job for `mobile-online`. | Create a release keystore (kept out of the repository, in CI secrets, as the offline app does), a release job, and an iOS provisioning profile. Until then, no build can go to a store. |
| MASVS-CODE-2 | L1 | Dependencies are pinned and scanned, and the app can be updated. | Partial | `mobile-online/pubspec.lock` is committed (77 packages). CI runs `flutter analyze` and `flutter test` (`.github/workflows/ci.yml`, job "Online mobile app"). | No dependency vulnerability scan and no SBOM in CI. Add an OSV or `dart pub` audit step and an SBOM at release. |
| MASVS-CODE-3 | L1 | Debug and test code is not in the release build; the build is not debuggable. | Partial | `lib/core/config.dart:14` gates the dev sign-in on `bool.fromEnvironment('KHAZANA_DEV_SIGN_IN')`, default off. No `debuggable` flag in the manifest (Flutter's release default is off). | The `signIn('dev', …)` method ships in every build (`gateway_client.dart:signIn`). The server refuses `dev` outside Development, so this is defence in depth, not the only control. **Unknown**: whether a release binary still contains the dev strings. Check after the release build exists. |
| MASVS-CODE-4 | L1 | Input from every source is validated and errors are handled. | Partial | Server validates sign-in fields. `lib/core/gateway_client.dart:_fail` handles non-JSON errors. `TokenResponse.fromJson` casts without checking (`gateway_client.dart:20`). The dev subject is not validated on the client. | Add validation for the response shape, so an unexpected server response fails with a clear error rather than a generic one. The dev field is dev-only. |
| MASVS-CODE-5 | L1 | Static analysis runs, and the test suite covers security code. | Unknown | `flutter analyze` runs in CI. Tests cover DPoP and the gateway client (`test/dpop_test.dart`, `test/gateway_client_test.dart`). | Whether the analysis rules are strict enough is **Unknown**: `analysis_options.yaml` was not reviewed in depth. Add a SAST step (the design lists Semgrep and CodeQL). |

## RESILIENCE (R)

The R controls are the design's "App integrity" and "Resilience" layers (section 14.2). None is built.

| ID | Level | Requirement (summary) | Status | Evidence | Gap and next step |
|---|---|---|---|---|---|
| MASVS-RESILIENCE-1 | R | Obfuscation of the release build, with symbols kept separately. | Missing | No `--obfuscate` or `--split-debug-info` in any mobile-online build. No release job (see CODE-1). | Add both flags to the release job, and store the symbols for crash reports. |
| MASVS-RESILIENCE-2 | R | Root, jailbreak, debugger and tamper detection, with sensitive features turned off when found. | Missing | No such code (grep for root, jailbreak, debugger and tamper terms: 0 hits). | Design section 14.2 names Play Integrity and Apple App Attest, checked at sign-in and on sensitive calls. Not started. |
| MASVS-RESILIENCE-3 | R | Anti-hooking and anti-dynamic-analysis controls, or documented as not required. | Missing | None. | Design section 14.2 defers commercial RASP (D11) until the pentest asks for it. Record that decision; the pentest result decides. |
| MASVS-RESILIENCE-4 | R | Device binding and integrity checks at runtime, not only at install. | Missing | DPoP binds the token to a key, but the key is exportable (CRYPTO-2), and nothing checks the device. | Depends on CRYPTO-2 (hardware key) and RESILIENCE-2 (attestation). |

## PRIVACY

These controls follow the MASVS privacy group as summarised in v2.1. **Verify the IDs against the MASVS version in use.**

| ID | Level | Requirement (summary) | Status | Evidence | Gap and next step |
|---|---|---|---|---|---|
| MASVS-PRIVACY-1 | L1 | The app collects only the data it needs. | Done | No analytics, crash-reporting or advertising package in `pubspec.lock` (grep, 0 hits). Device name is the platform only (`lib/core/config.dart:17`). | Keep it that way. The App Store and Play data-safety answers must match (see `docs/online/store-listing-draft.md`). |
| MASVS-PRIVACY-2 | L1 | The user is told what is collected and why, in the app and in the policy. | Missing | No privacy notice in the app. No privacy policy or terms exist yet (design section 15.3, "Privacy policy, terms, consent texts", start Mar 2027). | Write the policy and the in-app notice before any real user data is held. The launch checklist lists it. |
| MASVS-PRIVACY-3 | L1 | The user can delete their data and account from the app. | Partial | Sign-out clears the local session (`lib/features/home_screen.dart:_signOut`, `gateway_client.dart:signOut`). Server-side deletion is in the backend design (the deletion saga). | No in-app account deletion yet. Apple requires it for an app that creates accounts (design section 14.5). Build it with step-up (AUTH-3). |

## Unknowns to settle with a build or a device

1. Whether a release binary contains the `dev` sign-in strings (CODE-3).
2. Keychain behaviour on a real iPhone with the `unlocked_this_device` option (STORAGE-1). Test it after the change.
3. Android Keystore behaviour and backup on a real device (STORAGE-1, STORAGE-2).
4. Server refresh reuse detection, token lifetime and key rotation (AUTH-1). These are backend items for the ASVS review.
5. Dependency vulnerabilities in the 77 locked packages (CODE-2). No scan was run.
6. Whether the analysis options are strict enough (CODE-5).

## What this checklist does not cover

- **Web (`webapp-online/`)**: ASVS, not MASVS. Its controls are in the accessibility and hardening work. Two web items need attention: `npm audit --omit=dev` reports 3 vulnerabilities (1 critical, 2 high) through `sharp` and `next`, and the fix is a breaking `next` upgrade that needs a decision.
- **Backend**: ASVS and API Top 10. Not reviewed here, except where the app depends on it.
- **Offline app**: separate product (ADR 0007), separate checklist.
