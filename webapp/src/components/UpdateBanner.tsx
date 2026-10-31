'use client';
/**
 * Tells an open tab that a newer version of Khazana has been deployed.
 *
 * The app is a single page and reloading locks the vault, so tabs stay open for
 * days and would otherwise keep running whatever version they first loaded —
 * after the free-for-everyone deploy, an open tab still showed Pro paywalls.
 *
 * Two behaviours, by vault state:
 * - Locked (PIN screen): reload straight away. Nothing is unlocked, so there is
 *   nothing to lose, and the gate itself is then always current.
 * - Unlocked: never reload under someone. Show a banner and let them choose,
 *   because a reload drops the in-memory key and asks for the PIN again.
 *
 * Web only, production only: the desktop app ships its assets inside the
 * binary (tauri://), and the dev server has no build id.
 */
import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { BUILD_ID, fetchDeployedId, isOutdated } from '@/lib/buildCheck';

const RECHECK_MS = 30 * 60_000;

function canCheck(): boolean {
  if (typeof window === 'undefined') return false;
  const isWeb = location.protocol === 'http:' || location.protocol === 'https:';
  return isWeb && process.env.NODE_ENV === 'production' && !!BUILD_ID;
}

/** Hook: true once a newer build is known to be deployed. */
function useOutdated(): boolean {
  const [outdated, setOutdated] = useState(false);
  useEffect(() => {
    if (!canCheck()) return;
    let alive = true;
    const check = async () => {
      const deployed = await fetchDeployedId();
      if (alive && isOutdated(BUILD_ID, deployed)) setOutdated(true);
    };
    const first = setTimeout(() => void check(), 5_000);
    const every = setInterval(() => void check(), RECHECK_MS);
    // Coming back to a tab that sat in the background is the likeliest moment
    // for a deploy to have happened.
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(every);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return outdated;
}

/** On the PIN screen: silently move to the latest build. */
export function ReloadIfOutdated() {
  const outdated = useOutdated();
  useEffect(() => { if (outdated) location.reload(); }, [outdated]);
  return null;
}

/** Inside the unlocked app: offer the reload, never force it. */
export function UpdateBanner() {
  const outdated = useOutdated();
  const [dismissed, setDismissed] = useState(false);
  if (!outdated || dismissed) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[80] left-1/2 -translate-x-1/2 w-[min(440px,calc(100vw-32px))] bottom-[calc(env(safe-area-inset-bottom,0px)+104px)] md:bottom-6 card shadow-[var(--shadow-2)] px-4 py-3 flex items-center gap-3"
    >
      <span className="w-9 h-9 shrink-0 rounded-full grid place-items-center bg-[color-mix(in_srgb,var(--data-blue)_14%,transparent)] text-[var(--data-blue)]">
        <RefreshCw size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block fs-13.5 font-medium text-ink">A new version of Khazana is available</span>
        <span className="block fs-11.5 text-muted">Reload to update. You will unlock with your PIN again.</span>
      </span>
      <button
        type="button"
        onClick={() => location.reload()}
        className="focus-ring shrink-0 rounded-full px-3.5 py-1.5 fs-12.5 font-semibold bg-primary text-[var(--primary-fg)] hover:brightness-110"
      >
        Reload
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="focus-ring shrink-0 w-7 h-7 rounded-full grid place-items-center text-muted hover:text-ink"
      >
        <X size={15} />
      </button>
    </div>
  );
}
