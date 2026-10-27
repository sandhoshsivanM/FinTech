'use client';
/**
 * The data contract between the shared screens and an app (ADR 0007, amended
 * 2026-10-27).
 *
 * `KhazanaStore` is the pure data + CRUD half of an app's state: the entities a
 * screen draws, the active profile and display preferences, and the actions that
 * change them. It deliberately has no PIN, lock, backup, wipe, folder sync,
 * persistence or unreadable-record members: those belong to the offline vault
 * and stay in `webapp/`.
 *
 * The package holds no storage and no network. The host app builds a zustand
 * store that satisfies this interface (offline: encrypted Dexie; online: its own
 * database and sync) and hands it to `KhazanaStoreProvider`. Screens read it
 * with `useApp(selector)` and, inside callbacks, with `useAppApi().getState()`.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useStore, type StoreApi } from 'zustand';
import type {
  Account, Alert, Budget, Category, Dividend, FxRate, Goal, Holding, HoldingLot, ImportBatch,
  Insurance, Liability, NetWorthSnapshot, PendingCapture, Posting, Profile, ProfileKind,
  RecurringRule, Transfer, Txn, WatchItem,
} from '@khazana/domain/types';
import type { CaptureEdits, CaptureInput, CaptureOutcome } from './lib/capture';

import type { AccentName, ThemeChoice } from '@khazana/domain/appearance';
export type { AccentName, ThemeChoice };

/** Every entity collection a screen can read. Profile-scoped except `fxRates`. */
export interface KhazanaData {
  txns: Txn[];
  categories: Category[];
  budgets: Budget[];
  goals: Goal[];
  holdings: Holding[];
  liabilities: Liability[];
  recurring: RecurringRule[];
  insurances: Insurance[];
  snapshots: NetWorthSnapshot[];
  importBatches: ImportBatch[];
  lots: HoldingLot[];
  accounts: Account[];
  postings: Posting[];
  transfers: Transfer[];
  pendingCaptures: PendingCapture[];
  watchlist: WatchItem[];
  dividends: Dividend[];
  alerts: Alert[];
  /** Vault-wide, not profile-scoped: an exchange rate is a fact about the world. */
  fxRates: FxRate[];
}

export interface KhazanaStore extends KhazanaData {
  vaultId: string;
  activeProfileId: string;
  profiles: Profile[];
  /** Amounts masked on screen. */
  ghost: boolean;
  currencyCode: string;
  theme: ThemeChoice;
  accent: AccentName;

  setActiveProfile: (id: string) => Promise<void>;
  addProfile: (name: string, kind: ProfileKind) => Promise<void>;
  renameProfile: (id: string, name: string) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  toggleGhost: () => void;
  setCurrency: (code: string) => void;
  setTheme: (t: ThemeChoice) => void;
  setAccent: (a: AccentName) => void;

  /** Writes one record (and, for entries, its ledger postings) and reloads. */
  put: (type: string, value: { id: string } & Record<string, unknown>) => Promise<void>;
  /** Many records as one atomic batch and one reload. */
  putMany: (entries: { type: string; value: { id: string } & Record<string, unknown> }[]) => Promise<void>;
  del: (type: string, id: string) => Promise<void>;
  reload: () => Promise<void>;

  /** Re-points every transaction on one account at another. Returns how many moved. */
  reassignTxnAccounts: (fromAccountId: string, toAccountId: string) => Promise<number>;
  /** Posts every recurring rule that is due. Returns how many were posted. */
  processRecurring: () => Promise<number>;
  /** Posts ONE occurrence of ONE rule; `date` and `amount` override the schedule. */
  postRecurringOnce: (ruleId: string, opts?: { date?: number; amount?: string }) => Promise<boolean>;
  /** Records one import run so it can be reversed. Returns the batch id. */
  recordImportBatch: (b: Omit<ImportBatch, 'id' | 'vaultId' | 'profileId'>) => Promise<string>;
  /** Deletes everything a run created. Returns how many records were removed. */
  undoImportBatch: (batchId: string) => Promise<number>;
  captureSnapshot: () => Promise<void>;

  /** Parses bank messages into review-inbox drafts. */
  addCaptures: (inputs: CaptureInput[]) => Promise<CaptureOutcome[]>;
  /** Writes each capture's transaction and marks it decided, in one batch. */
  approveCaptures: (items: { id: string; edits?: CaptureEdits }[]) => Promise<void>;
  rejectCapture: (id: string) => Promise<void>;

  /** Stores a receipt and returns its id. */
  putAttachment: (file: File) => Promise<string>;
  /** A URL a receipt can be shown from, or null when it is gone. */
  getAttachmentUrl: (id: string) => Promise<string | null>;
}

const Ctx = createContext<StoreApi<KhazanaStore> | null>(null);

/** Mount once, above every screen. `store` is the app's zustand store. */
export function KhazanaStoreProvider({ store, children }: { store: StoreApi<KhazanaStore>; children?: ReactNode }) {
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/** The store's API, for reading the latest state inside callbacks: `useAppApi().getState()`. */
export function useAppApi(): StoreApi<KhazanaStore> {
  const api = useContext(Ctx);
  if (!api) throw new Error('useApp must be used inside <KhazanaStoreProvider>.');
  return api;
}

/** Subscribes to a slice of the store, like a zustand hook. */
export function useApp<T>(selector: (s: KhazanaStore) => T): T {
  return useStore(useAppApi(), selector);
}

export { uid, cashAcctId, DEFAULT_CATEGORIES } from './lib/storeHelpers';
export { lsGet, lsSet, LAST_ACCOUNT_KEY } from './lib/prefs';
