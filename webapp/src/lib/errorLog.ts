/**
 * A tiny, local-only record of recent uncaught errors, for "Report a problem".
 *
 * Captures `window` `error` and `unhandledrejection` events into a ring buffer
 * of the last {@link MAX_ENTRIES}, held in memory and mirrored to localStorage
 * so a report can still be written after the reload that usually follows a
 * crash. Nothing here is ever sent anywhere: the only way out is the user
 * pressing "Report a problem" or "Copy problem report" and then sending the
 * result themselves.
 *
 * Each entry holds only the error's message and stack, the time, the route
 * path and the app version — never store state or vault data — and both text
 * fields go through {@link sanitizeErrorText} first, which strips the things an
 * error string can accidentally carry: email addresses, URL query strings and
 * fragments, and numbers that look like amounts or identifiers.
 */

export interface ErrorEntry {
  /** Epoch milliseconds. */
  t: number;
  message: string;
  stack?: string;
  /** `location.pathname` only — no query string, no hash. */
  route: string;
  version: string;
}

export const MAX_ENTRIES = 50;
export const STORAGE_KEY = 'khazana.errorLog.v1';
const MAX_MESSAGE = 300;
const MAX_STACK = 1500;

/**
 * Removes personal or financial detail an error string might quote.
 *
 * Order matters: emails first (they contain dots and digits), then URLs'
 * query strings and fragments, then amounts, then long digit runs. Stack frame
 * positions (`file.js:12:345`) are kept — they are what makes a stack useful
 * and say nothing about the user.
 */
export function sanitizeErrorText(input: string): string {
  return input
    // Emails.
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    // Query strings and fragments on absolute or relative URLs / paths. A
    // trailing stack position (`:12:34`) survives.
    .replace(
      /((?:[a-z][\w+.-]*:\/\/|\/)[^\s?#'"()<>]*)[?#][^\s'"()<>]*?(?=(?::\d+){1,2}(?=[\s'"()<>]|$)|[\s'"()<>]|$)/gi,
      '$1',
    )
    // Currency-prefixed amounts: ₹1,200 · $45.50 · Rs. 900 · INR 1200.
    .replace(/(?:[₹$€£¥]|\b(?:rs\.?|inr|usd|eur|gbp)\s?)\s?\d[\d,]*(?:\.\d+)?/gi, '[amount]')
    // Grouped numbers: 1,20,000 · 12,345.67.
    .replace(/(?<![\w.])\d{1,3}(?:,\d{2,3})+(?:\.\d+)?(?![\w])/g, '[amount]')
    // Two-place decimals: 1234.50 (but not versions like 1.0.0).
    .replace(/(?<![\w.])\d+\.\d{2}(?![\w.])/g, '[amount]')
    // Any run of four or more digits that is not a stack line/column number.
    .replace(/(?<![\w:])\d{4,}(?![\w])/g, '[number]');
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

let buffer: ErrorEntry[] | null = null;
let installed = false;

function isEntry(x: unknown): x is ErrorEntry {
  if (!x || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  return typeof e.t === 'number' && typeof e.message === 'string'
    && typeof e.route === 'string' && typeof e.version === 'string'
    && (e.stack === undefined || typeof e.stack === 'string');
}

function load(): ErrorEntry[] {
  if (buffer) return buffer;
  let restored: ErrorEntry[] = [];
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) restored = parsed.filter(isEntry).slice(-MAX_ENTRIES);
    }
  } catch {
    // Blocked or corrupt storage: start empty, keep working in memory.
  }
  buffer = restored;
  return buffer;
}

function persist(entries: ErrorEntry[]) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Private mode, quota, or storage disabled. The in-memory copy still works.
  }
}

/** Adds one error to the log. Exported for tests and for explicit reporting. */
export function recordError(
  err: { message: string; stack?: string },
  ctx: { route: string; version: string; now?: number },
): void {
  const entries = load();
  const stack = err.stack ? clip(sanitizeErrorText(err.stack), MAX_STACK) : undefined;
  entries.push({
    t: ctx.now ?? Date.now(),
    message: clip(sanitizeErrorText(err.message || 'Unknown error'), MAX_MESSAGE),
    ...(stack ? { stack } : {}),
    route: sanitizeErrorText(ctx.route),
    version: ctx.version,
  });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  persist(entries);
}

/** The recorded errors, oldest first. A copy: callers cannot mutate the log. */
export function recentErrors(): ErrorEntry[] {
  return [...load()];
}

export function clearErrorLog(): void {
  buffer = [];
  try { globalThis.localStorage?.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/** Turns whatever was thrown or rejected into a message and maybe a stack. */
function describe(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error) return { message: `${reason.name}: ${reason.message}`, stack: reason.stack };
  if (typeof reason === 'string') return { message: reason };
  // Never JSON.stringify an arbitrary rejection value: it could be a record.
  return { message: `Non-error value (${reason === null ? 'null' : typeof reason})` };
}

/**
 * Starts capturing. Idempotent — safe under React strict mode's double effect
 * and across re-mounts. Returns an uninstaller.
 */
export function installErrorLog(version: string): () => void {
  if (typeof window === 'undefined' || installed) return () => {};
  installed = true;
  const route = () => window.location?.pathname ?? '';

  const onError = (e: ErrorEvent) => {
    const base = e.error !== undefined ? describe(e.error) : { message: e.message || 'Script error' };
    recordError(base, { route: route(), version });
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    const base = describe(e.reason);
    recordError({ ...base, message: `Unhandled rejection: ${base.message}` }, { route: route(), version });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    installed = false;
  };
}

/** Test hook: forget the in-memory buffer so the next read reloads storage. */
export function __resetErrorLogForTests(): void {
  buffer = null;
}
