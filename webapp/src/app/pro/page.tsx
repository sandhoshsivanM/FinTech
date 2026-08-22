'use client';
/**
 * The paywall for the web and desktop builds.
 *
 * There is no in-app purchase here — buying happens at the merchant of record's
 * hosted checkout, and comes back as an Ed25519-signed licence key that this
 * page activates. Verification is local: nothing is sent anywhere to check a
 * key, which is what lets Pro work offline and keeps the promise that no server
 * ever learns who is running Khazana.
 */
import { useState } from 'react';
import { Check, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { useApp } from '@/lib/store';
import { shortRef } from '@/lib/entitlement/entitlement';
import { PageIntro, GlassCard, Button, Input } from '@/components/ui';
import { Stagger, StaggerItem } from '@/components/motion';
import { PRO_COPY } from '@/lib/entitlement/proCopy';

export default function ProPage() {
  const pro = useApp((s) => s.pro);
  const activateLicense = useApp((s) => s.activateLicense);
  const removeLicense = useApp((s) => s.removeLicense);

  const [key, setKey] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activate = async () => {
    setBusy(true);
    try {
      setNote(await activateLicense(key));
      if (useApp.getState().pro.isPro) setKey('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stagger className="grid max-w-[820px] gap-4">
      <StaggerItem>
        <PageIntro title={PRO_COPY.title} subtitle={PRO_COPY.tagline} />
      </StaggerItem>

      {pro.isPro ? (
        <StaggerItem>
          <GlassCard>
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-success-soft text-success">
                <ShieldCheck size={18} />
              </span>
              <div className="flex-1">
                <div className="text-sm font-semibold">Khazana Pro is unlocked</div>
                <div className="text-xs text-muted">
                  {/* A hashed order reference, never an email or a name — the
                      client deliberately holds no personal data about a buyer. */}
                  {shortRef(pro) ? `Licence …${shortRef(pro)}` : 'Thank you.'}
                </div>
              </div>
              <Button variant="ghost" onClick={removeLicense}>
                Remove from this device
              </Button>
            </div>
          </GlassCard>
        </StaggerItem>
      ) : (
        <StaggerItem>
          <GlassCard>
            <div className="text-2xl font-bold tracking-[-0.02em]">
              {PRO_COPY.priceFallback}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
              One payment, not a subscription. Buy on the website and you are
              emailed a licence key — paste it below.
            </p>
            <div className="mt-4">
              <a href={PRO_COPY.checkoutUrl} target="_blank" rel="noreferrer">
                <Button variant="soft">Buy Khazana Pro</Button>
              </a>
            </div>
          </GlassCard>
        </StaggerItem>
      )}

      <StaggerItem>
        <GlassCard>
          <div className="mb-3 flex items-center gap-2.5">
            <span className="text-accent"><Check size={17} /></span>
            <h2 className="text-[15px] font-semibold tracking-[-0.02em]">
              What Pro includes
            </h2>
          </div>
          <div className="grid gap-3">
            {PRO_COPY.benefits.map((b) => (
              <div key={b.title} className="flex items-start gap-2.5">
                <span className="mt-[3px] text-accent"><Check size={15} /></span>
                <div>
                  <div className="text-[13px] font-semibold">{b.title}</div>
                  <div className="text-[13px] leading-relaxed text-ink-soft">{b.body}</div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      </StaggerItem>

      {/* The promise that makes the free tier trustworthy, on the paywall
          rather than buried in the terms. It is what makes "not now" a safe
          answer — and someone who feels safe saying no is the one who comes
          back and says yes. */}
      <StaggerItem>
        <GlassCard>
          <div className="flex items-start gap-2.5">
            <span className="mt-[3px] text-success"><Lock size={16} /></span>
            <p className="text-[13px] leading-relaxed text-ink-soft">
              {PRO_COPY.freeForeverNote}
            </p>
          </div>
        </GlassCard>
      </StaggerItem>

      {!pro.isPro && (
        <StaggerItem>
          <GlassCard>
            <div className="mb-3 flex items-center gap-2.5">
              <span className="text-accent"><KeyRound size={17} /></span>
              <h2 className="text-[15px] font-semibold tracking-[-0.02em]">
                {PRO_COPY.licenceTitle}
              </h2>
            </div>
            <div className="grid max-w-md gap-2">
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={PRO_COPY.licenceHint}
                spellCheck={false}
                autoCapitalize="none"
                aria-label="Licence key"
              />
              <p className="text-xs text-muted">{PRO_COPY.licenceHelp}</p>
              <div>
                <Button variant="soft" onClick={activate} disabled={busy || !key.trim()}>
                  {busy ? 'Checking…' : 'Activate'}
                </Button>
              </div>
              {note && <p className="text-[13px] text-ink-soft">{note}</p>}
            </div>
          </GlassCard>
        </StaggerItem>
      )}

      <StaggerItem>
        <p className="px-1 text-xs leading-relaxed text-muted">
          {PRO_COPY.ecosystemNoteDirect}
        </p>
      </StaggerItem>
    </Stagger>
  );
}
