'use client';
import Link from 'next/link';
import { ClipboardPaste, FileText, FlaskConical, Globe, KeyRound, Server } from 'lucide-react';
import { Chip } from '@khazana/ui/ui';
import { LegalSection as Section } from '@khazana/screens/components/LegalSection';
import { ENTITY } from '@khazana/screens/copy/legal';
import type { ProductCopy } from '@khazana/screens/platform';

/**
 * Khazana Online: an account, end-to-end encrypted sync, and a server that
 * stores ciphertext only. Every statement here was read out of the sync code
 * (lib/crypto/e2e.ts, lib/sync/codec.ts) and ADRs 0005 and 0006;
 * if those change, this changes in the same commit.
 */
export const onlineCopy: ProductCopy = {
  help: {
    faq: [
      ['Where is my data stored?', 'On this device, in your browser’s IndexedDB, and as encrypted copies on the Khazana server so your other devices can sync. Every record is encrypted on your device with your data key (AES-256-GCM) before it is sent. The server stores ciphertext only and cannot read it.'],
      ['What if I lose my devices or my recovery phrase?', 'Your 24-word recovery phrase can unlock your data key on a new device. Without the phrase and without a signed-in device that already has the key, nobody can decrypt your data — not you, and not us. Keep the phrase somewhere safe and offline.'],
      ['Does Khazana fetch live prices?', 'No. Prices are the ones you enter or import. Asking a market data API for a quote would tell that API exactly which instruments you own, which is the one thing this app promises not to do.'],
      ['Then what is the demo data?', 'Screens that would need a live feed — Markets, News, day-change columns — are filled with figures generated on your device from a fixed seed. They are always labelled, and you can switch them off in Settings.'],
      ['Can I use it on another device?', 'Yes. Sign in on the new device, then approve it from one that is already signed in (a pairing link) or enter your recovery phrase. Manage or sign out devices in Settings → Devices.'],
    ],
    privacyBullets: (
      <>
        <li className="flex gap-2"><Chip tone="success">End-to-end encrypted</Chip> Records are encrypted on your device before they sync. The server stores ciphertext only.</li>
        <li className="flex gap-2"><Chip tone="success">No analytics</Chip> No telemetry of any kind.</li>
        <li className="flex gap-2"><Chip tone="violet"><FlaskConical size={11} />Demo</Chip> Market surfaces are generated locally, and off by default.</li>
        <li className="flex gap-2"><Chip tone="success">No price lookups</Chip> Khazana makes no request to any market data provider. The only network traffic is with the Khazana server, for sign-in and sync.</li>
      </>
    ),
    privacyAction: { label: 'Devices & pairing', href: '/settings/devices' },
    stuck: 'Your records are encrypted with a key only your devices hold, so support cannot see them or recover them for you. Your recovery phrase is the way back in; export your data from Settings before you experiment.',
  },
  privacy: {
    subtitle: 'How Khazana Online handles your data',
    short: (
      <>
        <p>
          Khazana Online keeps your financial records on your devices and syncs encrypted copies between
          them through a server. Everything is encrypted on your device with a key that never leaves
          your devices in readable form, so the server stores data it cannot read. {ENTITY} cannot
          see, sell or hand over the contents of your records. We collect no analytics and no telemetry.
        </p>
        <p>
          The only network traffic is between your browser and the Khazana server, for signing in and
          syncing. The app does not call market-data providers, so no ticker symbol or holding is ever
          sent anywhere.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Chip tone="success">End-to-end encrypted</Chip>
          <Chip tone="success">No analytics</Chip>
          <Chip tone="success">No advertising</Chip>
          <Chip tone="success">No data sold or shared</Chip>
        </div>
      </>
    ),
    dataSections: (
      <>
        <Section icon={<FileText size={17} />} title="What the app stores, and where">
          <p>
            Everything you enter — transactions, accounts, holdings, liabilities, insurance policies,
            budgets, goals, cards and receipts — is stored in your browser’s IndexedDB, and each record
            is also sent to the server as ciphertext so your other devices can fetch it.
          </p>
          <ul className="ml-4 grid list-disc gap-1.5">
            <li>
              <b className="text-ink">Records:</b> encrypted on your device with AES-256-GCM under your
              account’s data key. A record’s identity is bound into the encryption, so a stored record
              cannot be swapped for another without failing to decrypt.
            </li>
            <li>
              <b className="text-ink">The data key:</b> 32 random bytes created on your first device. Each
              of your devices holds a copy sealed to its own key, and a copy is sealed under your 24-word
              recovery phrase (Argon2id, then AES-256-GCM). The server keeps those sealed copies; it cannot
              open them.
            </li>
            <li>
              <b className="text-ink">Receipts:</b> encrypted on your device and uploaded as ciphertext.
              Profile photos stay on the device that set them.
            </li>
          </ul>
          <p>
            If you lose every signed-in device and your recovery phrase, your data cannot be recovered —
            by you or by anyone else. That is a consequence of holding no usable copy of the key, not an
            oversight.
          </p>
        </Section>

        <Section icon={<Server size={17} />} title="What the server sees">
          <p>
            The server holds your account (your sign-in identity and passkeys), your device list with
            device names, and your encrypted records. It can see that a record exists, which kind of
            collection it belongs to, a random identifier, its size, and when it last changed. It cannot
            see amounts, names, merchants, notes, balances or anything else inside a record.
          </p>
          <p>
            Your browser talks to the Khazana server and to no one else: this site’s content security
            policy allows connections to the site itself and the Khazana gateway only. Signing in with
            Google, if you choose it, also loads Google’s sign-in script from Google.
          </p>
        </Section>

        <Section icon={<KeyRound size={17} />} title="Sign-in, devices and recovery">
          <p>
            You sign in with a passkey or with Google. A new device is approved by one that is already
            signed in, after comparing the new device’s key against a fingerprint carried in the pairing
            link, or with your recovery phrase. Removing a device from another device needs a fresh
            passkey check. Signing out removes the session, the keys and the synced records from this
            browser.
          </p>
        </Section>

        <Section icon={<ClipboardPaste size={17} />} title="Bank messages you paste in">
          <p>
            Review takes a bank SMS you paste, or one an iPhone Shortcut opens Khazana with. The message is
            parsed on your device and dropped at once; only the amount, merchant, date and reference number
            are kept, and they sync as encrypted records like everything else. A Shortcut passes the message
            after a <span className="font-mono">#</span> in the address, a part browsers never send to a
            server, and Khazana removes it from the address bar as soon as it is read. Nothing becomes a
            transaction until you approve it.
          </p>
        </Section>

        <Section icon={<Globe size={17} />} title="Exports and moving between devices">
          <p>
            Exports (CSV, Excel, PDF) are files you create and control, and they are not encrypted by
            Khazana. Save them somewhere you trust. To use another device you do not need a file: sign in
            there and approve it, and your encrypted records sync across.
          </p>
        </Section>
      </>
    ),
    rights: 'Because the server holds only ciphertext it cannot read, access, correction and export are things you do yourself in the app. You can sign out of any device and export your data from Settings. To delete your account and the encrypted copies on the server, write to the contact address below.',
    contactNote: 'Support cannot read your records or recover your recovery phrase. Export your data before changing anything.',
    settingsPointer: 'for devices, appearance and export',
  },
  terms: {
    yourData: (
      <>
        <p>
          Your records are encrypted on your device with a key only your devices hold, and are stored on
          the Khazana server as ciphertext. We cannot read them. See the{' '}
          <Link href="/privacy" className="text-accent underline underline-offset-2">
            privacy policy
          </Link>{' '}
          for the full picture.
        </p>
        <p>
          You can export everything at any time — as CSV, Excel, PDF or a full data file.
        </p>
        <p>
          <b className="text-ink">We cannot recover your data key.</b> Your recovery phrase is the only
          way back in if you lose every signed-in device. There is no reset and no back door: a recovery
          path we controlled would mean we could read your data. If you lose every device and the phrase,
          the data is permanently unreadable — by you and by us alike.
        </p>
      </>
    ),
    warranty: (
      <>
        <p className=" text-[11.5px]">
          The software is provided &ldquo;as is&rdquo;, without warranty of any kind, express or
          implied, including merchantability, fitness for a particular purpose and
          non-infringement.
        </p>
        <p>
          Stated plainly rather than buried: we do not warrant that the software or the sync service is
          free of defects, always available, that calculations are correct, or that your data cannot be
          lost. Data can be lost through a defect in this software or the service, a browser action that
          clears site storage, or losing both your devices and your recovery phrase.
        </p>
        <p>
          <b className="text-ink">
            Keeping your recovery phrase safe, and exporting your data regularly, is your responsibility.
          </b>{' '}
          The app provides the tools; it cannot make the copies for you.
        </p>
      </>
    ),
    components: 'libsodium, React and Next.js',
    demoNote: 'Demo market data, when you switch it on, is generated on your device, is clearly labelled, and represents nothing real.',
  },
};
