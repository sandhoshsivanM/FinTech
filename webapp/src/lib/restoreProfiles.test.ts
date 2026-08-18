// Cross-device restore. Records are profile-scoped and profile ids are random
// per vault, so a verbatim import lands the data under an id the destination
// has never seen: "Restored 367 records" followed by an empty Transactions
// screen. These pin the reconciliation that prevents it.
import { describe, expect, test } from 'vitest';
import type { Profile } from './types';

/** Mirrors reload()'s profile-scoped read. */
const inProfile = (r: { profileId?: string }, active: string, dflt: string) =>
  (r.profileId ?? dflt) === active;

const sameProfile = (a: Profile, b: Profile) =>
  a.name.trim().toLowerCase() === b.name.trim().toLowerCase() && a.kind === b.kind;

/** Mirrors importBackup's remap. */
function buildRemap(incoming: Profile[], local: Profile[], active: string) {
  const map = new Map<string, string>();
  const absorbed = new Set<string>();
  for (const p of incoming) {
    const match = local.find((l) => sameProfile(l, p));
    if (match) { map.set(p.id, match.id); absorbed.add(p.id); }
  }
  const known = new Set(local.map((p) => p.id));
  return {
    absorbed,
    remap: (pid?: string) => {
      if (!pid) return pid;
      const m = map.get(pid);
      if (m) return m;
      if (known.has(pid)) return pid;
      if (incoming.some((p) => p.id === pid)) return pid;
      return active;
    },
  };
}

const prof = (id: string, name: string, kind: Profile['kind'] = 'self'): Profile =>
  ({ id, vaultId: 'v', name, kind, createdAt: 0 });

describe('restoring a backup onto a second device', () => {
  const mac = prof('p-mac-abc', 'Personal');
  const phone = prof('p-phone-xyz', 'Personal');

  test('records written verbatim would be invisible — the bug', () => {
    // 367 records restored, nothing on screen.
    const rec = { id: 't1', profileId: mac.id };
    expect(inProfile(rec, phone.id, phone.id)).toBe(false);
  });

  test('the Mac profile is matched to the local one by name and kind', () => {
    const { remap } = buildRemap([mac], [phone], phone.id);
    expect(remap(mac.id)).toBe(phone.id);
  });

  test('remapped records are visible on the destination', () => {
    const { remap } = buildRemap([mac], [phone], phone.id);
    const rec = { id: 't1', profileId: remap(mac.id) };
    expect(inProfile(rec, phone.id, phone.id)).toBe(true);
  });

  test('no duplicate profile row is written for an absorbed profile', () => {
    const { absorbed } = buildRemap([mac], [phone], phone.id);
    expect(absorbed.has(mac.id)).toBe(true);
  });

  test('a genuinely different profile keeps its own identity', () => {
    // Spouse data must not be folded into Personal.
    const spouse = prof('p-mac-spouse', 'Spouse', 'spouse');
    const { remap, absorbed } = buildRemap([mac, spouse], [phone], phone.id);
    expect(remap(spouse.id)).toBe(spouse.id);
    expect(absorbed.has(spouse.id)).toBe(false);
  });

  test('kind is part of identity, so two same-named profiles do not merge', () => {
    const business = prof('p-mac-biz', 'Personal', 'business');
    const { remap } = buildRemap([business], [phone], phone.id);
    expect(remap(business.id)).toBe(business.id);
  });

  test('an old backup with no profile records still lands somewhere visible', () => {
    const { remap } = buildRemap([], [phone], phone.id);
    const rec = { id: 't1', profileId: remap('p-unknown-legacy') };
    expect(inProfile(rec, phone.id, phone.id)).toBe(true);
  });

  test('records with no profileId keep falling back to the default', () => {
    const { remap } = buildRemap([mac], [phone], phone.id);
    expect(remap(undefined)).toBeUndefined();
    expect(inProfile({ profileId: undefined }, phone.id, phone.id)).toBe(true);
  });

  test('restoring into the same device is a no-op for ids', () => {
    const { remap } = buildRemap([phone], [phone], phone.id);
    expect(remap(phone.id)).toBe(phone.id);
  });
});

/**
 * Mirrors the whole of importBackup's mutation build, deletes included.
 *
 * The tests above model remapping alone, and every one of them assumes the
 * local profile is still there to be remapped onto. Under `mode: 'replace'` —
 * the default, and the only mode the UI uses — it is not: the clear pass
 * deletes every local profile row first. That is the gap this models.
 *
 * @returns the profile ids that still have a row, and the restored records.
 */
function planRestore(
  incoming: Profile[],
  local: Profile[],
  active: string,
  records: { id: string; profileId?: string }[],
  mode: 'replace' | 'merge' = 'replace',
) {
  const { remap, absorbed } = buildRemap(incoming, local, active);

  const profileRows = new Map<string, Profile>(local.map((p) => [p.id, p]));
  if (mode === 'replace') profileRows.clear();               // the clear pass
  for (const p of incoming) {
    if (absorbed.has(p.id)) continue;                        // no duplicate row
    profileRows.set(p.id, p);
  }
  // What the fix adds: a local profile the records still point at is written
  // back, because the clear pass just deleted the row those ids refer to.
  if (mode === 'replace') {
    const referenced = new Set(records.map((r) => remap(r.profileId)).filter(Boolean));
    for (const p of local) if (referenced.has(p.id) && !profileRows.has(p.id)) profileRows.set(p.id, p);
  }

  return {
    profileIds: [...profileRows.keys()],
    records: records.map((r) => ({ ...r, profileId: remap(r.profileId) })),
  };
}

/** Mirrors reload()'s profile seeding and active-profile fallback. */
function afterReload(profileIds: string[], previouslyActive: string) {
  // "Profiles: seed a default if none exist" — a brand new id, matching nothing.
  const ids = profileIds.length > 0 ? profileIds : ['p-freshly-seeded'];
  const dflt = ids[0];
  const active = ids.includes(previouslyActive) ? previouslyActive : dflt;
  return { active, dflt };
}

describe('a replace must not delete the profile the records were remapped onto', () => {
  // "Restored 367 records" and every screen still empty — the same symptom as
  // the verbatim-id bug above, arriving by the opposite route. Remapping put
  // the records on the local profile's id, and then the clear pass deleted the
  // row that id names: absorbed incoming profiles are skipped on the way back
  // in, so nothing rewrites it. reload() then finds no profiles at all, seeds
  // a fresh one, and filters the entire restore off the screen.
  const mac = prof('p-mac-abc', 'Personal');
  const phone = prof('p-phone-xyz', 'Personal');

  test('the absorbed profile still has a row after the clear pass', () => {
    const { profileIds } = planRestore([mac], [phone], phone.id, [{ id: 't1', profileId: mac.id }]);
    expect(profileIds).toContain(phone.id);
  });

  test('the restored records are visible, not orphaned', () => {
    const plan = planRestore([mac], [phone], phone.id, [{ id: 't1', profileId: mac.id }]);
    const { active, dflt } = afterReload(plan.profileIds, phone.id);
    expect(plan.records.every((r) => inProfile(r, active, dflt))).toBe(true);
  });

  test('the profile in front of the user stays selected', () => {
    const plan = planRestore([mac], [phone], phone.id, [{ id: 't1', profileId: mac.id }]);
    expect(afterReload(plan.profileIds, phone.id).active).toBe(phone.id);
  });

  test('an old backup carrying no profile rows lands somewhere visible', () => {
    // remap falls back to activeProfileId — a local id, whose row the clear
    // pass also deleted. Same orphaning, no absorption involved.
    const plan = planRestore([], [phone], phone.id, [{ id: 't1', profileId: 'p-legacy' }]);
    const { active, dflt } = afterReload(plan.profileIds, phone.id);
    expect(plan.records.every((r) => inProfile(r, active, dflt))).toBe(true);
  });

  test('a local profile nothing points at is still cleared — replace stays replace', () => {
    const business = prof('p-phone-biz', 'Business', 'business');
    const { profileIds } = planRestore(
      [mac], [phone, business], phone.id, [{ id: 't1', profileId: mac.id }],
    );
    expect(profileIds).not.toContain(business.id);
  });

  test('a genuinely new profile from the backup is written', () => {
    const spouse = prof('p-mac-spouse', 'Spouse', 'spouse');
    const { profileIds } = planRestore(
      [mac, spouse], [phone], phone.id, [{ id: 't1', profileId: spouse.id }],
    );
    expect(profileIds).toContain(spouse.id);
  });

  test('a merge leaves the local rows alone', () => {
    const { profileIds } = planRestore(
      [mac], [phone], phone.id, [{ id: 't1', profileId: mac.id }], 'merge',
    );
    expect(profileIds).toContain(phone.id);
  });
});
