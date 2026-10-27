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

## What is here

| Path | What it does |
|---|---|
| `lib/core/dpop.dart` | DPoP proofs (RFC 9449), deterministic ECDSA P-256 (pointycastle) |
| `lib/core/key_store.dart` | Keychain / Keystore storage: DPoP key, refresh token, X25519 seed, device envelope |
| `lib/core/gateway_client.dart` | Sign-in (dev, passkey, Google bound to the DPoP key), signed calls, refresh rotation |
| `lib/core/passkey.dart`, `google_auth.dart` | Platform passkey ceremony and Google ID token (nonce = DPoP thumbprint) |
| `lib/crypto/` | Sealed box, recovery envelope, record AEAD, 24-word phrase; pinned by `../contracts/crypto/vectors.json` |
| `lib/keys/account_keys.dart` | Device keys, create/recover/pair the data key (QR pairing) |
| `lib/sync/` | Local record store (ciphertext only) and the sync engine, same protocol as the web client |
| `lib/ledger/ledger.dart` | Accounts and transactions as encrypted records (Decimal money) |
| `lib/features/` | Sign-in, key setup, recovery phrase, pair/approve, accounts and transactions |

Build-time settings: `KHAZANA_GATEWAY_URL`, `KHAZANA_GOOGLE_SERVER_CLIENT_ID`,
`KHAZANA_GOOGLE_IOS_CLIENT_ID`. Passkeys need the gateway's relying-party id to be a
domain that serves `/.well-known/assetlinks.json` (Android) and
`apple-app-site-association` (iOS, plus the Associated Domains entitlement
`webcredentials:<domain>`), which are release-time setup.

**Not yet:** a hardware-held, non-exportable DPoP key (Secure Enclave / StrongBox),
editing accounts and transactions in the UI (the writer supports it), cards and
connections, and release jobs and store listings.
