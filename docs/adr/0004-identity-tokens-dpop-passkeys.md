# ADR 0004: Our own tokens, bound to the device with DPoP; passkeys first (decision D3)

- **Status:** accepted (2026-10-22)

## Context
v2 holds bank and card data. A stolen session token must not be enough to
read it. Passwords and SMS OTPs are the usual weak points: phishing, reuse
and SIM swap.

## Decision
- **Identity issues its own tokens** after verifying a Google or Apple ID token,
  or a passkey. There are no per-user fees, and no third party holds sessions.
- **Access tokens:** ES256 JWT (`typ: at+jwt`), 15 minutes, carrying ids only
  (`sub`, `did`) and `cnf.jkt`, the thumbprint of the device's key.
- **DPoP (RFC 9449):** every request carries a proof signed by the device key,
  for that method and URL, used once. `Bearer` is refused. A copied token
  without the key opens nothing.
- **Refresh tokens:** 256 random bits. Only the SHA-256 hash is stored. They
  are bound to the same key, single use, and rotated on every refresh. A reused
  token, or one presented with another key, revokes the whole session
  (RFC 9700 §4.14.2).
- **Passkeys (WebAuthn, Fido2NetLib):** discoverable credentials, user
  verification required, no attestation. Each challenge is stored, single use,
  and lives 5 minutes. A signature counter that goes backwards is refused.
- **Personal fields** are encrypted with AES-256-GCM, and emails and provider
  subjects are looked up by a keyed HMAC. A copy of the database alone shows
  neither who the users are nor which Google or Apple accounts they use.
- **Free first:** Google and Apple tokens are verified against the providers'
  published keys at no cost. In Development a `dev:` provider stands in, and a
  startup guard refuses it, and the throwaway signing key, anywhere else.

## Consequences
- Every other service validates tokens with `Khazana.Security`
  (`AddKhazanaAuthentication`), fetching Identity's public keys from its
  internal `/.well-known/jwks.json`.
- The app must keep the DPoP key in the secure chip (Secure Enclave or
  StrongBox) and require biometrics to use it for sensitive calls (§14.3).
- **Open items:**
  - The DPoP replay cache is per instance, and must become shared (Redis or
    Postgres) before any service runs more than one instance.
  - The production signing key moves to KMS.
  - The account-deletion saga is the next step (the event is published now).
  - Play Integrity and App Attest checks are not done yet.

## Amendment (2026-10-28): SMS code sign-in, as a convenience only
Easy sign-in matters for Indian users, so a mobile number and a 6-digit SMS
code may start a session (`POST /v1/auth/phone/start`, then `POST /v1/auth/token`
with `provider=phone`). It is allowed on these terms, because SIM swap and
interception remain real:
- **No data access.** A session is only a session. The data key still comes
  from pairing or the recovery phrase, which end-to-end encryption keeps off
  the server. A SIM-swapper gets a session, not the data.
- **No step-up.** An SMS code never satisfies `/v1/auth/step-up`; it stays
  passkey-only. Removing a device, the sensitive action, still needs a passkey.
- **Anti-pumping limits.** Gateway `phone_otp` policy (10 per 15 minutes per
  address), then in Identity per number (30 s gap, 3 per 15 minutes, 10 per
  day) and per device key (5 per 15 minutes, 20 per day). Codes live 5 minutes,
  work once, allow 5 tries, are bound to the asking device key, and are stored
  only as an HMAC. Asking never reveals whether a number has an account.
- **New-device alerts.** Every sign-in publishes `UserSignedInV1`; Notification
  pushes "New sign-in on <platform>" to the user's other devices.
- **Adapter.** `ISmsSender` (ADR 0003): the Fake sender (logs the code; a demo
  flag may also echo it) is refused in Production, and the echo flag too. A
  real provider (MSG91) stops startup without its settings. A real provider
  needs a registered business and DLT registration (sender id and template),
  about ₹0.15 to ₹0.25 per SMS.
- After a phone sign-in the apps offer to add a passkey, which Identity allows
  within the 10-minute fresh-sign-in window.
