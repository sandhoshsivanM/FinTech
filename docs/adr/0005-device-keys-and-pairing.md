# ADR 0005: Devices & Keys stores ciphertext only; QR pairing proves presence

- **Status:** accepted (2026-10-22)

## Context
Sync data is end-to-end encrypted under one data key (DEK) per user (design
doc §6). The server must help a new phone get that key without ever being
able to read it, and without letting someone who stole a Google login get it.

## Decision
- **What the server holds:** only wrapped copies of the DEK. Each device's copy
  is wrapped to that device's X25519 public key (`x25519-sealedbox-v1`). The
  recovery copy is wrapped under a key derived from the 24-word phrase
  (`argon2id-aes256gcm-v1`). The server checks the shape, never the content.
- **Bootstrap:** this happens once per account. The first device uploads its
  envelope, the recovery envelope and a key check, HKDF(DEK,
  "khazana.key-check.v1"). The server stores only SHA-256 of the key check.
- **QR pairing:**
  1. The new device starts a five-minute session and shows the pairing id,
     a 128-bit code (stored hashed) and a hash of its public key.
  2. An existing device that holds the DEK scans the QR and compares the
     public key the server returns against that hash. A substituted key is
     caught.
  3. It wraps the DEK to the new device and approves with the code. Each code
     works once.
- **Recovery:** anyone signed in may download the recovery envelope; it is
  useless without the phrase. To store its own envelope afterwards, a device
  must present the key check.
- **Remote logout:** revokes the device, deletes its envelope, ends pairing,
  and publishes `DeviceRevokedV1`. Identity ends that device's sessions.
- **Step-up for remote logout:** `DELETE /v1/devices/{id}` needs a step-up
  token: `POST /v1/auth/step-up` verifies a passkey assertion of the same
  account and returns a two-minute, DPoP-bound access token with a `sua`
  claim (no refresh token). Devices refuses with 403 `step_up_required`
  without a fresh one. Accounts with no passkey cannot remove devices yet.
  A mobile-number (SMS code) sign-in is such an account until a passkey is
  added (ADR 0004 amendment): the apps offer one right after sign-in, and the
  Devices page tells a phone-only user to add a passkey or remove the device
  from another device that has one, instead of showing a passkey error.
- **Every call:** the device must be registered, not revoked, and its token
  bound to the DPoP key it registered with.
- **Account deletion:** the purge is scheduled for the end of the cooling-off
  on a durable queue, then `UserDataPurgedV1` reports back (the saga).

## Consequences
- With every row of this database, nobody can decrypt a user's data.
- Losing every device and the recovery phrase loses the data. This is by
  design (§6).
- The app does the cryptography (libsodium; Argon2id for the phrase). The
  Khazana Online client slices (`mobile-online/`, `webapp-online/`) implement
  it (ADR 0007), and the independent cryptography review
  covers it.
- **Open items:**
  - **No key rotation on revoke.** Revoking deletes the device's envelope
    and sessions, but the DEK is not rotated or re-wrapped: the ADR defines
    no rotation, and `key_version` is fixed at 1. A removed device that
    already extracted the DEK, or downloaded ciphertext, can still decrypt
    data it holds, and data written later under the same DEK, if it ever
    obtains ciphertext (it cannot authenticate to fetch any). Rotation
    (new DEK, re-wrap for remaining devices and recovery, re-encrypt
    records) needs its own ADR.
  - Biometric step-up before approving a pairing or revoking a device is
    enforced on the device (the key is biometric-gated), not provable here.
  - Push alerts to other devices on a new device arrive with Notification.
