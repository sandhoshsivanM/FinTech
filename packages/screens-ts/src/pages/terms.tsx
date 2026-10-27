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
 * recovery, data loss is possible — because those are exactly the clauses a
 * user needs before trusting the app with their records.
 */
import { FileText, KeyRound, TriangleAlert, Scale, Ban, BookOpen } from 'lucide-react';
import { PageIntro } from '@khazana/ui/ui';
import { Stagger, StaggerItem } from '@khazana/ui/motion';
import { LegalSection as Section } from '../components/LegalSection';
import { getPlatform } from '../platform';
import { CONTACT, EFFECTIVE, ENTITY } from '../copy/legal';

export default function TermsPage() {
  const { terms } = getPlatform().copy;
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
          a personal licence to use it on your own devices. Khazana is{' '}
          <b className="text-ink">free</b>: there is nothing to buy, no subscription and nothing
          to unlock. You may not redistribute or resell the software.
        </p>
        <p>
          Where a store&rsquo;s own terms conflict with these, that store&rsquo;s terms govern
          that copy — as Apple and Google both require.
        </p>
      </Section>

      <Section icon={<KeyRound size={17} />} title="Your data is yours">
        {terms.yourData}
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
        <p>{terms.demoNote}</p>
      </Section>

      <Section icon={<Ban size={17} />} title="No warranty, and keep your backups">
        {terms.warranty}
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

      <Section icon={<BookOpen size={17} />} title="Governing law, and getting in touch">
        <p>
          This agreement is governed by the laws of India, and the courts of Chennai, Tamil Nadu
          have exclusive jurisdiction — except where mandatory local consumer law entitles you to
          bring proceedings where you live, in which case that right is unaffected.
        </p>
        <p>
          Khazana includes open-source components under their own licences, including {terms.components}.
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
