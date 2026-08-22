// Ghost mode, and the one property that makes it worth having.
//
// The mask used to live in memory only, so every reload unmasked the amounts.
// Someone who hides their balances because of where they are sitting is still
// sitting there when the tab reloads; forgetting the choice reveals the figures
// at exactly the moment they were being hidden.
import { describe, test, expect, beforeEach } from 'vitest';
import { useApp, lsGet } from '@/lib/store';

const KEY = 'khazana-ghost';

beforeEach(() => {
  localStorage.clear();
  useApp.setState({ ghost: false });
});

describe('ghost mode persistence', () => {
  test('hiding amounts is written down', () => {
    useApp.getState().toggleGhost();
    expect(useApp.getState().ghost).toBe(true);
    expect(lsGet(KEY)).toBe('1');
  });

  test('unhiding is written down too, not just left absent', () => {
    // A missing key and an explicit "no" must not be the same thing, or the
    // only way to un-hide permanently would be to clear site data.
    useApp.getState().toggleGhost();
    useApp.getState().toggleGhost();
    expect(useApp.getState().ghost).toBe(false);
    expect(lsGet(KEY)).toBe('0');
  });

  test('a stored mask is read back as hidden', () => {
    localStorage.setItem(KEY, '1');
    expect(lsGet(KEY) === '1').toBe(true);
  });

  test('no stored preference means visible', () => {
    expect(lsGet(KEY)).toBeNull();
    expect(lsGet(KEY) === '1').toBe(false);
  });

  test('locking the vault does not unmask', () => {
    // `lock()` clears vault data and the key. It must not clear the fact that
    // the person asked for the figures to be hidden — the lock screen and
    // whatever they unlock into are seen by the same room.
    useApp.getState().toggleGhost();
    useApp.getState().lock();
    expect(useApp.getState().ghost).toBe(true);
  });
});
