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
import { ShieldCheck, Server, Smartphone, Globe, Mail, FileText } from 'lucide-react';
import { PageIntro, GlassCard, Chip } from '@/components/ui';
import { Stagger, StaggerItem } from '@/components/motion';

/** Kept in one place so the effective date cannot drift between mentions. */
const EFFECTIVE = '21 August 2026';
/**
 * The publisher, as it appears on the App Store and Play listings. Khazana is
 * published by an individual, so this is a person rather than a company.
 */
const ENTITY = 'Sandhosh Sivan';
/**
 * The support address both stores require, and the only channel through which
 * a user can reach us. Deliberately the Khazana address, not a shared one.
 */
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

export default function PrivacyPage() {
  return (
    <Stagger className="grid max-w-[820px] gap-4">
      <StaggerItem>
        <PageIntro
          title="Privacy Policy"
          subtitle={`How Khazana handles your data · Effective ${EFFECTIVE}`}
        />
      </StaggerItem>

      <Section icon={<ShieldCheck size={17} />} title="The short version">
        <p>
          Khazana stores your financial records on your own device, encrypted. {ENTITY} operates
          no account system and no backend that receives your data, so there is nothing for us to
          look at, sell, or hand over. We collect no analytics and no telemetry.
        </p>
        <p>
          The app does make a small number of outbound requests — but only for public market
          prices, only when you ask it to, and never carrying anything about you. Those are listed
          in full below.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Chip tone="success">No account</Chip>
          <Chip tone="success">No analytics</Chip>
          <Chip tone="success">No advertising</Chip>
          <Chip tone="success">No data sold or shared</Chip>
        </div>
      </Section>

      <Section icon={<FileText size={17} />} title="What the app stores, and where">
        <p>
          Everything you enter — transactions, accounts, holdings, liabilities, insurance
          policies, budgets, goals and any files you attach — is written to storage on the device
          you entered it on.
        </p>
        <ul className="ml-4 grid list-disc gap-1.5">
          <li>
            <b className="text-ink">Web app:</b> in your browser&apos;s IndexedDB. Records are
            encrypted with AES-256-GCM using a key derived from your PIN with PBKDF2
            (600,000 iterations). The PIN itself is never stored and never leaves the device.
          </li>
          <li>
            <b className="text-ink">Mobile and desktop apps:</b> in an encrypted SQLite database
            (SQLCipher) on the device. The database key is held in the platform keychain or
            keystore.
          </li>
        </ul>
        <p>
          If you forget your PIN, your data cannot be recovered — by you or by anyone else. That
          is a consequence of holding no copy of it, not an oversight.
        </p>
      </Section>

      <Section icon={<Server size={17} />} title="What leaves your device">
        <p>
          There is no Khazana server. No screen in the product uploads your records anywhere.
          The requests the app can make are these, and no others:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2 pr-3 font-semibold">Destination</th>
                <th className="py-2 pr-3 font-semibold">Why</th>
                <th className="py-2 font-semibold">What is sent</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {[
                ['query1.finance.yahoo.com', 'Share and ETF quotes', 'The ticker symbol only'],
                ['api.twelvedata.com', 'Share and ETF quotes', 'The ticker symbol only'],
                ['www.alphavantage.co', 'Share and ETF quotes', 'The ticker symbol only'],
                ['www.amfiindia.com', 'Mutual-fund NAVs', 'Nothing — a public file is downloaded'],
                ['api.frankfurter.dev', 'Currency exchange rates', 'Currency codes only'],
              ].map(([host, why, what]) => (
                <tr key={host} className="border-b border-line/60">
                  <td className="py-2 pr-3 font-medium text-ink">{host}</td>
                  <td className="py-2 pr-3">{why}</td>
                  <td className="py-2">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          These run when you tap refresh, or when a screen needs a price you have asked it to
          track. No amount, balance, holding size or personal identifier is included in any of
          them — a quote request carries a symbol, which is the same request anyone looking up
          that price would make. Each provider will see your IP address, as they would for any
          web request. If you never refresh prices, the app makes no network requests at all.
        </p>
      </Section>

      <Section icon={<Smartphone size={17} />} title="Permissions the mobile app asks for">
        <ul className="ml-4 grid list-disc gap-1.5">
          <li>
            <b className="text-ink">Notification access</b> (optional) — so the app can read
            transaction alerts from your bank and offer to file them. The text is parsed on the
            device and nothing is transmitted. You grant this in system settings and can withdraw
            it there at any time; the feature is off until you do.
          </li>
          <li>
            <b className="text-ink">SMS — not requested.</b> Khazana does not ask for
            <span className="font-mono"> READ_SMS</span> or
            <span className="font-mono"> RECEIVE_SMS</span>, and cannot read your text messages.
            An earlier build did, for banks that text rather than push a notification; it was
            removed. Those are among the most sensitive permissions on the platform, and the
            notification access above covers the same alerts without ever holding the keys to
            your inbox.
          </li>
          <li>
            <b className="text-ink">Notifications</b> — to remind you about bills, renewals and
            budget limits. Reminders are scheduled on the device.
          </li>
          <li>
            <b className="text-ink">Biometrics</b> (optional) — to unlock the vault with Face ID,
            Touch ID or a fingerprint. The app receives only a yes or no from the operating
            system; it never sees biometric data.
          </li>
          <li>
            <b className="text-ink">Files</b> — only the files you explicitly pick, when importing
            a statement or exporting a backup.
          </li>
        </ul>
      </Section>

      <Section icon={<Globe size={17} />} title="Backups and moving between devices">
        <p>
          Backups are files you create and control. They are encrypted with your PIN and written
          wherever you choose to save them. If you place a backup in a cloud drive, that provider
          holds the file — under their privacy policy, not this one — though its contents remain
          encrypted and unreadable without your PIN.
        </p>
      </Section>

      <Section icon={<ShieldCheck size={17} />} title="Children">
        <p>
          Khazana is a personal finance tool intended for adults. It is not directed at children,
          and because it operates no account system it knowingly collects no information from
          anyone, including children.
        </p>
      </Section>

      <Section icon={<FileText size={17} />} title="Your rights">
        <p>
          Because your data never reaches us, requests to access, correct, export or delete it are
          things you carry out yourself and do not need our involvement for. Export produces an
          encrypted backup; erase removes the vault from the device permanently. Both are in
          Settings.
        </p>
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
        <p className="text-muted">
          Because the app holds no account and no copy of your data, support cannot look anything
          up on your behalf. Exporting a backup before changing anything is always the safe move.
        </p>
      </Section>

      <StaggerItem>
        <p className="px-1 text-[12px] text-muted">
          See also{' '}
          <Link href="/help" className="text-accent hover:underline">Help</Link>{' '}
          for how the product works, and{' '}
          <Link href="/settings" className="text-accent hover:underline">Settings</Link>{' '}
          for backup and erase.
        </p>
      </StaggerItem>
    </Stagger>
  );
}
