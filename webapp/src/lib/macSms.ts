/**
 * Reads bank SMS from Messages in the Mac app, and queues them for Review.
 *
 * Opt-in and Mac-only. The Rust side (`src-tauri/src/messages.rs`) selects
 * received messages from bank senders only; this side parses them through the
 * same `addCaptures` path a paste takes, so the text is dropped after parsing
 * and every capture still waits for approval.
 *
 * The cursor lives in localStorage, not the vault. It is a Messages row number
 * — meaningless anywhere but this Mac, and it must never sync to another
 * device. Losing it costs nothing: the fingerprint dedup in `lib/capture.ts`
 * recognises every message already captured.
 */
import { create } from 'zustand';
import { defaultBankProfiles } from '@khazana/domain/notificationParser';
import { isTauri } from './notify';
import type { CaptureInput, CaptureOutcome } from './capture';

const KEY = 'khazana-mac-sms';
/** How far back the first read reaches, so enabling it does not replay years of alerts. */
export const FIRST_READ_DAYS = 30;
export const POLL_MS = 60_000;
/** Pages of up to 500 rows per poll; the next poll continues from the cursor. */
const MAX_PAGES = 10;

/**
 * Matched against the sender ID ("AX-HDFCBK", "VM-ICICIT"). Bank and UPI app
 * senders beyond the parser's five profiles — the parser itself is generic.
 * Only alphanumeric business IDs are ever matched; phone numbers and email
 * addresses are excluded in Rust before these are tried.
 */
export const SENDER_KEYWORDS: string[] = [
  ...defaultBankProfiles.flatMap((p) => p.senderKeywords),
  'idfc', 'indus', 'yesbnk', 'pnb', 'bob', 'canara', 'union', 'boi', 'federal',
  'aubank', 'rbl', 'idbi', 'paytm', 'phonpe', 'gpay', 'onecard', 'sbicrd', 'hsbc', 'citi', 'scb',
];

interface Persisted {
  enabled: boolean;
  cursor: number;
  /** Epoch ms; messages older than this are never read. */
  since: number;
}

export type MacSmsStatus = 'off' | 'idle' | 'reading' | 'no_access' | 'error';

interface MacSmsState extends Persisted {
  status: MacSmsStatus;
  lastRunAt: number | null;
  lastAdded: number;
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persisted>;
      return { enabled: !!p.enabled, cursor: Number(p.cursor) || 0, since: Number(p.since) || 0 };
    }
  } catch {
    // Storage blocked or corrupt: start disabled.
  }
  return { enabled: false, cursor: 0, since: 0 };
}

function save(p: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Not fatal; dedup covers a lost cursor.
  }
}

export const useMacSms = create<MacSmsState>(() => {
  const p = typeof window === 'undefined' ? { enabled: false, cursor: 0, since: 0 } : load();
  return { ...p, status: p.enabled ? 'idle' : 'off', lastRunAt: null, lastAdded: 0 };
});

/** Desktop app on macOS — the only place a Messages database exists. */
export const macSmsAvailable = () =>
  isTauri() && typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

export function setMacSmsEnabled(enabled: boolean) {
  const s = useMacSms.getState();
  // Turning it on for the first time starts the window FIRST_READ_DAYS back.
  const since = enabled && !s.since ? Date.now() - FIRST_READ_DAYS * 86_400_000 : s.since;
  const next = { enabled, cursor: s.cursor, since };
  save(next);
  useMacSms.setState({ ...next, status: enabled ? 'idle' : 'off' });
}

interface ReadResult {
  messages: { rowid: number; sender: string; text: string; receivedAt: number }[];
  cursor: number;
}

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
async function tauriInvoke(): Promise<Invoke> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke as Invoke;
}

let running = false;

/**
 * One poll: read new bank messages and queue them. Returns how many became
 * new captures. Never runs twice at once — a slow read and a focus event
 * would otherwise queue the same page twice (harmless, but wasted work).
 */
export async function pollMacSms(
  addCaptures: (inputs: CaptureInput[]) => Promise<CaptureOutcome[]>,
  invoke?: Invoke,
): Promise<number> {
  const s = useMacSms.getState();
  if (!s.enabled || running) return 0;
  running = true;
  useMacSms.setState({ status: 'reading' });
  let cursor = s.cursor;
  let added = 0;
  try {
    const call = invoke ?? (await tauriInvoke());
    for (let page = 0; page < MAX_PAGES; page++) {
      const r = (await call('read_bank_messages', {
        sinceRowid: cursor, sinceMs: s.since, keywords: SENDER_KEYWORDS,
      })) as ReadResult;
      if (r.messages.length > 0) {
        const outcomes = await addCaptures(r.messages.map((m) => ({
          text: m.text, sender: m.sender, source: 'sms', receivedAt: m.receivedAt,
        })));
        added += outcomes.filter((o) => o === 'added').length;
      }
      // Saved only after the captures are written, so a failure rereads the page.
      const moved = r.cursor > cursor;
      cursor = r.cursor;
      save({ enabled: true, cursor, since: s.since });
      if (!moved) break;
    }
    useMacSms.setState({ cursor, status: 'idle', lastRunAt: Date.now(), lastAdded: added });
    return added;
  } catch (e) {
    const status: MacSmsStatus = String(e).includes('no_access') ? 'no_access' : 'error';
    useMacSms.setState({ cursor, status, lastRunAt: Date.now() });
    return added;
  } finally {
    running = false;
  }
}

export async function openFullDiskAccessSettings() {
  const call = await tauriInvoke();
  await call('open_full_disk_access_settings');
}
