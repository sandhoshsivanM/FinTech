'use client';
/**
 * Help — how the app works, what it will and will not do, and how to get out.
 *
 * The privacy section is not marketing copy: it is the contract the rest of the
 * codebase is built around, and a user deserves to be able to read it.
 */
import Link from 'next/link';
import { HelpCircle, ShieldCheck, Command, Download, Compass, FlaskConical } from 'lucide-react';
import { PageIntro, Button, GlassCard, Chip } from '@/components/ui';
import { Stagger, StaggerItem } from '@/components/motion';
import { TOUR_EVENT } from '@/components/Tour';

const SHORTCUTS: [string, string][] = [
  ['⌘K / Ctrl-K', 'Open search — jump to any page, holding, transaction or goal'],
  ['Esc', 'Close search or a dialog'],
  ['↑ ↓', 'Move through search results'],
  ['↵', 'Open the highlighted result'],
];

const FAQ: [string, string][] = [
  ['Where is my data stored?', 'In this browser only, in IndexedDB, encrypted with a key derived from your PIN using PBKDF2 (600,000 iterations) and AES-256-GCM. It is never uploaded, because there is no server to upload it to.'],
  ['What happens if I forget my PIN?', 'The vault cannot be recovered. The PIN is never stored — it derives the key each time you unlock. This is why exporting a backup matters: the backup file carries its own copy of your data and you choose where to keep it.'],
  ['Does Khazana fetch live prices?', 'No. Prices are the ones you enter or import. Asking a market data API for a quote would tell that API exactly which instruments you own, which is the one thing this app promises not to do.'],
  ['Then what is the demo data?', 'Screens that would need a live feed — Markets, News, day-change columns — are filled with figures generated on your device from a fixed seed. They are always labelled, and you can switch them off in Settings → Privacy.'],
  ['Can I move to another device?', 'Export an encrypted backup from Settings, then import it on the other device. The file uses the .ftos format and needs your PIN to open.'],
];

export default function HelpPage() {
  return (
    <Stagger className="grid gap-6">
      <StaggerItem>
        <PageIntro title="Help" subtitle="How Khazana works, and what it deliberately does not do"
          action={<Button variant="soft" onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}><Compass size={16} />Replay the tour</Button>} />
      </StaggerItem>

      <div className="grid gap-6 min-[1100px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <StaggerItem>
          <section className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-line">
              <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Common questions</h2>
            </div>
            {FAQ.map(([q, a]) => (
              <div key={q} className="px-5 py-4 border-b border-line last:border-0">
                <h3 className="text-[14px] font-semibold tracking-[-0.015em]">{q}</h3>
                <p className="text-[13px] text-ink-soft mt-1.5 leading-relaxed">{a}</p>
              </div>
            ))}
          </section>
        </StaggerItem>

        <div className="grid gap-6 content-start">
          <StaggerItem>
            <section className="card">
              <div className="px-5 py-4 border-b border-line flex items-center gap-2.5">
                <Command size={17} className="text-muted" />
                <h3 className="text-[18px] font-semibold tracking-[-0.02em]">Keyboard</h3>
              </div>
              <div className="p-5 grid gap-3">
                {SHORTCUTS.map(([keys, what]) => (
                  <div key={keys} className="flex items-start gap-3">
                    <kbd className="shrink-0 text-[10.5px] font-semibold px-1.5 py-1 rounded-md bg-fill-strong text-ink-soft border border-line">{keys}</kbd>
                    <span className="text-[12.5px] text-ink-soft leading-snug">{what}</span>
                  </div>
                ))}
              </div>
            </section>
          </StaggerItem>

          <StaggerItem>
            <GlassCard>
              <div className="flex items-center gap-2.5 mb-3">
                <ShieldCheck size={17} className="text-success" />
                <h3 className="text-[15px] font-semibold tracking-[-0.02em]">Privacy</h3>
              </div>
              <ul className="grid gap-2.5 text-[12.5px] text-ink-soft leading-relaxed">
                <li className="flex gap-2"><Chip tone="success">No server</Chip> Nothing to upload to.</li>
                <li className="flex gap-2"><Chip tone="success">No analytics</Chip> No telemetry of any kind.</li>
                <li className="flex gap-2"><Chip tone="violet"><FlaskConical size={11} />Demo</Chip> Market surfaces are generated locally.</li>
              </ul>
              <div className="mt-4 flex gap-2 flex-wrap">
                <Button variant="soft"><Link href="/settings" className="flex items-center gap-2"><Download size={15} />Export a backup</Link></Button>
              </div>
            </GlassCard>
          </StaggerItem>

          <StaggerItem>
            <GlassCard>
              <div className="flex items-center gap-2.5 mb-2">
                <HelpCircle size={17} className="text-muted" />
                <h3 className="text-[15px] font-semibold tracking-[-0.02em]">Still stuck?</h3>
              </div>
              <p className="text-[12.5px] text-ink-soft leading-relaxed">
                Khazana runs entirely on your device, so there is no account to look up and no support team who can see your data. Exporting a backup before you experiment is always the safe move.
              </p>
            </GlassCard>
          </StaggerItem>
        </div>
      </div>
    </Stagger>
  );
}
