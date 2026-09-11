'use client';
/**
 * Marks a surface whose figures are synthesised rather than recorded.
 *
 * This is a correctness control, not decoration. The app promises it never
 * calls a network, so a quote, index level or headline on screen did not come
 * from a market — it came from `lib/demo/`. Anywhere that data appears, this
 * badge must appear with it, so a synthesised number is never mistaken for a
 * real one.
 *
 * Pair it with `useDemoData()`, which lets the user switch those surfaces off
 * entirely from Settings.
 */
import { useSyncExternalStore } from 'react';
import { FlaskConical } from 'lucide-react';

const KEY = 'khazana-demo-market';

// External store: localStorage fires no event for same-tab writes, so the
// setter notifies subscribers directly. Reading through
// `useSyncExternalStore` keeps the value out of an effect, which would
// otherwise cascade a render on every mount.
const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function read(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function DemoBadge({ label = 'Demo data', title }: { label?: string; title?: string }) {
  return (
    <span
      title={title ?? 'Illustrative figures generated on this device, not fetched from a market data provider.'}
      className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full border border-[color-mix(in_srgb,var(--violet)_30%,transparent)] bg-violet-soft text-violet text-[9.5px] font-bold uppercase tracking-[0.08em] whitespace-nowrap"
    >
      <FlaskConical size={11} strokeWidth={2.4} />
      {label}
    </span>
  );
}

/**
 * Whether synthesised market surfaces should render at all.
 *
 * **Defaults to OFF, and must stay that way.** It used to default to on, which
 * meant a new user saw invented day-change percentages attached to instruments
 * they actually own, and headlines written about their real tickers. The badge
 * was always there and the numbers were always deterministic, but a badge is
 * not consent: a paid finance app that shows a made-up figure next to a real
 * holding is making a claim about that holding, and in India that is a
 * consumer-protection problem regardless of the label next to it.
 *
 * The demo feed still exists, because it is genuinely useful for screenshots
 * and for evaluating the app with an empty vault. It is now something a user
 * turns on from Settings, knowing what it is.
 *
 * Reading happens after mount so the server and client agree on the first
 * paint.
 */
export function useDemoData(): [boolean, (v: boolean) => void] {
  // Server snapshot is `false` — the default — so hydration agrees.
  const on = useSyncExternalStore(subscribe, read, () => false);

  const set = (v: boolean) => {
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* private mode */ }
    listeners.forEach((fn) => fn());
  };

  return [on, set];
}
