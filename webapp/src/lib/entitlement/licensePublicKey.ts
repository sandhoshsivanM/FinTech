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
  // PLACEHOLDER — all zeroes. Replace before the first direct sale.
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0,
]);

/**
 * True while the key above is still the placeholder.
 *
 * The Pro page reads this so a build that has not been given a real key says so
 * plainly, rather than telling a paying customer their valid key is invalid.
 */
export const LICENSE_KEY_IS_PLACEHOLDER =
  LICENSE_PUBLIC_KEY.every((b) => b === 0);
