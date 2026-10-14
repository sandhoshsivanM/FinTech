/**
 * "Send feedback" and "Report a problem": the text, and the `mailto:` links.
 *
 * There is no server. These build a message for the user's own mail app, and
 * nothing is sent unless they press Send there. The only facts included are in
 * {@link FeedbackContext} — app version, build channel, a browser/OS summary,
 * the viewport size and the theme — plus, for a problem report, the sanitized
 * entries from `errorLog`. No store state is an input, so no account, amount,
 * PIN or vault content can end up in a message.
 */
import { APP_NAME, FEEDBACK_EMAIL } from './brand';
import type { ErrorEntry } from './errorLog';

export interface FeedbackContext {
  version: string;
  /** `web` in a browser, `desktop` in the Tauri app. */
  channel: 'web' | 'desktop';
  /** e.g. `Chrome 129 on macOS`. */
  browser: string;
  /** e.g. `1280×800`. */
  viewport: string;
  /** e.g. `system (dark)`. */
  theme: string;
}

/**
 * Most mail clients and OS handlers accept far longer `mailto:` URLs, but some
 * (Outlook desktop, older Android handlers) truncate around 2,000 characters,
 * silently. Keeping the whole URL under this leaves the address intact.
 */
export const MAILTO_MAX = 1800;

/**
 * A short, coarse browser + OS label from a user-agent string. Coarse on
 * purpose: major version only, no device model.
 */
export function uaSummary(ua: string): string {
  const pick = (re: RegExp) => ua.match(re)?.[1]?.split('.')[0];
  let browser = 'Unknown browser';
  let v: string | undefined;
  if ((v = pick(/Edg\/([\d.]+)/))) browser = `Edge ${v}`;
  else if ((v = pick(/(?:OPR|Opera)\/([\d.]+)/))) browser = `Opera ${v}`;
  else if ((v = pick(/Firefox\/([\d.]+)/))) browser = `Firefox ${v}`;
  else if ((v = pick(/(?:Chrome|CriOS)\/([\d.]+)/))) browser = `Chrome ${v}`;
  else if (/Safari\//.test(ua) && (v = pick(/Version\/([\d.]+)/))) browser = `Safari ${v}`;
  else if (/AppleWebKit/.test(ua)) browser = 'WebKit';

  let os = 'unknown OS';
  if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  return `${browser} on ${os}`;
}

export function feedbackSubject(ctx: FeedbackContext): string {
  return `${APP_NAME} feedback — ${ctx.version} (${ctx.channel})`;
}

export function problemSubject(ctx: FeedbackContext): string {
  return `${APP_NAME} problem report — ${ctx.version} (${ctx.channel})`;
}

function deviceBlock(ctx: FeedbackContext): string {
  return [
    '— About this device (no financial data) —',
    `App version: ${ctx.version}`,
    `Build channel: ${ctx.channel}`,
    `Browser: ${ctx.browser}`,
    `Viewport: ${ctx.viewport}`,
    `Theme: ${ctx.theme}`,
  ].join('\n');
}

/** Room for the message first, then the device facts. */
export function feedbackBody(ctx: FeedbackContext): string {
  return `\n\n\n${deviceBlock(ctx)}`;
}

function formatEntry(e: ErrorEntry): string {
  const when = new Date(e.t).toISOString();
  const head = `[${when}] ${e.route || '/'} (v${e.version})\n${e.message}`;
  return e.stack ? `${head}\n${e.stack}` : head;
}

/** The full problem report: what to write, the device facts, recent errors. */
export function problemReport(ctx: FeedbackContext, errors: ErrorEntry[]): string {
  const recent = [...errors].reverse(); // newest first: the likeliest culprit leads
  const log = recent.length
    ? recent.map(formatEntry).join('\n\n')
    : 'No errors have been recorded on this device.';
  return [
    'What were you doing when it went wrong?',
    '',
    '',
    '',
    deviceBlock(ctx),
    '',
    `— Recent errors (${recent.length}, sanitized) —`,
    log,
  ].join('\n');
}

const TRUNCATION_NOTE = '\n\n[…truncated. Use "Copy problem report" in Settings for the full text.]';

function mailtoUrl(to: string, subject: string, body: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * A `mailto:` URL no longer than `max` characters. When the body does not fit
 * it is cut (keeping the start, where the message and device facts are) and a
 * note says so.
 */
export function buildMailto(
  { subject, body, to = FEEDBACK_EMAIL }: { subject: string; body: string; to?: string },
  max = MAILTO_MAX,
): string {
  const full = mailtoUrl(to, subject, body);
  if (full.length <= max) return full;
  // Never split a UTF-16 surrogate pair: encodeURIComponent throws on a lone
  // high surrogate.
  const prefix = (n: number) => {
    const c = body.charCodeAt(n - 1);
    return body.slice(0, c >= 0xd800 && c <= 0xdbff ? n - 1 : n);
  };
  // Binary search the longest prefix of the body that fits with the note.
  let lo = 0;
  let hi = body.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (mailtoUrl(to, subject, prefix(mid) + TRUNCATION_NOTE).length <= max) lo = mid;
    else hi = mid - 1;
  }
  return mailtoUrl(to, subject, prefix(lo) + TRUNCATION_NOTE);
}

export function feedbackMailto(ctx: FeedbackContext): string {
  return buildMailto({ subject: feedbackSubject(ctx), body: feedbackBody(ctx) });
}

export function problemMailto(ctx: FeedbackContext, errors: ErrorEntry[]): string {
  return buildMailto({ subject: problemSubject(ctx), body: problemReport(ctx, errors) });
}
