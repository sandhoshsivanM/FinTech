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

## Build settings (`--dart-define`)

| Name | Meaning |
|---|---|
| `KHAZANA_GATEWAY_URL` | The gateway this build talks to (default: local Aspire) |
| `KHAZANA_DEV_SIGN_IN` | `true` shows the development sign-in; never in release builds |

Release builds allow https only: plain http to `10.0.2.2`/`localhost` is a
debug-only Android exception, and iOS allows only local networking.
