# Khazana Online: store listing draft (Play and App Store)

**Status: draft, not for submission.** Written for the launch described in the design (section 15.2, P6). Copy in a code block is the text to paste. Items in `[square brackets]` depend on an open decision (section 6). Character counts are measured in section 7.

The offline app's listing (`docs/store-listing.md`) was read for tone only. Its central claim, "your data never leaves your device, because there is nowhere for it to go", is **false for Khazana Online**, which syncs through a server. Do not reuse it, or any of these phrases: "no server", "no account", "nothing leaves your device", "no network".

## 1. What is true about the product, and what the copy may say

Every claim in the copy must match what ships. This table is the check.

| Claim | Status in code (base 8f1de24) | Copy rule |
|---|---|---|
| Accounts: bank, cash, credit card, balances, net worth | Built in web (`webapp-online/src/app/home`, `account`). Not built on mobile (`mobile-online` home is a placeholder). | Say it at launch only if mobile ships it. |
| Transactions: add, edit, delete, categories | Built in web (`account/page.tsx`). Not on mobile. | As above. |
| Records encrypted on the device before sync | Built in web (`lib/crypto/e2e.ts`, `lib/ledger.ts`). Pinned by `contracts/crypto/vectors.json`. Not on mobile. | Say it. Do not say "audited" (the independent crypto review is not done, design section 14.2). |
| Server stores ciphertext and routing metadata only | Designed and implemented in Sync (`backend/services/Sync/.../SyncDbContext.cs`: ciphertext, record id, collection, timestamps). | Say it, with the email exception below. |
| Email and display name are stored (encrypted at rest, readable by the server) | `backend/services/Identity/.../Ports.cs:6`, `IdentityDbContextModelSnapshot.cs` (`EmailEnc`, `DisplayNameEnc`). Stored only when the provider says the email is verified (`Ports.cs:23`). | Must disclose. Do not say "the server cannot read anything". |
| Sign in with a passkey | Built in web (`lib/passkey.ts`). Not on mobile ("coming soon", `mobile-online/lib/features/sign_in_screen.dart:63`). | Launch claim only once mobile ships it. |
| Sign in with Google | Web button code exists (`webapp-online/src/lib/google.ts`). Backend verifier exists. Not on mobile. | `[decision 4]` |
| Sign in with Apple | Backend verifier exists (`IdTokenVerifiers.cs:94`). No client button in web or mobile. | `[decision 4]`. Apple requires it when Google sign-in is offered on iOS. |
| Pair a new device by QR code or link | Built in web (`setup/link`, `pair`). Not on mobile. | Launch claim only with mobile. |
| 24-word recovery phrase; Khazana cannot reset it | Built in web (`setup/new`, `lib/crypto/phrase.ts`). | Say it. It is the most important warning in the listing. |
| Devices list, rename, remove | On branch `feat/online-device-management` (7433821), not on trunk. | Say it only after that branch merges. |
| Changes offline, synced later | Web outbox and sync engine (`lib/sync/engine.ts`). Mobile sync not built. | As above. |
| Free, no ads, no tracking | Owner decision (see memory and ADR 0007). No ad or analytics package in either app. | Say "free". `[decision 5]` |
| Bank feeds (Account Aggregator), credit reports, card offers | Design P4 and P5. Not built. | Must not be claimed for this version. |
| SMS or notification capture in the online app | ADR 0007 open item: not decided. | Must not be claimed until decided. |

## 2. Google Play

### 2.1 Store listing

| Field | Value |
|---|---|
| App name (30 max) | `[decision 1]` Working name: `Khazana Online` |
| Short description (80 max) | see below |
| Full description (4000 max) | see below |
| Category | Finance |
| Tags | Personal finance, Budgeting |
| Developer contact email | `[decision 3]` support address on the custom domain |
| Website | `[decision 2]` `https://[domain]/` |
| Privacy policy URL | `[decision 2]` `https://[domain]/privacy/`. Must be live, and must match section 2.4. |
| Account deletion URL | `[decision 2]` `https://[domain]/delete-account/`. Play requires a web page for this if the app creates accounts. |

**Short description**
```
Your money on every device, encrypted before it syncs. Free. No ads.
```

**Full description**
```
Khazana Online keeps your accounts and transactions in step across your phone, tablet and computer. Each record is encrypted on your device before it is sent. Our servers keep only the encrypted records and the details needed to sync them. They cannot read your balances, transactions or notes.

SIGN IN WITHOUT A PASSWORD
Use a passkey (your fingerprint, face or device PIN). [Google and Apple sign-in, if decided.] There is no password to remember, and nothing to leak.

WHAT YOU CAN DO
- Accounts: bank accounts, cash and credit cards, with balances and your net worth.
- Transactions: add, edit and delete, with a category, date and note.
- The same data on every device you sign in to. Changes made offline are saved on the device and sent when you are back online.
- Add a new device by scanning a code on a device you already use, or enter your 24-word recovery phrase.
- Devices: see every device signed in to your account. [Rename or remove a device, once that ships.]

HOW YOUR DATA IS PROTECTED
- A data key is created on your first device. It is never sent in readable form. Each of your devices holds its own copy, sealed to that device.
- Each record is encrypted on your device with that key before it is sent.
- The server stores encrypted records. It also stores what it needs to sync them: which record changed, when, and how large it is.
- Your email address and display name, if your sign-in provider gives them to us, are stored encrypted on our servers. Unlike your financial records, the server needs these to sign you in, so it can read them.
- Your 24-word recovery phrase is the only way back into your data if you lose every device. Khazana cannot see it and cannot reset it. Write it on paper, keep it somewhere safe, and do not photograph it.

WHAT KHAZANA ONLINE DOES NOT DO
- No ads, no tracking, no selling of data, no loan offers.
- No bank login and no automatic bank feeds in this version.
- No credit reports and no card offers in this version.
- It is a record-keeping and calculation tool, not investment, tax or insurance advice.

FREE
Khazana Online is free. There is no subscription and no paywall. [Confirm the wording against decision 5 before publishing.]

ONLY ON ONE DEVICE?
If you want your money on a single phone or computer, the offline Khazana app keeps everything on that device. It is a separate app with its own listing.

PRIVACY AND TERMS
Privacy policy: [link]. Terms: [link]. Support: [email].
```

**Release notes (500 max)**
```
First release of Khazana Online.

- Accounts and transactions, synced across your signed-in devices
- Encrypted on your device before it is sent
- Add a device with a code, or with your recovery phrase
- Free, with no ads and no tracking
```

### 2.2 App content declarations

| Section | Answer (draft) | Notes |
|---|---|---|
| Ads | No | Matches the app. |
| App access | Explain the sign-in path (section 5). The reviewer cannot use a real passkey on a shared device. | `[decision 9]` |
| Target audience | 18 and over | Matches the offline app. |
| Financial features | Personal finance tracker. Do not tick lending, trading, payments, wallets or insurance sales. | As the offline app. |
| Health apps, news, government | No | |
| In-app purchases | No | |
| Content rating | Expected Everyone, from the IARC questionnaire. Check the answers again if the result is higher. | Same as the offline app. |

### 2.3 App access instructions (paste into the console)

```
Khazana Online needs an account. The reviewer's access path is: [decision 9, to be written when chosen].

For example: a review account that signs in with a passkey created on a test device, or a review-only sign-in that the owner enables for the review period only.

After signing in, the app asks for a new data key (first device) or a pairing code (second device). Tap "Create account key", write the 24 words down, confirm three of them, and the home screen opens. Accounts and transactions can then be added from the Accounts section.
```

### 2.4 Data safety form (draft, to verify against the console)

Declare what ships at launch. Google's guidance treats data sent to your servers as collected even when it is encrypted. The answers below follow that, and are conservative. `[decision 8]` asks the owner to confirm the reading against Google's current help text before submission.

| Question | Answer |
|---|---|
| Data collected | Yes |
| Data shared with third parties | No |
| Data encrypted in transit | Yes (TLS. Confirm the TLS version and the pinning status before answering; pinning is not built, see MASVS NETWORK-2.) |
| Users can ask for data deletion | Yes, once in-app and web account deletion exist. Answer No until they do. |

| Data type | Collected | Optional | Purpose | Notes |
|---|---|---|---|---|
| Email address | Yes, if the sign-in provider gives a verified email | Yes | Account management | Stored encrypted at rest on the server. Only if decision 4 includes an email-based or Google sign-in. |
| Name | Yes, if the provider gives one | Yes | Account management | Display name, encrypted at rest. |
| Financial info: other financial info (accounts, balances, transactions) | Yes, end-to-end encrypted | No | App functionality | The server cannot read it. Declared as collected, conservatively. |
| Device or other IDs (device ID, device public key, device name, platform, app version) | Yes | No | App functionality, device management | Device name is user-chosen or defaulted. |
| App activity, app info and performance (crash logs) | No | | | **Change this if error tracking is added** (decision 10). |
| Location, contacts, messages, photos, health, web browsing | No | | | |

## 3. Apple App Store

### 3.1 App information

| Field | Value |
|---|---|
| App name (30 max) | `[decision 1]` Working name: `Khazana Online` |
| Subtitle (30 max) | `Encrypted money, every device` |
| Primary category | Finance |
| Support URL | `[decision 2]` `https://[domain]/support/` |
| Privacy policy URL | `[decision 2]` `https://[domain]/privacy/` |
| Price | Free |

**Promotional text (170 max, may be changed without review)**
```
Your accounts and transactions on every device you sign in to, encrypted on your phone before they sync. Free, with no ads and no tracking.
```

**Keywords (100 max, comma-separated, no spaces)**
```
finance,budget,expense,networth,accounts,sync,encrypted,private,tracker,passkey,money,rupee
```

**Description:** reuse the full description in section 2.1, with the same section order, so the two listings tell one story.

### 3.2 App Privacy (nutrition labels, draft)

Apple counts data as collected when it is sent off the device and is accessible to the developer for longer than the moment of processing. Encrypted data the developer cannot read is **not obviously** outside that definition. Declare conservatively, as on Play. `[decision 8]`

| Data type | Linked to user | Used for tracking | Purpose |
|---|---|---|---|
| Contact info: email address | Yes (if provided) | No | App functionality |
| Contact info: name | Yes (if provided) | No | App functionality |
| Financial info: other financial info (encrypted) | Yes | No | App functionality |
| Identifiers: user ID | Yes | No | App functionality |
| Identifiers: device ID | Yes | No | App functionality |
| Diagnostics | No | No | (none, unless decision 10 changes this) |

Tracking: **none**. Do not declare any tracking domains.

### 3.3 App Review notes (draft)

```
Khazana Online syncs a user's encrypted financial records between their own devices. It needs a sign-in. The reviewer's access path is: [decision 9].

Sign-in is with a passkey. [Google and Sign in with Apple, if decision 4 includes them.] A passkey is created on the device and cannot be shared, so a review account is provided in the Review Information section: [credentials or a review-only sign-in, to be filled in by the owner].

Account deletion is in Settings, under Delete account. [Confirm this exists before submission; Apple requires it for apps that create accounts.]

The app has no advertising, no analytics and no tracking. The server stores encrypted financial records and the minimum needed to sync them.
```

## 4. Privacy policy and terms: required content (not yet written)

These need the policy text to say the same things as the listing. The policy is a legal document. The owner should review it, and the design lists it as a paperwork item (section 15.3).

- What is collected: the email address and name (if provided), the device details, and the encrypted financial records.
- What the server can and cannot read, stated the same way as the listing.
- Where the data is stored. The design plans AWS Mumbai (ap-south-1) with a disaster-recovery copy in Hyderabad (ap-south-2), which keeps data in India (design section 14.2). Confirm the region before publishing.
- The recovery phrase: the consequence of losing it and every device.
- Retention, deletion and the deletion cooling-off period (design section 14.3).
- The processors (AWS, the email provider for magic links if used).
- Rights under the DPDP Act 2023 and a grievance contact.
- Breach notification. The design promises CERT-In reporting within 6 hours and DPDP notice to the Board.

## 5. Sign-in path for reviewers and for the first screen

Both stores need a way for a reviewer to get in without a real account. Options:

1. A review account that signs in with a passkey on a test device the owner keeps for the review period.
2. A review-only sign-in on production, enabled only for the review window and removed after. This needs a server change and a risk review. The development provider must **not** be used: the backend refuses it outside Development (`backend/services/Identity/.../DependencyInjection.cs:78-82`), and the mobile client compiles it into release builds (MASVS CODE-3).

## 6. Open decisions for the owner

| # | Decision | Why it matters | Options and recommendation |
|---|---|---|---|
| 1 | App name (ADR 0007 open item) | The name is in the store title, the icon, the domain and the copy. Stores reject names that are taken or confusable. | `Khazana Online` (in code today). Alternatives within limits: `Khazana Sync`, `Khazana Vault Sync`. Check trademark and store availability before the icon is made. |
| 2 | Domain | Privacy, terms, support and account-deletion URLs need it. `*.netlify.app` is not credible for finance (release checklist). | Buy a domain and point the Online site at it. Register it before the store listing is written. |
| 3 | Support email | Both stores require a working support URL and contact. | Mailbox on the domain. Set up forwarding before submission. |
| 4 | Sign-in methods at launch | Drives the data-safety email answer, Sign in with Apple (required if Google is offered on iOS), and which copy is true. | Passkey and Google at launch, Apple with them. Each one added is a client build, a store review and a copy change. |
| 5 | Free, and the cost model | "Free" is a public commitment and hard to reverse. The design (D13) still lists monetisation as undecided by Dec 2027, and the running costs are real (section 13.2 of the design). | The copy says free, as instructed. Before publishing, confirm the cost model that keeps it free, for example the cost of the cloud and the partner fees. |
| 6 | Which on-device features reach the online app (SMS, notification capture, Review inbox, OCR) | Claims about capture must not appear until decided (ADR 0007, open item). | Leave them out of v1 copy. |
| 7 | Cryptography claims | The independent cryptography review (design section 14.2) is not done. "Audited" or "independently verified" would be false. | Use "encrypted on your device", never "audited", until the review is done. |
| 8 | "Collected" for encrypted financial data, on Play and Apple | Changes the declared answers, and getting them wrong is a policy problem. | The draft declares conservatively. Confirm against the current Play and Apple help text before submission. |
| 9 | Reviewer access path | Both stores reject an app they cannot open. | Option 1 or 2 in section 5. Decide before the first submission. |
| 10 | Crash reporting and error tracking | Adding a tool (the design lists error tracking in section 13.2) changes the data-safety and label answers. | Decide before the first build; if added, declare it and choose a provider in the EU or India with a DPA. |
| 11 | Distinct icon, screenshots and feature graphic | ADR 0007 says each product has its own store listing. The offline assets must not be reused. | Design new assets in the Zentra tokens (`packages/domain-ts/tokens.css`), with brand-mark colours only (see the strict palette rule). |
| 12 | Target countries and languages | Affects the policy (DPDP is Indian law) and the copy (English only today). | India first, English. Confirm before the Play and App Store availability is set. |
| 13 | Age rating and audience | Matches the offline app today (18+). | Keep 18+ unless the product changes. |

## 7. Character counts (measured)

Measured on 2026-10-27 from the text in this file (the code blocks and the inline values). Limits are the store limits. Re-measure after any edit.

| Field | Limit | Measured | Status |
|---|---|---|---|
| Play short description | 80 | 68 | within |
| Play full description | 4000 | 2450 | within |
| Play release notes | 500 | 237 | within |
| Apple subtitle | 30 | 29 | within, 1 to spare |
| Apple promotional text | 170 | 139 | within |
| Apple keywords (commas, no spaces) | 100 | 91 | within |
| Working app name (both stores) | 30 | 14 | within |

## 8. Checks before submission

1. Every claim in section 1 is either built and shipped in that version, or removed from the copy.
2. The privacy policy and terms at the URLs above say the same things as the data-safety and privacy-label answers.
3. The data-safety form matches the release build, not this draft: run the release build and check its network calls and permissions.
4. No copy uses the phrases banned in the first paragraph of this document.
5. The offline app's listing and the online listing do not cross-link, except for the single line "Khazana, the offline app" in the description, which points to a separate listing.
