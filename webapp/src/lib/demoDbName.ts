/**
 * The "Try demo" vault's IndexedDB database. Its own module, apart from db.ts,
 * so code can compare against it without importing the database itself (and
 * so the tests that stand in for db.ts need not know about it).
 */
export const DEMO_DB_NAME = 'fintech_os_demo';
