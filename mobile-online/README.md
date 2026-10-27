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
| `lib/security/` | M13 client hardening, see below |
| `lib/features/` | Sign-in, and a home with empty Accounts, Cards and Connections |

**Not yet:** device keys and pairing (ADR 0005), encrypted sync (ADR 0006), Google and passkey sign-in, and
release jobs and store listings.

## Build settings (`--dart-define`)

| Name | Meaning |
|---|---|
| `KHAZANA_GATEWAY_URL` | The gateway this build talks to (default: local Aspire) |
| `KHAZANA_DEV_SIGN_IN` | `true` shows the development sign-in; never in release builds |

Release builds allow https only: plain http to `10.0.2.2`/`localhost` is a
debug-only Android exception, and iOS allows only local networking.

## Client hardening (`lib/security/`, MASVS L2+R)

| Control | Where | Notes |
|---|---|---|
| Hardware device key | `hardware_key.dart`, `device_key_provider.dart`, `DeviceKeyChannel.kt`, `Hardening.swift` | P-256 in StrongBox / TEE / Secure Enclave, non-exportable. The old software key lives on only while a session is bound to it, and is erased at the next sign-in. Software fallback only where there is no hardware (simulator, old devices); `KHAZANA_ALLOW_SOFTWARE_KEY=false` forbids it. |
| Root / jailbreak / tamper | `integrity.dart`, `IntegrityChannel.kt`, `Hardening.swift` | Pairing, key export and recovery-phrase reveal are blocked on a compromised device (and with a software key). `KHAZANA_ALLOW_COMPROMISED=true` downgrades to a warning in **debug builds only**. |
| Screen protection | `screen_protection.dart` | FLAG_SECURE app-wide (Android); blur cover in the app switcher and while recording (iOS). Wrap secret screens in `ProtectedScreen`. |
| Certificate pinning | `pinning.dart` | `KHAZANA_PIN_HOST` + `KHAZANA_PINS="<b64 sha256 SPKI>,<backup>"`. Off for any other host (sslip.io, tunnels). When on: at least two pins, https only, fail closed. Leaf SPKI only (dart:io exposes no chain). |
| App attestation | `attestation.dart` | Interface + no-op default. Server verification and Play Integrity / App Attest wiring are TODO. |

Not set on the signing key yet: biometric gating (every request is signed);
the plan is a second, biometric-bound key for step-up on sensitive actions.
