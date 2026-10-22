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
