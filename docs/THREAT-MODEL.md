# Threat model

Khazana's security model is **applied client-side cryptography**, not web-auth
or infrastructure security. There is no server, no account, and no network trust
to reason about — the whole model is "keep on-device data unreadable without the
user's PIN."

## Assets

- The user's financial ledger: transactions, holdings, liabilities, goals,
  insurance, budgets, net-worth history.
- Derived analytics (health score, net worth, tax estimates).
- Encrypted backup files the user exports.

## Trust boundaries

- **On-device only.** All data is encrypted at rest and decrypted in memory
  while the vault is unlocked. Nothing is sent to a server (there is none).
- **The PIN is the root of trust.** It derives the key; it is never stored.
- The **only** outbound network traffic is *opt-in* market-data fetches
  (`market_data.dart`), which carry no personal data.

## What the crypto defends against

| Threat | Defense | Evidence |
|---|---|---|
| Attacker copies the SQLite DB / IndexedDB at rest | AES-256 at rest; data is ciphertext without the key | `encrypted_executor.dart`, `crypto.ts` |
| Brute-forcing the PIN into the key | PBKDF2-HMAC-SHA256 @ 600,000 iterations, 32-byte salt | `key_derivation_service.dart` |
| Tampering with ciphertext / backups | AES-GCM authenticated encryption (auth-tag verified) | `crypto.ts`, `backup_service.dart` |
| Forged / corrupt backup restore | magic header + schema check + SHA-256 + GCM (6-step validate) | `backup_service.dart` |
| Key lingering in memory after use | key purged on lock (inactivity + app-background) | `vault_state.dart`, `AutoLock.tsx` |
| Sensitive values leaking into logs | log sanitizer redacts amounts / merchants | `log_sanitizer.dart` |
| Shoulder-surfing in public | "ghost mode" masks all monetary values | web store `ghost`, Flutter ghost toggle |

## Key lifecycle

1. **Derive** — PIN + salt → 32-byte key via PBKDF2 (600k iters). On mobile this
   runs off the UI isolate (`Isolate.run`); on web it uses Web Crypto.
2. **Use** — mobile opens SQLCipher with the key as the first statement,
   followed by a probe query that **fast-fails** on a wrong key. Web derives an
   AES-GCM `CryptoKey` (non-extractable) and encrypts each record with a fresh
   12-byte IV.
3. **Store** — only the **salt** is stored (Keychain/Keystore on mobile,
   IndexedDB on web). The key itself is never persisted in plaintext.
4. **Purge** — on lock (inactivity or backgrounding) the in-memory key is
   cleared; the vault returns to the locked state and routing redirects to the
   unlock gate.

## What it does NOT defend against (out of scope)

- **A compromised device** — root/jailbreak, a keylogger, or malware running as
  the user can observe the PIN or decrypted memory while unlocked.
- **A forgotten PIN** — there is no recovery/escrow. No PIN ⇒ no data. This is a
  deliberate zero-knowledge trade-off, not a bug.
- **Coercion** — the model assumes the device owner is the legitimate user.
- **Server-side concerns** (JWT/OAuth/RBAC, CORS/CSRF, transport security) —
  **N/A**, because there is no server or endpoints.
- **Side-channel / timing attacks** on the underlying crypto libraries — relied
  upon as provided by SQLCipher / Web Crypto / pointycastle.

## Notes for reviewers

- Money never touches `double`; FTS query strings are escaped before hitting
  SQLite (`_toFtsQuery`); React escapes output by default and the codebase uses
  no `dangerouslySetInnerHTML`.
- The biggest *availability* risk is the no-recovery PIN model — communicated to
  the user, by design.
