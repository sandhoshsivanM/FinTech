import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { DB_NAME, clearSession, loadSession, saveSession } from './vault';

test('the session round-trips through its own database, and clears', async () => {
  expect(DB_NAME).toBe('khazana_online');
  expect(await loadSession()).toBeUndefined();
  await saveSession({ refreshToken: 'r', userId: 'u', deviceId: 'd' });
  expect(await loadSession()).toEqual({ refreshToken: 'r', userId: 'u', deviceId: 'd' });
  await clearSession();
  expect(await loadSession()).toBeUndefined();
});
