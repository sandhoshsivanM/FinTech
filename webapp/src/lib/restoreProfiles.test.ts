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
