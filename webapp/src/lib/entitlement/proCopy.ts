/**
 * Everything the paywall says — the twin of `lib/features/pro/pro_copy.dart`.
 *
 * Both clients must make the same promises about what money buys. A user who
 * reads one page and pays on the other has been told two different things, and
 * only one of them can be true.
 */
export const PRO_COPY = {
  title: 'Khazana Pro',

  tagline:
    'One payment. Yours forever. No subscription, no account, no server.',

  priceFallback: '₹999 one-time',

  /** Merchant of record's hosted checkout. An MoR owns Indian GST and EU VAT. */
  checkoutUrl: 'https://khazana-app.netlify.app/#buy',

  benefits: [
    {
      title: 'Tax Centre',
      body:
        'Short- and long-term capital gains, realised gains for the year, and ' +
        'what a position would cost you if you sold it today. Replaces an ' +
        'afternoon with a spreadsheet, every year.',
    },
    {
      title: 'Real portfolio analysis',
      body:
        'XIRR, benchmark comparison, movers, and profit and loss broken down ' +
        'six ways. Your holdings and their value stay free — this is the ' +
        'analysis on top.',
    },
    {
      title: 'Import your statements',
      body:
        'Bank and broker statements parsed, deduplicated and previewed before ' +
        'anything is written. Your first import is free, so you can prove it ' +
        'works on your own bank before paying.',
    },
    {
      title: 'Forecast and reconcile',
      body:
        'Where your money is heading, and a workflow for matching what you ' +
        'recorded against what actually happened.',
    },
    {
      title: 'Household profiles',
      body: 'Separate vaults for a partner or a business, in one app.',
    },
    {
      title: 'Full history and reports',
      body:
        'Every reporting window, score history over time, and presentation-' +
        'ready exports for whoever does your taxes.',
    },
  ],

  /** The promise that makes the free tier trustworthy. */
  freeForeverNote:
    'Free forever, with or without Pro: unlimited transactions, accounts, ' +
    'budgets, goals and holdings — there are no limits on your ledger — plus ' +
    'encrypted backup and restore, a full CSV export, and erase-all-data. ' +
    'Nothing that gets your own data out of Khazana is ever behind a payment.',

  /**
   * The cross-ecosystem boundary, disclosed BEFORE payment.
   *
   * Linking a desktop licence to an App Store purchase needs a server that
   * knows who you are, which this product does not have. Saying so here costs a
   * few sales; letting someone find out after paying costs a refund and a
   * review, and deserves to.
   */
  ecosystemNoteDirect:
    'This licence covers the desktop and web app on your own devices. The ' +
    'iPhone, iPad and Mac apps are sold through the App Store separately — ' +
    'linking the two would need a server that knows who you are, and Khazana ' +
    'does not have one.',

  licenceTitle: 'I have a licence key',
  licenceHint: 'KHAZ1.…',
  licenceHelp:
    'The key was emailed to you when you bought Khazana. It is checked on this ' +
    'device and never sent anywhere.',
} as const;
