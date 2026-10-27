'use client';
/**
 * The privacy policy.
 *
 * This is the URL both app stores require in their listing, and it is also the
 * page a reviewer reads before deciding whether the Data Safety declaration is
 * truthful. So it is written to be ACCURATE rather than flattering.
 *
 * In particular it does not repeat the Help screen's "No server — nothing to
 * upload to." That is true of this web app and FALSE of the mobile app, which
 * calls out to price and NAV providers when the user refreshes, and can read
 * bank messages for transaction capture. A policy that overclaims is itself
 * grounds for rejection, and it would be the one document in the product that
 * lies about the product.
 *
 * Every host and permission named below was read out of the source rather than
 * recalled: the endpoints from `lib/`, the permissions from AndroidManifest.xml,
 * the crypto parameters from `lib/crypto.ts`.
 *
 * Published by an individual developer, not a company — which is stated
 * plainly below rather than dressed up, because both stores show the publisher
 * name next to the listing and a mismatch between that and this page is exactly
 * what a reviewer checks. If Khazana is ever moved into a registered entity,
 * ENTITY changes here, in the store listings, and in the EULA together.
 */
import Link from 'next/link';
import { ShieldCheck, Mail, FileText } from 'lucide-react';
import { PageIntro } from '@khazana/ui/ui';
import { Stagger, StaggerItem } from '@khazana/ui/motion';
import { LegalSection as Section } from '../components/LegalSection';
import { getPlatform } from '../platform';
import { CONTACT, EFFECTIVE, ENTITY } from '../copy/legal';

export default function PrivacyPage() {
  const { privacy } = getPlatform().copy;
  return (
    <Stagger className="grid max-w-[820px] gap-4">
      <StaggerItem>
        <PageIntro
          title="Privacy Policy"
          subtitle={`${privacy.subtitle} · Effective ${EFFECTIVE}`}
        />
      </StaggerItem>

      <Section icon={<ShieldCheck size={17} />} title="The short version">
        {privacy.short}
      </Section>

      {privacy.dataSections}

      <Section icon={<ShieldCheck size={17} />} title="Children">
        <p>
          Khazana is a personal finance tool intended for adults. It is not directed at children,
          and because it operates no account system it knowingly collects no information from
          anyone, including children.
        </p>
      </Section>

      <Section icon={<FileText size={17} />} title="Your rights">
        <p>{privacy.rights}</p>
      </Section>

      <Section icon={<FileText size={17} />} title="Changes">
        <p>
          If this policy changes, the effective date above changes with it and the revised version
          is published at this address. Material changes will also be noted in the app&apos;s
          release notes.
        </p>
      </Section>

      <Section icon={<Mail size={17} />} title="Contact">
        <p>
          {ENTITY} — {CONTACT}
        </p>
        <p className="text-muted">{privacy.contactNote}</p>
      </Section>

      <StaggerItem>
        <p className="px-1 text-[12px] text-muted">
          See also{' '}
          <Link href="/help" className="text-accent hover:underline">Help</Link>{' '}
          for how the product works, and{' '}
          <Link href="/settings" className="text-accent hover:underline">Settings</Link>{' '}
          {privacy.settingsPointer}.
        </p>
      </StaggerItem>
    </Stagger>
  );
}
