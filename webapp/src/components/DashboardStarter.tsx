'use client';
/**
 * What the dashboard shows before there is anything to show.
 *
 * The dashboard used to render its full composition against an empty vault:
 * ₹0.00 as net worth, ₹0.00 cash, 0 positions, a flat chart. Every figure was
 * technically correct and the screen said nothing. Worse, zero is a real
 * number — someone who has just imported a statement cannot tell "we have not
 * got your data" from "you have nothing".
 *
 * So on an empty vault the position section is replaced by this: the three
 * things worth doing first, and a way to see the app with data in it before
 * committing any of your own.
 */
import Link from 'next/link';
import { useState } from 'react';
import { Landmark, TrendingUp, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';
import { Section } from '@/components/primitives';
import { loadSampleData } from '@/lib/sampleData';

/** The first three actions, in the order that makes the rest of the app work. */
const STARTERS = [
  {
    href: '/accounts',
    icon: Landmark,
    label: 'Add an account',
    hint: 'Where your money sits. Everything else hangs off this.',
  },
  {
    href: '/holdings',
    icon: TrendingUp,
    label: 'Add a holding',
    hint: 'A stock, fund or deposit you already own.',
  },
  {
    href: '/add',
    icon: Plus,
    label: 'Add a transaction',
    hint: 'One thing you earned or spent.',
  },
] as const;

export function DashboardStarter() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSample = async () => {
    setBusy(true);
    setError(null);
    try {
      await loadSampleData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Start here" first
      description="Your vault is empty, so there is nothing to total up yet. Pick a starting point.">
      <ul className="mt-5 grid gap-2.5 sm:grid-cols-3">
        {STARTERS.map(({ href, icon: Icon, label, hint }) => (
          <li key={href}>
            <Link
              href={href}
              className="focus-ring flex h-full flex-col gap-1.5 rounded-[var(--radius-btn)] border border-line bg-card p-4 transition-colors hover:border-line-strong"
            >
              <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                <Icon size={16} className="text-accent shrink-0" aria-hidden="true" />
                {label}
              </span>
              <span className="text-[12.5px] leading-relaxed text-muted">{hint}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        {/* Safe to offer without a confirmation here, and only here: this card
            renders when the vault holds nothing, so the wipe inside
            loadSampleData has nothing to destroy. Settings keeps its confirm
            dialog, where that is not true. */}
        <Button variant="soft" onClick={handleSample} disabled={busy}>
          <Sparkles size={15} aria-hidden="true" />
          {busy ? 'Loading…' : 'Load sample data'}
        </Button>
        <span className="text-[12.5px] text-muted">
          Fills the vault with a realistic year so you can see what the app does. Erase it any time from Settings.
        </span>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[12.5px] text-danger">
          Could not load the sample: {error}
        </p>
      )}
    </Section>
  );
}
