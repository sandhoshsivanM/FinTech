/**
 * The Free/Pro map — the TypeScript twin of
 * `lib/domain/entitlement/feature_gate.dart`.
 *
 * Both are checked against `docs/pro-gates.json` by their own test suites, so
 * the two clients cannot come to disagree about what money buys.
 */
import type { Entitlement } from './entitlement';

/** Every capability the split has an opinion about. Names match the Dart enum. */
export type ProFeature =
  // Always free — never gate these.
  | 'backupExport'
  | 'backupRestore'
  | 'csvDumpAll'
  | 'eraseAllData'
  | 'errorLogExport'
  | 'pinLock'
  | 'biometrics'
  | 'autoLock'
  | 'ghostMode'
  | 'themes'
  | 'accents'
  | 'diagnostics'
  | 'reminders'
  | 'manualEntry'
  | 'manualPriceEntry'
  // Free, but ordinary product decisions.
  | 'dashboard'
  | 'healthScore'
  | 'portfolioValue'
  | 'allocationDonut'
  | 'calendarLedger'
  | 'safetyNet'
  | 'liabilities'
  | 'insurance'
  | 'goals'
  | 'budget'
  | 'recurringRules'
  | 'search'
  | 'reportsShortWindow'
  // Pro.
  | 'sectorPnlBreakdown'
  | 'portfolioAnalytics'
  | 'dividends'
  | 'watchlist'
  | 'taxCentre'
  | 'marketsAndNews'
  | 'priceRefresh'
  | 'bankStatementImport'
  | 'brokerLotImport'
  | 'autoCapture'
  | 'forecast'
  | 'reconcile'
  | 'multiProfile'
  | 'multiVault'
  | 'reportsLongWindow'
  | 'scoreHistory'
  | 'formattedExports';

/**
 * Never gated, in any tier, ever.
 *
 * The machine-readable form of the promise: nothing that gets a user's own data
 * out of the app, and nothing that keeps it safe, is behind a payment.
 * `gates.test.ts` asserts every member resolves to allowed on the free tier, so
 * a future change that tries to sell one fails the build.
 */
export const ALWAYS_FREE: ReadonlySet<ProFeature> = new Set([
  'backupExport',
  'backupRestore',
  'csvDumpAll',
  'eraseAllData',
  'errorLogExport',
  'pinLock',
  'biometrics',
  'autoLock',
  'ghostMode',
  'themes',
  'accents',
  'diagnostics',
  'reminders',
  'manualEntry',
  'manualPriceEntry',
]);

export const PRO_FEATURES: ReadonlySet<ProFeature> = new Set([
  'sectorPnlBreakdown',
  'portfolioAnalytics',
  'dividends',
  'watchlist',
  'taxCentre',
  'marketsAndNews',
  'priceRefresh',
  'bankStatementImport',
  'brokerLotImport',
  'autoCapture',
  'forecast',
  'reconcile',
  'multiProfile',
  'multiVault',
  'reportsLongWindow',
  'scoreHistory',
  'formattedExports',
]);

export type GateReason =
  | 'alwaysFree'
  | 'includedInFree'
  | 'unlocked'
  | 'needsPro'
  /** A counted allowance is spent. Different copy: it WAS available a moment
   *  ago, and calling it "a Pro feature" now reads as a bait-and-switch. */
  | 'allowanceUsed';

export interface GateDecision {
  allowed: boolean;
  reason: GateReason;
}

/**
 * The only place that answers "can this user use this feature".
 *
 * The always-free check runs FIRST, before the entitlement is even read. The
 * ordering is the enforcement: it makes it structurally impossible for a future
 * change to the Pro logic below to accidentally gate a promised-free feature.
 */
export function gateFor(
  feature: ProFeature,
  entitlement: Entitlement,
): GateDecision {
  if (ALWAYS_FREE.has(feature)) return { allowed: true, reason: 'alwaysFree' };
  if (entitlement.isPro) return { allowed: true, reason: 'unlocked' };
  return PRO_FEATURES.has(feature)
    ? { allowed: false, reason: 'needsPro' }
    : { allowed: true, reason: 'includedInFree' };
}

export function isAllowed(
  feature: ProFeature,
  entitlement: Entitlement,
): boolean {
  return gateFor(feature, entitlement).allowed;
}

/**
 * Counted allowances — the only two limits in the product.
 *
 * Note what is absent: transactions, accounts, budgets, goals, holdings. The
 * ledger is uncapped in every tier, because a capped ledger reports wrong
 * totals and every derived figure inherits the lie.
 */
export const FREE_PROFILES = 1;
export const FREE_COMMITTED_IMPORTS = 1;

export function gateForImport(
  entitlement: Entitlement,
  used: number,
): GateDecision {
  if (entitlement.isPro) return { allowed: true, reason: 'unlocked' };
  return used < FREE_COMMITTED_IMPORTS
    ? { allowed: true, reason: 'includedInFree' }
    : { allowed: false, reason: 'allowanceUsed' };
}

export function gateForProfile(
  entitlement: Entitlement,
  existing: number,
): GateDecision {
  if (entitlement.isPro) return { allowed: true, reason: 'unlocked' };
  return existing < FREE_PROFILES
    ? { allowed: true, reason: 'includedInFree' }
    : { allowed: false, reason: 'allowanceUsed' };
}
