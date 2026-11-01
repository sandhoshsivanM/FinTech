// Which IndexedDB database a page load opens. The real vault's name is frozen;
// only an explicit demo flag in this tab's sessionStorage picks the other one.
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { dbName, DEMO_DB_NAME, REAL_DB_NAME } from '@/lib/db';
import { isDemoSession, DEMO_SESSION_KEY } from '@khazana/screens/lib/demoSession';

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('dbName', () => {
  test('the real vault keeps its frozen name', () => {
    expect(REAL_DB_NAME).toBe('fintech_os');
    expect(dbName(false)).toBe('fintech_os');
  });

  test('a demo gets a database of its own', () => {
    expect(DEMO_DB_NAME).toBe('fintech_os_demo');
    expect(dbName(true)).toBe(DEMO_DB_NAME);
  });

  test('follows the session flag by default', () => {
    expect(dbName()).toBe(REAL_DB_NAME);
    sessionStorage.setItem(DEMO_SESSION_KEY, '1');
    expect(dbName()).toBe(DEMO_DB_NAME);
  });
});

describe('isDemoSession', () => {
  test('only the exact flag counts', () => {
    expect(isDemoSession()).toBe(false);
    sessionStorage.setItem(DEMO_SESSION_KEY, 'true');
    expect(isDemoSession()).toBe(false);
    sessionStorage.setItem(DEMO_SESSION_KEY, '1');
    expect(isDemoSession()).toBe(true);
  });

  test('a flag in localStorage does not make a demo', () => {
    localStorage.setItem(DEMO_SESSION_KEY, '1');
    expect(isDemoSession()).toBe(false);
  });

  test('storage that throws (private mode) means the real vault', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    expect(isDemoSession()).toBe(false);
    expect(dbName()).toBe(REAL_DB_NAME);
  });
});
