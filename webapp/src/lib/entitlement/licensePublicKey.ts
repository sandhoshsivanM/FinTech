/**
 * The Ed25519 public key licence keys are verified against.
 *
 * MUST be byte-identical to `kLicensePublicKey` in
 * `lib/core/entitlement/license_public_key.dart`. A mismatch means a key that
 * works in one client and is refused by the other, which is the worst possible
 * place for the two to disagree.
 *
 * Public by definition — it verifies signatures and cannot make them. The
 * private half never enters this repository or CI; it lives in a password
 * manager with a paper backup, and keys are minted offline in batches by
 * `dart run tool/mint_licenses.dart`.
 */
export const LICENSE_PUBLIC_KEY = new Uint8Array([
  92, 78, 223, 75, 9, 32, 115, 138,
  18, 3, 165, 203, 226, 17, 55, 42,
  230, 124, 91, 3, 211, 72, 97, 136,
  50, 197, 152, 60, 121, 234, 178, 144,
]);

/**
 * True while the key above is still the placeholder.
 *
 * The Pro page reads this so a build that has not been given a real key says so
 * plainly, rather than telling a paying customer their valid key is invalid.
 */
export const LICENSE_KEY_IS_PLACEHOLDER =
  LICENSE_PUBLIC_KEY.every((b) => b === 0);
