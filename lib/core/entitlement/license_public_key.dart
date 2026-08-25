/// The Ed25519 public key that licence keys are verified against.
///
/// Public by definition — it verifies signatures, it cannot make them. The
/// matching **private** key never enters this repository, never enters CI, and
/// lives in a password manager with a paper backup. Losing it means no customer
/// can ever be issued a replacement key; leaking it means anyone can mint
/// licences.
///
/// Keys are minted offline in batches by `tool/mint_licenses.dart` and uploaded
/// to the merchant of record as a code list, so the signer runs on a laptop and
/// never as a service. That is what keeps "no server" literally true rather
/// than nearly true.
///
/// ## Rotation
///
/// If this pair is ever compromised, a future major version ships a new public
/// key here and re-issues keys to existing customers through the merchant's
/// order lookup. There is deliberately **no revocation list**: a fetched one
/// needs a server, and a baked-in one goes stale and eventually locks out an
/// honest buyer — strictly worse than the piracy it would prevent.
///
/// ## Replacing the placeholder
///
/// ```
///   dart run tool/mint_licenses.dart --generate-keypair
/// ```
///
/// prints a fresh pair, writes the private half nowhere, and gives you the 32
/// bytes to paste below. Until that is done, every licence key is refused —
/// which is the correct behaviour for a placeholder, and is asserted by
/// [kLicensePublicKeyIsPlaceholder].
const List<int> kLicensePublicKey = <int>[
  92, 78, 223, 75, 9, 32, 115, 138,
  18, 3, 165, 203, 226, 17, 55, 42,
  230, 124, 91, 3, 211, 72, 97, 136,
  50, 197, 152, 60, 121, 234, 178, 144,
];

/// True while [kLicensePublicKey] is still the all-zero placeholder.
///
/// The Pro screen reads this so a direct build that has not been given a real
/// key says so plainly, instead of telling a paying customer their valid key is
/// invalid.
bool get kLicensePublicKeyIsPlaceholder =>
    kLicensePublicKey.every((b) => b == 0);
