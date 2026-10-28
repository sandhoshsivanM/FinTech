# Khazana Online: launch checklist (paid and external items)

- **Purpose:** every item that costs money, needs an outside party, or has a waiting period, and needs the owner's decision before the app can go live. Written for Phase 6 (design section 15.2), with the items that must start earlier listed in order.
- **Date:** 2026-10-27.
- **Sources:** costs are from the design, section 13 (INR, per the design's own estimates). "Quote needed" means the design gives no figure. Store fees are as the design and `docs/RELEASE-CHECKLIST.md` state them. Anything else is marked as unverified.
- **Not a legal opinion.** The company, privacy, consent and regulatory items need a lawyer or accountant. This list says what is needed and when.

## 1. Status key

| Column | Meaning |
|---|---|
| Needed for a free sync launch | **Yes**: the online app cannot go live without it. **Conditional**: needed only if a named feature ships. **No**: a later phase. |
| Lead time | How long it takes before it can be used. Waiting periods are the real critical path. |
| Decision | The owner must choose. Options are in `docs/online/store-listing-draft.md`, section 6, where the number is given. |

## 2. Items

### 2.1 Accounts and registrations

| # | Item | Needed for a free sync launch | Cost | Lead time | Decision | Status today |
|---|---|---|---|---|---|---|
| A1 | Google Play Console developer account | Yes | $25, once | Days (identity check). Then a 12-tester, 14-day closed test before production. | Individual or organisation account (organisation needs A6). | `docs/RELEASE-CHECKLIST.md` marks it **BLOCKER**. Whether it is already registered is not in the repository: confirm. |
| A2 | Apple Developer Program | Yes | $99 per year | Days to a few weeks. | Team ID. The committed team ID may be stale (`docs/RELEASE-CHECKLIST.md`, BLOCKER). | Not confirmed. The only local signing identity belongs to another team. |
| A3 | Android release keystore | Yes | Free | Immediate, but losing it is permanent. | Back it up off the machine. | **BLOCKER** in the release checklist. `mobile-online/android/app/build.gradle.kts:37` still signs release with the debug key. |
| A4 | iOS provisioning and push capabilities (Sign in with Apple, Associated Domains for passkeys) | Yes | Included in A2 | With A2. | Bundle ID `com.khazana.online`. | No entitlements file exists in `mobile-online/ios/Runner/`, so Associated Domains is not set. |

### 2.2 Domain, email, hosting

| # | Item | Needed for a free sync launch | Cost | Lead time | Decision | Status today |
|---|---|---|---|---|---|---|
| B1 | Custom domain for Khazana Online | Yes | About ₹0.05 L per year, with email and certificates (design 13.1) | Days | **Decision 2.** Passkeys bind to the domain (see B3). | Not chosen. `*.netlify.app` is not credible for a finance product (release checklist). |
| B2 | Support mailbox on the domain | Yes (both stores need a support contact and URL) | Included in B1 | Days | **Decision 3.** | Not set up. |
| B3 | Passkey relying-party setup on the domain: web (`webapp-online`) and mobile (Associated Domains on iOS, Digital Asset Links on Android) | Yes, if passkey sign-in ships | Free | Days, but depends on B1 and on the release keystore (A3) for the Android fingerprint | Domain (B1). | Web passkeys work on `localhost:3100` in development only (`webapp-online/README.md`). Mobile has no passkey code. |
| B4 | CORS and gateway origin for production | Yes | Free | Hours, once B1 exists | Domain (B1). | Gateway allow-list is set per environment (`Gateway:AllowedOrigins`); production value unknown. |
| B5 | Netlify site for `webapp-online` (its own site, ADR 0007), with the production `NEXT_PUBLIC_GATEWAY_URL` | Yes | Free tier as far as the repository shows; check the plan limits for commercial use | Hours | Plan. | `webapp-online/netlify.toml` exists. The production gateway URL is not set in the repository. |
| B6 | TLS certificates | Yes | Free (AWS Certificate Manager or Netlify) | Hours | None. | Not set up. |
| B7 | Certificate pins and the rotation plan (design 14.2: two backup pins and a kill-switch) | Yes (MASVS NETWORK-2 is at L2) | Engineering time | Before the first release that pins | None, but plan the rotation first. | Not built. |

### 2.3 Cloud (AWS)

| # | Item | Needed for a free sync launch | Cost | Lead time | Decision | Status today |
|---|---|---|---|---|---|---|
| C1 | AWS accounts per environment (dev, staging, production), with organisation guardrails (design 14.2) | Yes | New-account credits of $100 to $200 for 6 months on the Free plan may cover staging (design 13.1). | Hours to days | Open the account only when staging is needed (design). | Not opened. Local development uses Aspire and Docker (free). |
| C2 | Staging for the microservices (ECS Fargate, RDS, RabbitMQ, S3, CloudFront, monitoring) | Yes | ₹0.5 to 2 L per year (design 13.1). Yearly after launch at 1,000 users: ₹4 to 8 L (design 13.2). | Days to set up | Region: Mumbai (ap-south-1), with the disaster-recovery copy in Hyderabad (ap-south-2) (design 14.2). | No Terraform in the repository at base 8f1de24 (no `.tf` files, no `infra/`). |
| C3 | Signing keys in KMS (or CloudHSM only if a partner requires it) | Yes (production must use a PEM key: `backend/services/Identity/Khazana.Identity.Infrastructure/DependencyInjection.cs:69-70`) | About $1 per key per month (AWS list price; verify before budgeting) | Days | None. | Ephemeral keys are refused outside Development (`DependencyInjection.cs:69-70`). |
| C4 | Email for magic links (SES), if decision 4 includes it | Conditional | Small: inside design 13.2's "email, push, store fees" line (₹1 to 3 L per year at 1,000 users) | Days (SES production access needs a request) | Decision 4. | Not set up. |
| C5 | Audit logs and monitoring: CloudTrail, GuardDuty, Security Hub, a SIEM, logs kept 180 days in India (design 14.2 and CERT-In) | Yes | Inside the cloud line in design 13.2 (₹4 to 8 L per year at 1,000 users) | Days | Which SIEM. | Not set up. |

### 2.4 Push and messaging

| # | Item | Needed for a free sync launch | Cost | Lead time | Decision | Status today |
|---|---|---|---|---|---|---|
| P1 | Firebase Cloud Messaging (Android, and iOS through APNs) | Conditional: needed for new-device alerts and reminders on the phone | FCM has no per-message charge at this scale, as far as the public pricing shows; verify | Days | Whether push is in v1. Design 14.3 requires push alerts for new-device sign-in. | The Notification service exists on trunk (`backend/services/Notification`). Mobile has no push code. |
| P2 | APNs key (from A2) | Same as P1, on iOS | Included in A2 | With A2 | As P1. | No APNs key. |
| P3 | SMS provider (MSG91 adapter) for mobile-number sign-in | Conditional: needed only if sign-in by SMS code ships beyond the demo | About ₹0.15 to ₹0.25 per SMS (verify on the vendor page). A sign-in or sign-up is one SMS; pumping limits cap the rest. | Days to weeks: see P4 | Provider choice; set `Providers:Sms=Msg91` with `Sms:Msg91:AuthKey` and `TemplateId`. | The demo uses the Fake sender (code on screen). Selecting Msg91 without settings stops startup. The adapter follows MSG91's documented Flow API and has not run against the live service. |
| P4 | DLT registration (TRAI): registered business entity, sender id (header) and an approved OTP template | Conditional: required by Indian carriers before any real SMS is delivered | Registration fee set by the telecom operator's DLT portal (verify) | Days to weeks | Needs a registered business (A6) | Not started. Until done, no real SMS can be sent. |

### 2.5 Security assurance (the largest cost)

| # | Item | Needed for a free sync launch | Cost | Lead time | Decision | Status today |
|---|---|---|---|---|---|---|
| S1 | Independent cryptography and architecture review of the key hierarchy | Yes (design 14.2: before launch) | ₹2 to 6 L (design 13.1: before the P2 release) | Book in June 2027 (design 15.3) | Reviewer; scope from `docs/THREAT-MODEL.md` and the crypto contracts. | Not booked. |
| S2 | CERT-In-empanelled VAPT, web, API and mobile (design 14.5) | Yes | ₹2 to 8 L (design 13.1). Re-test before launch, yearly after that. | Book in June 2027 | Auditor. | Not booked. |
| S3 | Mobile pentest against MASVS Level 2 plus Resilience (design 14.1) | Yes | Design 13.1 lists it inside the VAPT line, but a separate MASVS firm may cost more. **Quote needed.** | With S2 | Whether one firm covers both. | Not booked. The checklist is `docs/online/masvs-checklist.md`. |
| S4 | Commercial app shielding (RASP) | Conditional: only if the pentest finds gaps | ₹0 to 8 L per year (design 13.2, "if the pentest needs it") | Weeks | After the pentest result. | Not decided. |
| S5 | Private bug bounty from launch, public later (design 14.5) | Yes, as a private programme | ₹0 to 5 L per year at 1,000 users (design 13.2) | Set up before launch | Reward ceiling and the programme platform. | Not set up. |
| S6 | ISO/IEC 27001 certification (design 14.1: within 12 to 18 months of launch) | No (after launch) | **Quote needed.** The design gives no figure. | After launch | When to start. | Not started. |
| S7 | Dependency and vulnerability scanning in CI (SBOM, CodeQL, Semgrep, secret scanning, design 14.2) | Yes | Free for public repositories or in the CI minutes budget; verify the tier | Days | None. | Mobile CI runs analyze and test only (`.github/workflows/ci.yml`). |
| S8 | Known web dependency issues: `npm audit --omit=dev` reports 3 (1 critical, 2 high), through `sharp` and `next` | Yes, before launch | `npm audit` suggests `next@16.4.3`, outside the stated range, so a breaking upgrade. Engineering time. | Days | Accept the upgrade, or pin and document. | Found on 2026-10-27 during this review. Not changed. |

### 2.6 Partners and data (not needed for a sync-only launch)

| # | Item | Needed for a free sync launch | Cost | Lead time | Decision | Status today |
|---|---|---|---|---|---|---|
| R1 | Account Aggregator: regulated FIU partner agreement, sandbox, certification by a Sahamati-empanelled certifier, and the partner's security audit (design 14.5) | No (bank data is Phase 4) | **Quote needed.** The design says so. The Finvu sandbox token is needed by Nov 2027 (design 15.3). | Months | Partner choice. | Not started. There is no AA service under `backend/services` on this base. |
| R2 | Credit bureau aggregator agreement, eligibility checks and consent records (design 14.5) | No (Phase 5) | **Quote needed.** Credit pulls cost ₹0.6 to 6 L per year at 1,000 users (design 13.2). | Months | Business decision. | Not started. |
| R3 | Stock price data licence (design 13.2) | Conditional: needed when prices are shown to other people | ₹1 to 5 L per year (design 13.2) | Weeks | Provider. | The offline app uses public feeds. Online does not show prices yet. |
| R4 | Google OAuth consent screen and brand verification for Google sign-in | Conditional: only if Google sign-in ships | Free for basic scopes. Restricted scopes (Gmail) need CASA: ₹0.5 to 4 L per year (design 13.1, 13.2). Gmail is not in the online launch. | Days to weeks | Scopes requested. | Web Google button code exists; the GCP OAuth client is not confirmed. |
| R5 | Sign in with Apple: Services ID and key | Conditional: required when Google is offered on iOS | Included in A2 | Days | Decision 4. | Backend verifier exists. No client. |

### 2.7 Legal, company, privacy, regulatory

| # | Item | Needed for a free sync launch | Cost | Lead time | Decision | Status today |
|---|---|---|---|---|---|---|
| L1 | Company registration (private limited or LLP), needed for organisation store accounts and for partners | Conditional. Individuals can publish a free app. Partners and paid features need it. | ₹0.3 to 1 L once, plus ₹0.2 to 0.5 L per year for an accountant (design 13.1) | Weeks | Structure and timing (design 15.3: start Feb 2027). | Not registered (per the design's plan). |
| L2 | Privacy policy, terms of service, consent texts | **Yes**. Needed before any other person's real data is held (design 13.1, 15.3). | ₹0.5 to 2 L (design 13.1) | Weeks, drafting and review | Lawyer; draft from `docs/online/store-listing-draft.md` section 4. | Not written. |
| L3 | DPDP Act 2023: notice, consent, purpose limitation, safeguards, breach notice, deletion on request, grievance contact (design 14.1, 14.5) | Yes | Inside L2 and the legal line below | Before real data | Grievance officer (owner or appointee). | Not in place. |
| L4 | CERT-In: a point of contact, a written incident plan with the 6-hour report, logs kept 180 days in India (design 14.1, 14.2) | Yes | Inside the cloud logging line (C5). The legal confirmation of the registration steps is part of L2. | Before launch | Who is the contact. | Not in place. Confirm the registration step with counsel. |
| L5 | Legal and accountancy, ongoing | After launch | ₹1 to 3 L per year (design 13.2) | Ongoing | None. | Not started. |
| L6 | Account deletion, in the app and on the web (Apple requires it for apps that create accounts; Play requires a web URL) | Yes | Engineering time, plus the step-up of design 14.3 | Before submission | None. | Not built on web or mobile. |

### 2.8 Devices and tools

| # | Item | Needed for a free sync launch | Cost | Lead time | Decision | Status today |
|---|---|---|---|---|---|---|
| D1 | Test devices: a mid-range Android and an older iPhone (design 13.1) | No: the owner has an iPhone, and Android runs on an emulator | ₹0.3 to 0.6 L once | Days | Whether to buy a real Android for TalkBack and Play Integrity testing. | The emulator is in use. Real-device testing is in the accessibility audit's plan. |
| D2 | AI coding assistant | No | ₹0.2 to 0.5 L per year (design 13.1) | Ongoing | Owner. | Not a launch item. |
| D3 | Error tracking (design 13.2 lists it in the email and monitoring line) | Conditional: changes the data-safety and privacy-label answers | Inside design 13.2's "email, push, store fees, error tracking, security monitoring" line (₹1 to 3 L per year at 1,000 users) | Days | Decision 10 in the store draft. | Not chosen. |
| D4 | Commercial code-signing for macOS (Developer ID) | No: the online app ships on iOS and Android. Its macOS target is not in the store plan. | Included in A2 | | | Not planned for online. |

## 3. Order

Start the long lead times first. The design's own dates (section 15.3) are used where it gives them.

### Now (October and November 2026), free or cheap and blocking

1. **A3** Create the Android release keystore, and back it up off the machine. Losing it means no updates on Play, ever.
2. **A2** Confirm the Apple team ID. Fix the committed one if it is stale.
3. **A1** Confirm the Play Console account. If it is new, start identity verification now, because the 12-tester closed test follows it.
4. **B1, B2** Choose the name and domain (decisions 1 and 2), and register the domain. Passkeys, CORS, the store URLs and the Android fingerprint all depend on it.
5. Decide the sign-in methods (decision 4), the free-model confirmation (decision 5) and the reviewer access path (decision 9).

### Before the P2 release (by September 2027)

6. **L1** Company, if partners or organisation accounts are wanted. Design target: start February 2027.
7. **L2, L3** Privacy policy, terms, consent texts and the DPDP grievance contact. Design target: start March 2027. Needed before any other person's data is held.
8. **S1, S2, S3** Book the cryptography review, the VAPT and the MASVS pentest. Design target: June 2027. They cover the P2 release and must be re-tested before the online launch.
9. **C1, C2, C3** AWS staging, with KMS signing keys. Open the account only when staging is needed.
10. **S7** CI security scanning (SBOM, CodeQL or Semgrep, secret scanning).

### Before the first real user (any real data, including friends)

11. **L4** CERT-In contact and incident plan, and log retention in India.
12. **L6** Account deletion, in the app and on the web.
13. **B3, B4, B5, B6** Passkey relying-party setup, production CORS, Netlify production site, TLS.
14. **B7** Certificate pins and the rotation plan (if pinning ships).
15. **P1, P2** Push, if decision 4 or the new-device alert needs it.
16. **D3** Error tracking decision and provider (changes the data-safety answers).

### Before store submission

17. **A1** Closed test: 12 testers, 14 days, on the production track's requirements. This is the longest pole. Start it as soon as the Play account is verified.
18. **A2, A4** iOS signing, entitlements, Sign in with Apple and Associated Domains.
19. **S8** Resolve the web dependency findings (the `next` upgrade decision).
20. **S4** Decide on RASP after the pentest result.
21. Data-safety and privacy-label answers checked against the release build (`docs/online/store-listing-draft.md`, section 8).

### Before the online launch (Phase 6, October to December 2028)

22. **S2, S3** Re-test: the VAPT and the MASVS pentest, on the release build.
23. **S5** Private bug bounty live.
24. **S1** Cryptography review findings closed.

### After launch

25. **S2** Yearly VAPT (₹2 to 8 L per year).
26. **S6** ISO/IEC 27001, within 12 to 18 months of launch (quote needed).
27. **L5** Accountant and legal, yearly.
28. **R1, R2, R3** Only if the bank-data, credit or prices features ship. Each is a separate decision and a separate cost.

## 4. Rough annual and one-time costs

Design section 13 gives these ranges. They are not quotes, and some items have no figure.

**One-time, for a free sync launch (the minimal set):**

| Item | Range |
|---|---|
| Play account | $25 |
| Apple Developer Program, first year | $99 |
| Domain, email and certificates, first year | about ₹0.05 L |
| Company registration (if chosen) | ₹0.3 to 1 L |
| Legal drafting (policy, terms, consents) | ₹0.5 to 2 L |
| Cryptography and architecture review | ₹2 to 6 L |
| VAPT, web, API and mobile | ₹2 to 8 L |
| Test devices (optional) | ₹0.3 to 0.6 L |
| MASVS pentest, if separate from the VAPT | Quote needed |

The design's total before launch, for all phases including partners, is about ₹8 to 28 L (design 13.1). The subtotal above is the sync-only part. It is lower, and the partner items are not in it.

**Yearly, once live, at about 1,000 users:**

| Item | Range |
|---|---|
| Apple Developer Program | $99 |
| Cloud (ECS, RDS, RabbitMQ, S3, monitoring, backups) | ₹4 to 8 L |
| Email, push, error tracking, security monitoring | ₹1 to 3 L |
| VAPT | ₹2 to 8 L |
| Bug bounty | ₹0 to 5 L |
| Accountant, legal, compliance | ₹1 to 3 L |
| Company accountant (if registered) | ₹0.2 to 0.5 L |

Partner items (Account Aggregator, credit, prices, CASA) are excluded from the sync-only figure. Design section 13.2 gives their ranges separately.

**Quote needed, with no figure in the design:** the separate MASVS pentest (if not part of the VAPT), ISO/IEC 27001, Account Aggregator onboarding, and the credit-bureau agreement.

**Not verified in this checklist:** Netlify plan limits for commercial use, the current FCM and SES pricing at the expected volume, the AWS KMS price, and any Google OAuth verification requirement for basic scopes. Each needs a check on the vendor's current page before budgeting.

## 5. Things to change in the repository when a decision lands

These are not paid items, but each one depends on a decision above.

- Domain (decision 2): `webapp-online` production gateway and CORS, the Netlify site, the passkey relying-party ID, the store URLs in `docs/online/store-listing-draft.md`.
- Sign-in methods (decision 4): the sign-in screens on web and mobile, the data-safety and label answers.
- Name (decision 1): `mobile-online/pubspec.yaml`, `android/app/build.gradle.kts` (`applicationId`), the iOS bundle name, and the web `<title>` (`webapp-online/src/app/layout.tsx`).
- Crash reporting (decision 10): the data-safety and privacy-label answers, and a privacy notice line.
- Flutter dependency: `mobile-online/pubspec.yaml` still constrains `flutter_secure_storage` to `^10.0.0-beta.4`. The lock is on 10.3.4. The offline app's release checklist calls for moving off the beta, and the same applies here. Do it before the first release.
- The iOS Keychain accessibility for the device key (MASVS STORAGE-1): set it before the first device is paired in production, because items stored earlier keep their old setting.
