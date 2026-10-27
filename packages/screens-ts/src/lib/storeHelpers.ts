/** A fresh record id. */
export const uid = () => crypto.randomUUID();

// Canonical definitions are in @khazana/domain (vaultWrites.ts); re-exported here
// for the screens and the offline store.
export { cashAcctId, DEFAULT_CATEGORIES } from '@khazana/domain/vaultWrites';
