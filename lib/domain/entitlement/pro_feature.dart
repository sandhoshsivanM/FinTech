/// Every capability the Free/Pro split has an opinion about.
///
/// An enum, never a string: a typo in `gateFor('portfolioAnaltyics')` would
/// silently unlock a Pro feature, and nothing would notice. The names match the
/// keys in `docs/pro-gates.json` exactly, and a test asserts that — the JSON is
/// the shared contract with the web client, this enum is how Dart spells it.
enum ProFeature {
  // --- Always free. Never gate these. See kAlwaysFree below. ---------------
  backupExport,
  backupRestore,
  csvDumpAll,
  eraseAllData,
  errorLogExport,
  pinLock,
  biometrics,
  autoLock,
  ghostMode,
  themes,
  accents,
  diagnostics,
  reminders,
  manualEntry,
  manualPriceEntry,

  // --- Free, but not load-bearing promises ---------------------------------
  dashboard,
  healthScore,
  portfolioValue,
  allocationDonut,
  calendarLedger,
  safetyNet,
  liabilities,
  insurance,
  goals,
  budget,
  recurringRules,
  search,
  reportsShortWindow,

  // --- Pro -----------------------------------------------------------------
  sectorPnlBreakdown,
  portfolioAnalytics,
  dividends,
  watchlist,
  taxCentre,
  marketsAndNews,
  priceRefresh,
  bankStatementImport,
  brokerLotImport,
  autoCapture,
  forecast,
  reconcile,
  multiProfile,
  multiVault,
  reportsLongWindow,
  scoreHistory,
  formattedExports,
}

/// Features that must never be gated, in any tier, ever.
///
/// This is the machine-readable form of the promise in `docs/pro-gates.json`:
/// nothing that gets a user's own data out of the app, and nothing that keeps
/// it safe, is ever behind a payment. `feature_gate_test.dart` asserts every
/// member of this set resolves to allowed even for a Free entitlement, so a
/// future change that tries to sell one of them fails the build rather than
/// shipping.
const Set<ProFeature> kAlwaysFree = {
  ProFeature.backupExport,
  ProFeature.backupRestore,
  ProFeature.csvDumpAll,
  ProFeature.eraseAllData,
  ProFeature.errorLogExport,
  ProFeature.pinLock,
  ProFeature.biometrics,
  ProFeature.autoLock,
  ProFeature.ghostMode,
  ProFeature.themes,
  ProFeature.accents,
  ProFeature.diagnostics,
  ProFeature.reminders,
  ProFeature.manualEntry,
  ProFeature.manualPriceEntry,
};

/// The Pro half. Everything not listed here and not in [kAlwaysFree] is free.
const Set<ProFeature> kProFeatures = {
  ProFeature.sectorPnlBreakdown,
  ProFeature.portfolioAnalytics,
  ProFeature.dividends,
  ProFeature.watchlist,
  ProFeature.taxCentre,
  ProFeature.marketsAndNews,
  ProFeature.priceRefresh,
  ProFeature.bankStatementImport,
  ProFeature.brokerLotImport,
  ProFeature.autoCapture,
  ProFeature.forecast,
  ProFeature.reconcile,
  ProFeature.multiProfile,
  ProFeature.multiVault,
  ProFeature.reportsLongWindow,
  ProFeature.scoreHistory,
  ProFeature.formattedExports,
};

/// Counted allowances — the only two limits in the product.
///
/// Note what is NOT here: transactions, accounts, budgets, goals, holdings,
/// recurring rules. The ledger is uncapped in every tier, because a capped
/// ledger reports wrong totals, and an app that quietly lies about your net
/// worth to sell an upgrade deserves the review it gets.
class ProAllowances {
  const ProAllowances._();

  /// Profiles (web) / vaults (Flutter) on the free tier.
  static const int freeProfiles = 1;

  /// Committed bank- and broker-statement imports on the free tier, lifetime.
  ///
  /// One, not zero: the free user gets a full preview, full dedup and a working
  /// undo on their own real statement. Proving the parser handles their bank is
  /// the moment they decide whether Pro is worth paying for, and no screenshot
  /// does that job.
  static const int freeCommittedImports = 1;
}
