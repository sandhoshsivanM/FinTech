// The Free/Pro split on the web client, checked against the SAME contract the
// Flutter client is checked against (`docs/pro-gates.json`).
//
// The half that matters most is the negative half. A comment saying "never gate
// backup" is worth nothing in two years; a test that fails the build is worth
// something.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  gateFor, gateForImport, gateForProfile,
  ALWAYS_FREE, PRO_FEATURES,
  FREE_PROFILES, FREE_COMMITTED_IMPORTS,
  type ProFeature,
} from './gates';
import { FREE, type Entitlement } from './entitlement';

const spec = JSON.parse(
  readFileSync(join(__dirname, '../../../../docs/pro-gates.json'), 'utf8'),
) as {
  features: Record<string, { tier: string }>;
  alwaysFree: { features: string[] };
  countedAllowances: Record<string, { free: number }>;
};

// JSON has no comments, so the spec explains itself with `$`-prefixed keys.
const features = Object.fromEntries(
  Object.entries(spec.features).filter(([k]) => !k.startsWith('$')),
);

const PRO: Entitlement = { isPro: true, source: 'licenseKey' };

describe('the promises that must never be broken', () => {
  test('every always-free feature is allowed on the free tier', () => {
    for (const f of ALWAYS_FREE) {
      expect(
        gateFor(f, FREE).allowed,
        `${f} must never be gated — backup, restore, a full CSV dump, ` +
        `erase-all-data and the lock are promises in writing. Nothing that ` +
        `gets a user's own data out of the app is ever behind a payment.`,
      ).toBe(true);
    }
  });

  test('always-free reports alwaysFree, not merely includedInFree', () => {
    // The distinction is load-bearing: includedInFree is a product decision
    // that could reasonably change; alwaysFree is a commitment that cannot.
    for (const f of ALWAYS_FREE) {
      expect(gateFor(f, FREE).reason).toBe('alwaysFree');
    }
  });

  test('nothing is both always-free and Pro', () => {
    for (const f of ALWAYS_FREE) expect(PRO_FEATURES.has(f)).toBe(false);
  });

  test('the ledger is uncapped — there is no transaction limit', () => {
    // A capped ledger reports wrong totals, and net worth, budgets and the
    // health score all inherit the lie.
    expect(gateFor('manualEntry', FREE).allowed).toBe(true);
    expect(FREE_PROFILES).toBe(1);
    expect(FREE_COMMITTED_IMPORTS).toBe(1);
  });
});

describe('agreement with docs/pro-gates.json', () => {
  test('the tier of every feature matches the spec', () => {
    for (const [name, entry] of Object.entries(features)) {
      const allowed = gateFor(name as ProFeature, FREE).allowed;
      expect(
        allowed,
        `${name}: spec says "${entry.tier}" but the gate ` +
        `${allowed ? 'allows' : 'denies'} it on the free tier`,
      ).toBe(entry.tier === 'free');
    }
  });

  test('the always-free list matches the spec exactly', () => {
    expect([...ALWAYS_FREE].sort()).toEqual([...spec.alwaysFree.features].sort());
  });

  test('every spec feature is known to this client', () => {
    const known = new Set<string>([
      ...ALWAYS_FREE, ...PRO_FEATURES,
      // Free-but-ordinary features are neither set; assert via the gate.
    ]);
    for (const name of Object.keys(features)) {
      const isKnown = known.has(name) || gateFor(name as ProFeature, FREE).reason === 'includedInFree';
      expect(isKnown, `${name} is in the spec but unknown to gates.ts`).toBe(true);
    }
  });

  test('the counted allowances match the spec', () => {
    expect(FREE_PROFILES).toBe(spec.countedAllowances.profiles.free);
    expect(FREE_COMMITTED_IMPORTS).toBe(spec.countedAllowances.committedImports.free);
  });
});

describe('Pro unlocks everything', () => {
  test('no Pro feature is denied to a Pro entitlement', () => {
    for (const f of PRO_FEATURES) expect(gateFor(f, PRO).allowed).toBe(true);
  });

  test('Pro features report unlocked rather than free', () => {
    expect(gateFor('taxCentre', PRO).reason).toBe('unlocked');
  });
});

describe('free tier', () => {
  test('Pro features are denied with needsPro', () => {
    for (const f of PRO_FEATURES) {
      const d = gateFor(f, FREE);
      expect(d.allowed, `${f} should need Pro`).toBe(false);
      expect(d.reason).toBe('needsPro');
    }
  });

  test('ordinary free features are included, not "always free"', () => {
    expect(gateFor('dashboard', FREE).reason).toBe('includedInFree');
  });
});

describe('counted allowances', () => {
  test('the first import is free, the second is not', () => {
    expect(gateForImport(FREE, 0).allowed).toBe(true);

    const second = gateForImport(FREE, 1);
    expect(second.allowed).toBe(false);
    // Not `needsPro`: it WAS available a moment ago. Telling someone who just
    // used their free import that it "is a Pro feature" is untrue and reads as
    // a bait-and-switch.
    expect(second.reason).toBe('allowanceUsed');
  });

  test('Pro imports are unlimited', () => {
    expect(gateForImport(PRO, 99).allowed).toBe(true);
  });

  test('the first profile is free, the second is not', () => {
    expect(gateForProfile(FREE, 0).allowed).toBe(true);
    expect(gateForProfile(FREE, 1).reason).toBe('allowanceUsed');
    expect(gateForProfile(PRO, 12).allowed).toBe(true);
  });
});
