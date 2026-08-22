/// Everything the paywall says, in one place.
///
/// Twinned with `webapp/src/lib/entitlement/proCopy.ts`. Both clients must make
/// the same promises about what money buys — a user who reads one page and pays
/// on the other has been told two different things, and only one of them can be
/// true.
class ProCopy {
  const ProCopy._();

  static const String title = 'Khazana Pro';

  static const String tagline =
      'One payment. Yours forever. No subscription, no account, no server.';

  /// Shown when the store has not returned a localised price yet. Never a
  /// number we formatted ourselves — the store's own string is tax-inclusive
  /// and correct for the user's region, and ours would be wrong in most of the
  /// world.
  static const String priceFallback = '₹999 one-time';

  /// The pitch, in the order a buyer weighs it.
  static const List<({String title, String body})> benefits = [
    (
      title: 'Tax Centre',
      body:
          'Short- and long-term capital gains, realised gains for the year, and '
          'what a position would cost you if you sold it today. Replaces an '
          'afternoon with a spreadsheet, every year.',
    ),
    (
      title: 'Real portfolio analysis',
      body:
          'XIRR, benchmark comparison, movers, and profit and loss broken down '
          'six ways. Your holdings and their value stay free — this is the '
          'analysis on top.',
    ),
    (
      title: 'Import your statements',
      body:
          'Bank and broker statements parsed, deduplicated and previewed before '
          'anything is written. Your first import is free, so you can prove it '
          'works on your own bank before paying.',
    ),
    (
      title: 'Automatic capture',
      body:
          'Bank notifications read on the device and turned into transactions '
          'you approve. Nothing is transmitted.',
    ),
    (
      title: 'Household profiles',
      body: 'Separate vaults for a partner or a business, in one app.',
    ),
    (
      title: 'Full history and reports',
      body:
          'Every reporting window, score history over time, and presentation-'
          'ready exports for whoever does your taxes.',
    ),
  ];

  /// The promise that makes the free tier trustworthy, stated on the paywall
  /// itself rather than buried in the terms.
  static const String freeForeverNote =
      'Free forever, with or without Pro: unlimited transactions, accounts, '
      'budgets, goals and holdings — there are no limits on your ledger — plus '
      'encrypted backup and restore, a full CSV export, and erase-all-data. '
      'Nothing that gets your own data out of Khazana is ever behind a payment.';

  /// The cross-ecosystem boundary. Disclosed BEFORE payment.
  ///
  /// Linking a Play or App Store purchase to the desktop app needs a server
  /// that knows who you are, which this product does not have. Saying so here
  /// costs a few sales; letting someone discover it after paying costs a refund
  /// and a review, and deserves to.
  static const String ecosystemNoteStore =
      'Your purchase covers iPhone, iPad and Mac under the same Apple ID. The '
      'desktop and web app is sold separately — linking the two would need a '
      'server that knows who you are, and Khazana does not have one.';

  static const String ecosystemNoteDirect =
      'This licence covers the desktop and web app on your own devices. The '
      'iPhone, iPad and Mac apps are sold through the App Store separately — '
      'linking the two would need a server that knows who you are, and Khazana '
      'does not have one.';

  static const String restoreTitle = 'Restore purchases';
  static const String restoreBody =
      'Already bought Khazana Pro? Restore it here — no account needed.';

  static const String licenceTitle = 'I have a licence key';
  static const String licenceHint = 'KHAZ1.…';
  static const String licenceHelp =
      'The key was emailed to you when you bought Khazana. It works offline and '
      'is never sent anywhere.';

  // --- Outcomes -----------------------------------------------------------

  static const String restoredOk = 'Khazana Pro restored.';
  static const String restoreNothingFound =
      'No purchase found on this account. If you bought Khazana with a '
      'different Apple ID or Google account, sign in with that one and try '
      'again.';
  static const String restoreUnavailable =
      'Could not reach the store. Your existing purchase is unaffected — try '
      'again when you are back online.';

  static const String purchaseOk = 'Thank you. Khazana Pro is unlocked.';

  static const String licenceOk = 'Licence accepted. Khazana Pro is unlocked.';
  static const String licenceMalformed =
      'That does not look like a Khazana licence key. Copy the whole line, '
      'including the KHAZ1. prefix.';
  static const String licenceBadSignature =
      'That key could not be verified. Check it was copied in full, and that it '
      'is the key for this product.';
  static const String licenceWrongProduct =
      'That is a valid key, but for a different product.';
  static const String licenceUnsupported =
      'That key was issued for a newer version of Khazana. Please update the '
      'app.';

  /// Shown on a direct build that has not been given a real public key yet.
  /// Better to admit the build is unfinished than to tell a paying customer
  /// their valid key is invalid.
  static const String licenceNotConfigured =
      'This build cannot check licence keys yet. Please contact support.';
}
