'use client';
import Link from 'next/link';
import { ClipboardPaste, FileText, FlaskConical, Globe, Server, ShieldCheck, Smartphone } from 'lucide-react';
import { Chip } from '@khazana/ui/ui';
import { LegalSection as Section } from '../components/LegalSection';
import { ENTITY } from './legal';
import type { ProductCopy } from './types';

/** The offline vault: data on this device, no Khazana server. */
export const offlineCopy: ProductCopy = {
  help: {
    faq: [
  ['Where is my data stored?', 'In this browser only, in IndexedDB, encrypted with a key derived from your PIN using PBKDF2 (600,000 iterations) and AES-256-GCM. It is never uploaded, because there is no server to upload it to.'],
  ['What happens if I forget my PIN?', 'The vault cannot be recovered. The PIN is never stored — it derives the key each time you unlock. This is why exporting a backup matters: the backup file carries its own copy of your data and you choose where to keep it.'],
  ['Does Khazana fetch live prices?', 'No. Prices are the ones you enter or import. Asking a market data API for a quote would tell that API exactly which instruments you own, which is the one thing this app promises not to do.'],
  ['Then what is the demo data?', 'Screens that would need a live feed — Markets, News, day-change columns — are filled with figures generated on your device from a fixed seed. They are always labelled, and you can switch them off in Settings → Privacy.'],
  ['Can I move to another device?', 'Export an encrypted backup from Settings, then import it on the other device. The file uses the .ftos format and needs your PIN to open.'],
    ],
    privacyBullets: (
      <>
                <li className="flex gap-2"><Chip tone="success">No server</Chip> No account, and nowhere to upload your vault to.</li>
                <li className="flex gap-2"><Chip tone="success">No analytics</Chip> No telemetry of any kind.</li>
                <li className="flex gap-2"><Chip tone="violet"><FlaskConical size={11} />Demo</Chip> Market surfaces are generated locally, and off by default.</li>
                {/* Scoped honestly: the only request this app makes is a
                    live-price refresh, and the mobile app also calls price and
                    FX providers on request. Claiming "never touches the
                    network" would be false, and the privacy policy a reviewer
                    reads says so. */}
                <li className="flex gap-2"><Chip tone="success">Prices only</Chip> The only request Khazana makes is a live-price refresh, carrying a ticker symbol and nothing about you. Turn live prices off in Settings and nothing leaves at all.</li>
      </>
    ),
    privacyAction: { label: 'Export a backup', href: '/settings' },
    stuck: 'Khazana runs entirely on your device, so there is no account to look up and no support team who can see your data. Exporting a backup before you experiment is always the safe move.',
  },
  privacy: {
    subtitle: 'How Khazana handles your data',
    short: (
      <>
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
      </>
    ),
    dataSections: (
      <>
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
          No Khazana server holds your data. No screen in the product uploads your records anywhere.
          The requests the app can make are these, and no others:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full fs-12.5">
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
                ['khazana-app.netlify.app (web only)', 'Relays the Yahoo quote request, since a browser cannot call Yahoo directly. Stores and logs nothing.', 'The ticker symbol only'],
                ['api.twelvedata.com', 'Share and ETF quotes', 'The ticker symbol only'],
                ['www.alphavantage.co', 'Share and ETF quotes', 'The ticker symbol only'],
                ['portal.amfiindia.com', 'Mutual-fund NAVs', 'Nothing — a public file is downloaded'],
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

      <Section icon={<Server size={17} />} title="Syncing between your devices">
        <p>
          Optional, and off until you turn it on in Settings. Each device writes one file into a folder
          you choose, such as iCloud Drive or Dropbox, and reads the files your other devices wrote there.
          The file is encrypted on the device with a sync passphrase you set (PBKDF2-SHA256, 600,000
          rounds, then AES-256-GCM), so the folder&rsquo;s provider stores data it cannot read; even
          device names are inside the encryption. Khazana runs no sync server and makes no network
          request for this — the folder&rsquo;s own service moves the files. The passphrase is kept
          encrypted in this device&rsquo;s vault, never in a backup, and cannot be recovered by us.
          Receipt images stay on the device that took them.
        </p>
      </Section>

      <Section icon={<ClipboardPaste size={17} />} title="Bank messages you paste in">
        <p>
          On the web and desktop, Review takes a bank SMS you paste, or one an iPhone Shortcut
          opens Khazana with. The message is parsed on your device and dropped at once; only
          the amount, merchant, date and reference number are kept, in your encrypted vault.
          A Shortcut passes the message after a <span className="font-mono">#</span> in the
          address, a part browsers never send to a server, and Khazana removes it from the
          address bar as soon as it is read. Nothing becomes a transaction until you approve it.
        </p>
        <p>
          <b className="text-ink">The Mac app can read Messages</b> (optional, off until you turn it
          on in Settings). With Text Message Forwarding, your iPhone copies its SMS to the Mac, and
          Khazana reads them from the Messages database. macOS requires Full Disk Access for this,
          which you grant in System Settings and can withdraw there. Khazana opens the database
          read-only and selects only received SMS from bank sender IDs such as AX-HDFCBK; messages
          from phone numbers or email addresses — the people you talk to — are excluded in the query
          itself and never read. Each bank message is parsed, dropped, and waits in Review like a
          pasted one. Nothing is transmitted.
        </p>
      </Section>

      <Section icon={<Smartphone size={17} />} title="Permissions the mobile app asks for">
        <ul className="ml-4 grid list-disc gap-1.5">
          <li>
            <b className="text-ink">Notification access</b> (optional) — so the app can read
            transaction alerts from your bank and offer to file them. Khazana shows an
            explanation inside the app and asks for your agreement before it takes you to the
            system screen where you grant this. Android shares the notifications on your phone
            with an app that holds this access, so Khazana can technically see all of them; it
            checks each one in memory for a bank or UPI payment alert and ignores the rest. The
            text is parsed on the device and thrown away straight away. Only the amount,
            merchant and date of a payment alert are kept, in your encrypted vault, and only
            after you approve the suggestion. Nothing is transmitted, shared or used for
            advertising. You grant this in system settings and can withdraw it there at any
            time (Settings, Notifications, Notification access); the feature is off until you
            turn it on.
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

      </>
    ),
    rights: `Because your data never reaches us, requests to access, correct, export or delete it are
          things you carry out yourself and do not need our involvement for. Export produces an
          encrypted backup; erase removes the vault from the device permanently. Both are in
          Settings.`,
    contactNote: `Because the app holds no account and no copy of your data, support cannot look anything
          up on your behalf. Exporting a backup before changing anything is always the safe move.`,
    settingsPointer: 'for backup and erase',
  },
  terms: {
    yourData: (
      <>
        <p>
          Your records live on your device, encrypted with a key derived from your PIN. We never
          receive them and cannot read them. See the{' '}
          <Link href="/privacy" className="text-accent underline underline-offset-2">
            privacy policy
          </Link>{' '}
          for the full picture.
        </p>
        <p>
          You can export everything at any time — as an encrypted backup and as plain CSV.
        </p>
        <p>
          <b className="text-ink">We cannot recover your PIN.</b> There is no reset, no recovery
          code and no back door. That is deliberate: a recovery path we controlled would mean we
          could read your vault. If you forget your PIN and have no backup, the data is
          permanently unreadable — by you and by us alike.
        </p>
      </>
    ),
    warranty: (
      <>
        <p className=" fs-11.5">
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
      </>
    ),
    components: 'SQLCipher, Flutter, Drift, the Inter typeface, React, Next.js, Dexie and Tauri',
    demoNote: 'Demo market data, when you switch it on, is generated on your device, is clearly labelled, and represents nothing real.',
  },
};
