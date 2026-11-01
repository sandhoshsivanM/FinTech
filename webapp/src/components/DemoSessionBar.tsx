'use client';
import { useState } from 'react';
import { DemoBadge } from '@khazana/screens/components/DemoBadge';
import { exitDemo } from '@/lib/demoVault';

/**
 * Says, wherever a "Try demo" vault is on screen, that it is one — and offers
 * the way out. Shown in the top bar and on the gate, only in a demo tab.
 *
 * The wording is deliberately "starts fresh each visit", not "clears on
 * close": the demo database stays in IndexedDB after the tab closes and is
 * replaced on the next visit (or deleted by Exit demo).
 */
export function DemoSessionBar({ compact = false }: { compact?: boolean }) {
  const [leaving, setLeaving] = useState(false);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <DemoBadge label="Demo" title="Demo — sample data only. Starts fresh each visit." />
      {!compact && (
        <span className="fs-12 text-muted truncate">Sample data only. Starts fresh each visit.</span>
      )}
      <button
        onClick={() => { setLeaving(true); void exitDemo(); }}
        disabled={leaving}
        className="focus-ring shrink-0 rounded-full px-3 py-1 fs-12 font-semibold border border-line-strong text-ink hover:border-accent disabled:opacity-60"
      >
        {leaving ? 'Leaving…' : 'Exit demo'}
      </button>
    </div>
  );
}
