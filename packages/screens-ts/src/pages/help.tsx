'use client';
/**
 * Help — how the app works, what it will and will not do, and how to get out.
 *
 * The privacy section is not marketing copy: it is the contract the rest of the
 * codebase is built around, and a user deserves to be able to read it.
 */
import Link from 'next/link';
import { HelpCircle, ShieldCheck, Command, Download, Compass, ChevronDown } from 'lucide-react';
import { PageIntro, Button, buttonClass, GlassCard } from '@khazana/ui/ui';
import { Stagger, StaggerItem } from '@khazana/ui/motion';
import { getPlatform, PlatformFeedbackLink } from '../platform';

const SHORTCUTS: [string, string][] = [
  ['⌘K / Ctrl-K', 'Open search — jump to any page, holding, transaction or goal'],
  ['Esc', 'Close search or a dialog'],
  ['↑ ↓', 'Move through search results'],
  ['↵', 'Open the highlighted result'],
];

export default function HelpPage() {
  const { help } = getPlatform().copy;
  return (
    <Stagger className="grid gap-6">
      <StaggerItem>
        <PageIntro title="Help" subtitle="How Khazana works, and what it deliberately does not do"
          action={<Button variant="soft" onClick={() => getPlatform().replayTour()}><Compass size={16} />Replay the tour</Button>} />
      </StaggerItem>

      <div className="grid gap-6 min-[1100px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <StaggerItem>
          <section aria-label="Common questions" className="grid gap-3">
            <h2 className="text-[16px] font-medium tracking-[-0.01em] px-1">Common questions</h2>
            {/* One card per question, with a disclosure chevron. The first is
                open so the page never lands as a wall of closed rows. */}
            {help.faq.map(([q, a], i) => (
              <details key={q} open={i === 0} className="card group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="focus-ring flex items-center justify-between gap-3 cursor-pointer list-none rounded-[12px]">
                  <h3 className="text-[15px] font-medium tracking-[-0.01em]">{q}</h3>
                  <span className="grid place-items-center w-8 h-8 shrink-0 rounded-full bg-[var(--card-2)] shadow-[0_2px_6px_-3px_rgba(0,0,0,0.25)] text-ink-soft transition-transform group-open:rotate-180">
                    <ChevronDown size={16} />
                  </span>
                </summary>
                <p className="text-[13.5px] text-ink-soft mt-2.5 leading-relaxed">{a}</p>
              </details>
            ))}
          </section>
        </StaggerItem>

        <div className="grid gap-6 content-start">
          <StaggerItem>
            <section className="card">
              <div className="px-5 py-4 border-b border-line flex items-center gap-2.5">
                <Command size={17} className="text-muted" />
                <h3 className="text-[16px] font-medium tracking-[-0.01em]">Keyboard</h3>
              </div>
              <div className="p-5 grid gap-3">
                {SHORTCUTS.map(([keys, what]) => (
                  <div key={keys} className="flex items-start gap-3">
                    <kbd className="chip shrink-0 !text-[11px] font-medium text-ink-soft">{keys}</kbd>
                    <span className="text-[12.5px] text-ink-soft leading-snug">{what}</span>
                  </div>
                ))}
              </div>
            </section>
          </StaggerItem>

          <StaggerItem>
            <GlassCard>
              <div className="flex items-center gap-2.5 mb-3">
                <ShieldCheck size={17} className="text-muted" />
                <h3 className="text-[16px] font-medium tracking-[-0.01em]">Privacy</h3>
              </div>
              <ul className="grid gap-2.5 text-[12.5px] text-ink-soft leading-relaxed">
                {help.privacyBullets}
              </ul>
              <div className="mt-4 flex gap-2 flex-wrap">
                {help.privacyAction && (
                  <Link href={help.privacyAction.href} className={buttonClass('soft')}><Download size={15} />{help.privacyAction.label}</Link>
                )}
                {/* The store listings point at /privacy too, so this is the same
                    document a reviewer reads — not a second, looser summary. */}
                <Link href="/privacy" className={buttonClass('ghost')}><ShieldCheck size={15} />Privacy policy</Link>
              </div>
            </GlassCard>
          </StaggerItem>

          <StaggerItem>
            <GlassCard>
              <div className="flex items-center gap-2.5 mb-2">
                <HelpCircle size={17} className="text-muted" />
                <h3 className="text-[16px] font-medium tracking-[-0.01em]">Still stuck?</h3>
              </div>
              <p className="text-[12.5px] text-ink-soft leading-relaxed">
                {help.stuck}
              </p>
              <p className="text-[12.5px] text-ink-soft leading-relaxed mt-2">
                Found a bug or have an idea? Send it from your own mail app — it carries the app version and browser, never your data.
              </p>
              <div className="mt-3">
                <PlatformFeedbackLink />
              </div>
            </GlassCard>
          </StaggerItem>
        </div>
      </div>
    </Stagger>
  );
}
