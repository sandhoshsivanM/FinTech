'use client';
/**
 * Terms of use / EULA.
 *
 * This is the second URL both stores ask for, and the one a reviewer opens
 * after the privacy policy. It is the web rendering of the root `LICENSE` file
 * — the same agreement, laid out to be read rather than to be skimmed past.
 *
 * The two must not drift. LICENSE is what ships in the repository and in the
 * direct download; this page is what the stores link to. When one changes, the
 * other changes in the same commit.
 *
 * Written to be honest about the parts that are inconvenient for us — no PIN
 * recovery, data loss is possible, the two purchase ecosystems are separate —
 * because those are exactly the clauses a buyer needs before paying, not after.
 */
import Link from 'next/link';
import {
  FileText, KeyRound, TriangleAlert, Scale, Receipt, Ban, BookOpen,
} from 'lucide-react';
import { PageIntro, GlassCard } from '@/components/ui';
import { Stagger, StaggerItem } from '@/components/motion';

/** Kept in step with `src/app/privacy/page.tsx` and the root LICENSE file. */
const EFFECTIVE = '21 August 2026';
const ENTITY = 'Sandhosh Sivan';
const CONTACT = 'sandhoshsivan00@gmail.com';

function Section({ icon, title, children }: {
  icon: React.ReactNode; title: string; children: React.ReactNode;
}) {
  return (
    <StaggerItem>
      <GlassCard>
        <div className="mb-3 flex items-center gap-2.5">
          <span className="text-accent">{icon}</span>
          <h2 className="text-[15px] font-semibold tracking-[-0.02em]">{title}</h2>
        </div>
        <div className="grid gap-3 text-[13px] leading-relaxed text-ink-soft">{children}</div>
      </GlassCard>
    </StaggerItem>
  );
}

export default function TermsPage() {
  return (
    <Stagger className="grid max-w-[820px] gap-4">
      <StaggerItem>
        <PageIntro
          title="Terms of Use"
          subtitle={`The agreement between you and ${ENTITY} · Effective ${EFFECTIVE}`}
        />
      </StaggerItem>

      <Section icon={<FileText size={17} />} title="The short version">
        <p>
          Khazana is proprietary software published by {ENTITY}, an individual developer. You get
          a personal licence to use it on your own devices. Khazana Pro is a{' '}
          <b className="text-ink">one-time purchase</b>, not a subscription: it does not expire and
          you are never billed again.
        </p>
        <p>
          Where a store&rsquo;s own terms conflict with these, that store&rsquo;s terms govern
          that copy — as Apple and Google both require.
        </p>
      </Section>

      <Section icon={<KeyRound size={17} />} title="Your data is yours">
        <p>
          Your records live on your device, encrypted with a key derived from your PIN. We never
          receive them and cannot read them. See the{' '}
          <Link href="/privacy" className="text-accent underline underline-offset-2">
            privacy policy
          </Link>{' '}
          for the full picture.
        </p>
        <p>
          You can export everything at any time — as an encrypted backup and as plain CSV — and
          both stay available whether or not you have bought Pro.{' '}
          <b className="text-ink">
            No feature that gets your own data out of the app is ever behind a payment.
          </b>
        </p>
        <p>
          <b className="text-ink">We cannot recover your PIN.</b> There is no reset, no recovery
          code and no back door. That is deliberate: a recovery path we controlled would mean we
          could read your vault. If you forget your PIN and have no backup, the data is
          permanently unreadable — by you and by us alike.
        </p>
      </Section>

      <Section icon={<TriangleAlert size={17} />} title="Not financial advice">
        <p>
          Khazana is a record-keeping and calculation tool. Its scores, projections, tax
          estimates, insurance suggestions and written insights are informational only. They are
          not investment, tax, insurance, accounting or legal advice, and are not a recommendation
          to buy or sell anything.
        </p>
        <p>
          {ENTITY} is not a registered investment adviser, broker, insurance intermediary or tax
          practitioner in any jurisdiction. Tax rules, market data and exchange rates change, and
          figures may be out of date or wrong. Verify anything that matters with a qualified
          professional before acting on it.
        </p>
        <p>
          Demo market data, when you switch it on, is generated on your device, is clearly
          labelled, and represents nothing real.
        </p>
      </Section>

      <Section icon={<Ban size={17} />} title="No warranty, and keep your backups">
        <p className="uppercase text-[11.5px] tracking-wide">
          The software is provided &ldquo;as is&rdquo;, without warranty of any kind, express or
          implied, including merchantability, fitness for a particular purpose and
          non-infringement.
        </p>
        <p>
          Stated plainly rather than buried: we do not warrant that the software is free of
          defects, that calculations are correct, or that your data cannot be lost. Data on a
          device can be lost through device failure, loss or theft, an operating-system or browser
          action that clears app storage, a forgotten PIN, or a defect in this software. In the web
          app, the browser itself may clear storage.
        </p>
        <p>
          <b className="text-ink">
            Exporting backups regularly, and keeping them somewhere other than the device running
            Khazana, is your responsibility.
          </b>{' '}
          The app provides the tools; it cannot make the copies for you.
        </p>
      </Section>

      <Section icon={<Scale size={17} />} title="Limitation of liability">
        <p>
          To the maximum extent permitted by law, {ENTITY}&rsquo;s total liability arising out of
          or relating to the software is limited to the amount you actually paid for it in the
          twelve months before the claim, and excludes indirect, incidental, special,
          consequential and punitive damages, lost profits, lost data, and financial decisions
          taken on the basis of the software&rsquo;s output.
        </p>
        <p>
          Nothing here excludes liability that cannot lawfully be excluded. You may have statutory
          rights — including under Indian consumer protection law and, in the EEA and UK,
          mandatory consumer rights — that this agreement does not affect.
        </p>
      </Section>

      <Section icon={<Receipt size={17} />} title="Purchases and refunds">
        <p>
          Purchases made through the App Store, Mac App Store or Google Play are refunded
          according to that store&rsquo;s policy, by that store — we cannot issue those refunds
          ourselves. Direct purchases are handled by our merchant of record and may be refunded
          within 14 days.
        </p>
        <p>
          An app store purchase and a direct licence key are{' '}
          <b className="text-ink">separate</b>. Linking the two would require a server that knows
          who you are, which we do not operate and do not want to. This is stated on the purchase
          screen before you pay, not after.
        </p>
        <p>
          You may not redistribute or resell the software, or share a licence key publicly or
          outside your household.
        </p>
      </Section>

      <Section icon={<BookOpen size={17} />} title="Governing law, and getting in touch">
        <p>
          This agreement is governed by the laws of India, and the courts of Chennai, Tamil Nadu
          have exclusive jurisdiction — except where mandatory local consumer law entitles you to
          bring proceedings where you live, in which case that right is unaffected.
        </p>
        <p>
          Khazana includes open-source components under their own licences, including SQLCipher,
          Flutter, Drift, the Inter typeface, React, Next.js, Dexie and Tauri.
        </p>
        <p>
          Questions:{' '}
          <a href={`mailto:${CONTACT}`} className="text-accent underline underline-offset-2">
            {CONTACT}
          </a>
        </p>
      </Section>
    </Stagger>
  );
}
