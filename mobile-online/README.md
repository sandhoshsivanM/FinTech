# Khazana Online — mobile

Khazana with an account: the same money on every device, end-to-end
encrypted. This is a **separate app** from the offline Khazana at the repo
root (ADR 0007): app id `com.khazana.online`, its own storage, store listings
and releases, installable next to `com.khazana.app`. It never imports the
offline app; shared domain logic comes from `../packages/khazana_domain`.

## Run it locally

1. Start the backend: `dotnet run --project backend/Khazana.AppHost --launch-profile http`
   (gateway on `http://localhost:5196`; the emulator reaches it as `10.0.2.2`).
2. In this folder: `flutter run --dart-define=KHAZANA_DEV_SIGN_IN=true`.
3. Use **Development sign-in** with any `dev:` subject.

On-device check: `flutter test integration_test --dart-define=KHAZANA_DEV_SIGN_IN=true -d <device>`.

## What is here (scaffold)

| Path | What it does |
|---|---|
| `lib/core/dpop.dart` | DPoP proofs (RFC 9449), deterministic ECDSA P-256 (pointycastle) |
| `lib/core/key_store.dart` | Keychain / Keystore storage for the device key and refresh token |
| `lib/core/gateway_client.dart` | Sign-in, signed calls, refresh rotation, sign-out |
| `lib/features/` | Sign-in, and a home with empty Accounts, Cards and Connections |

**Not yet:** a hardware-held, non-exportable key (Secure Enclave / StrongBox:
today the key is in the platform keystore and loaded to sign), device keys and
pairing (ADR 0005), encrypted sync (ADR 0006), Google and passkey sign-in, and
release jobs and store listings.

## Smart capture (`lib/capture/`)

Everything is read **on the phone**. Only parsed values (amount, date, merchant,
last 4, reference) are kept, in the Keychain/Keystore; message text, email
bodies and images are never stored, logged or uploaded. Drafts wait in the
**Review inbox** (Home > Smart capture) and count for nothing until approved.
All sources go through one path: text -> `khazana_domain` `NotificationParser`
-> `CaptureIngestor` -> `CaptureSink` (dedupes on the parser fingerprint, so
the same alert from SMS and Gmail is one draft). The sync engine will swap
`SecureCaptureSink` for the vault-backed sink in `capture_services.dart`.

### Gmail bank alerts

Scope `gmail.readonly` (the narrowest scope that returns a body; `gmail.metadata`
cannot). Queries only bank/UPI sender domains (`gmail_query.dart`). Google OAuth
with PKCE; the refresh token is in the secure store.

1. Google Cloud console: create a project, enable the Gmail API, configure the
   OAuth consent screen as **External, Testing**, add up to 100 test users
   (no CASA assessment needed in Testing mode), add the `gmail.readonly` scope.
   Create an OAuth client of type **iOS** (bundle id `com.khazana.online`);
   for Android, type **Android** (package `com.khazana.online` + SHA-1).
2. Build with `--dart-define=KHAZANA_GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com`.
3. iOS: put `KHAZANA_GOOGLE_REVERSED_CLIENT_ID = com.googleusercontent.apps.<id>`
   in `ios/Flutter/Local.xcconfig` (git-ignored). Android: set
   `khazanaGoogleRedirectScheme=com.googleusercontent.apps.<id>` in
   `~/.gradle/gradle.properties`.

Testing-mode caveat: Google expires the refresh token after **7 days**; the
screen then says "Reconnect Gmail". Publishing the app (restricted scope) needs
Google's verification and a yearly CASA assessment.

### Screenshots and receipts

Smart capture > Choose photo / Take photo. ML Kit text recognition runs on the
device; the text goes to the parser; the picker's temporary copy is deleted.
Works best on payment-app screenshots and bank alerts; a plain shop receipt
with no "paid/debited" wording is ignored.

### iPhone bank SMS (Shortcuts)

iOS has no SMS API, so a Personal Automation forwards each bank message to the
App Intent **Add bank SMS to Khazana** (`ios/Runner/CaptureIntent.swift`). The
intent runs in the background, hands the text to a short-lived headless Flutter
engine, and drops it; the automation never opens the app.

1. Install the build on your iPhone (iOS 16+) and open the app once.
2. Shortcuts > **Automation** > **+** > **Message**. Set **Message Contains**
   to a word your bank uses (for example `debited`), or pick the bank's sender.
3. Choose **Run Immediately** (not "Ask Before Running") and turn off
   **Notify When Run**.
4. Next > **New Blank Automation** > add action **Add bank SMS to Khazana**
   (search "Khazana"). Set its **Message** to the magic variable
   **Shortcut Input** (the message).
5. Done. Send yourself a test SMS, then check the Review inbox.

OTP messages are dropped by the parser. If a bank message is not picked up,
tell the automation's keyword filter to be broader; non-bank messages are
ignored by the parser anyway. Unverified on a real device (design 9.1).

Apple side: the intent needs no entitlement or app group (text goes over an
in-process channel). It does need iOS 16+, which the project now sets, and a
signing team on `com.khazana.online`. Photo and camera usage strings are in
Info.plist.

## Build settings (`--dart-define`)

| Name | Meaning |
|---|---|
| `KHAZANA_GATEWAY_URL` | The gateway this build talks to (default: local Aspire) |
| `KHAZANA_GOOGLE_CLIENT_ID` | Google OAuth client id for Gmail capture (see above); empty hides Gmail |
| `KHAZANA_DEV_SIGN_IN` | `true` shows the development sign-in; never in release builds |

Release builds allow https only: plain http to `10.0.2.2`/`localhost` is a
debug-only Android exception, and iOS allows only local networking.
