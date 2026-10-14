# Store listing copy

Everything to paste into Play Console and App Store Connect. Character limits
are enforced by the stores; the counts below are the actual length of the text
as written.

**Positioning**, from `docs/design-spec/Khazana_Product_Design_Hardening.md`:

> Khazana = private financial vault + modern wealth terminal.
> Not: another green personal-finance dashboard.

The whole listing leads with the one claim no competitor in this category can
make and that is architecturally true here: **your financial data never leaves
your device, because there is nowhere for it to go.** Every rival monetises
aggregation. Khazana has no server, so it cannot.

---

## Google Play

Status of this section: written for the **1.0.0 (1) closed-testing** submission
and checked against the code on branch `release/play-readiness`. Where an answer
depends on something only the Play Console can confirm, it says so.

### Store listing

| Field | Value |
|---|---|
| App name (30 max) | `Khazana: Private Money Vault` (28) |
| Default language | English (India) |
| App or game | App |
| Category | Finance |
| Tags | Personal finance, Budgeting, Investing |
| Developer contact email | the support address on the custom domain (see RELEASE-CHECKLIST) |
| Website | https://khazana-app.netlify.app |
| Privacy policy URL | https://khazana-app.netlify.app/privacy/ |

### Short description (80 max)
```
Private money vault: budgets, net worth, investments. Encrypted. No account.
```
*76 chars.*

### Full description (4000 max)

```
Khazana is a personal finance app that keeps your money data on your phone: encrypted, offline-first, and out of everyone's reach, including ours.

There is no account to create. No email, no phone number, no sign-up. There is no Khazana server, so there is nothing for us to look at, nothing to sell and nothing to lose in a breach.

WHY IT IS DIFFERENT

Most finance apps ask for your bank login and gather your data on their servers. Khazana does the opposite. Your records live in an encrypted database on this device, unlocked by a PIN only you know (or your fingerprint or face, if you turn that on). We cannot read it, and there is no password reset, because a recovery path we controlled would be a way for us to open your vault.

WHAT YOU CAN DO

- Home: your total balance, income, spend and savings for the month, a stack of cards for your accounts, and a seven-day spending chart.
- Money: a cash-flow view of every transaction, a calendar ledger, monthly budgets per category, recurring bills and income, and your accounts. Add a transaction in a few taps, or type it in plain words such as "spent 450 on groceries".
- Invest: portfolio value, invested amount, realised and unrealised profit and loss, XIRR, holdings, goals, debts and EMIs, and insurance cover with the gap against a sensible guideline.
- Health: a financial health score out of 100 with the reasons behind it, reports for any period, analytics, and a safety-net check that shows how long your savings would last with no income.
- Little (i) hints beside every figure explain what it means and how it is worked out, in plain language.
- Light and dark themes, and an option to hide amounts with one tap.

BUILT FOR INDIA, USABLE ANYWHERE

Rupee formatting with lakh and crore. Mutual fund NAVs from the public AMFI file. Statement import for HDFC, ICICI, SBI and Axis bank files. Multi-currency support for money held abroad, with daily exchange rates on request.

OPTIONAL AUTO-CAPTURE FROM BANK ALERTS

If you choose to, Khazana can read bank and UPI payment alerts that appear on your phone and suggest transactions for you to review. This needs Android's Notification access. Khazana explains exactly what it does and asks for your agreement first. Alerts are read on the device, in memory, and thrown away immediately. Only the amount, merchant and date are kept, and only after you tap Add. Nothing is uploaded. It is off until you turn it on, and you can switch it off at any time in Android settings. Khazana never asks for permission to read your SMS messages.

REMINDERS

Optional on-device reminders for bills, renewals and budget limits. They are scheduled on your phone; nothing is pushed from a server.

YOUR DATA, YOUR CONTROL

- Encrypted backup and restore, and a complete CSV export. Getting your own data out is never locked behind anything.
- Erase all data at any time from Settings.
- Try it first: Settings, then Load sample data, fills the app with a realistic year. Erase it when you are done.

PRIVACY, PRECISELY

- Your vault: AES-256 encryption (SQLCipher), with the key derived from your PIN using PBKDF2-HMAC-SHA256 at 600,000 iterations.
- Analytics and tracking: none. Ads: none.
- Network: used only when you refresh share prices or exchange rates. Those requests carry ticker symbols and currency codes, never your balances, holdings or anything about you.
- Backups: encrypted files that you hold, restorable only with your PIN. Android's own cloud backup is switched off for this app.

Khazana is a record-keeping and calculation tool. Its scores, projections and estimates are for information only and are not investment, tax or insurance advice.
```
*3,663 chars (measured; the console shows the live count).*

> **Pro tier: deliberately not mentioned above.** The Android app contains a
> "Khazana Pro" screen (Settings), but no screen in the Flutter app is wired to
> `ProGate`, and several benefits on that screen (Tax Centre, household
> profiles, formatted exports, forecast) exist only in the web client per
> `docs/pro-gates.json`. Selling or advertising features the Android app does not
> have is a Play "misleading claims" and "deceptive behaviour" risk. Decide one
> of two routes before the first closed test: either **(a)** ship 1.0.0 free,
> do not create the `khazana_pro` in-app product and hide the Pro entry, or
> **(b)** wire the gates, trim `ProCopy.benefits` to what Android really has
> (portfolio analytics, statement import, auto-capture, price refresh, longer
> reports, score history, multiple vaults) and then add a Pro paragraph here and
> tick "contains in-app purchases".
>
> **Decided 2026-10-14: route (a).** 1.0.0 ships free on Play. Play builds
> (`--dart-define=KHAZANA_CHANNEL=play`) hide every Pro entry point and do not
> register the Pro route (`kOffersPro` in
> `lib/core/entitlement/distribution_channel.dart`). Answer "No" to in-app
> purchases and do not create `khazana_pro` yet.

### Release notes, 1.0.0 (500 max per language)
```
First release of Khazana.

- A private, encrypted money vault: no account, no server, no ads, no tracking
- Budgets, cash flow, calendar, recurring bills and accounts
- Portfolio with XIRR and profit and loss, goals, debts and insurance cover
- Financial health score and safety-net check, with explanations beside every figure
- Optional auto-capture of bank alerts, off until you turn it on
- Encrypted backup, CSV export, light and dark themes
```
*446 chars.*

### Graphics (in `docs/play-store/`)

| Asset | File | Spec |
|---|---|---|
| Hi-res icon | `icon-512.png` | 512 x 512, 32-bit PNG (RGBA), under 1 MB |
| Feature graphic | `feature-graphic.png` | 1024 x 500, 24-bit PNG, no alpha |
| Phone screenshots | `phone/01-...` to `phone/08-...` | 1080 x 1920 (9:16), PNG |

Regenerate the first two with `cd webapp && npm run play-graphics`. The
screenshots are real captures from the Android emulator (API 34, debug build,
**Settings, Load sample data**, system clock fixed to 9:41, status bar in demo
mode), in the order Play shows them:

1. `01-home-card-stack.png` home with the account card stack
2. `02-cash-flow.png` Money, cash flow
3. `03-investments.png` Invest, portfolio
4. `04-financial-health.png` Health, score
5. `05-safety-net.png` Health, safety net
6. `06-insurance-cover.png` Invest, cover (one sample policy added)
7. `07-add-transaction.png` add transaction
8. `08-home-dark.png` home, dark theme

Play needs 2 to 8 phone screenshots; the first three carry most of the weight.
No tablet screenshots are required for a phone-only listing.

### App content declarations

| Section | Answer |
|---|---|
| Privacy policy | https://khazana-app.netlify.app/privacy/ (see "Privacy policy check" below) |
| Ads | **No**, the app contains no ads |
| App access | **All functionality is available without special access**, with instructions (below) |
| Target audience | **18 and over** only. Not designed for children, so the Families policy does not apply |
| News app | No |
| Government app | No |
| Health apps (health features) | No. The "financial health score" is a money metric, not a health feature |
| Financial features | Declare as a personal-finance tracker. Do **not** tick lending, trading/brokerage, payments, wallets, crypto, insurance sales or advice. If a "no financial features" choice is the only fit, do not use it either, because the app handles financial records. Pick the closest "personal finance management / other" option the form offers |
| Data safety | See below |
| In-app purchases | See the Pro note above. Tick "contains in-app purchases" only if route (b) is taken |

**App access instructions** (paste into the "App access" box):

```
No login or account exists. The app is fully usable without any special access.
1. Open the app and, on "Set up your vault", enter any PIN twice (for example 482716) and tap Create vault. The PIN is local to the device; there is no account.
2. On the home screen tap "Sample data" (or Settings, then Load sample data) to fill the app with a realistic year of demonstration data. Skip the short tour if it appears.
3. Explore with the bottom tabs: Home, Money, Invest, Health.
Auto-capture from bank alerts is optional and needs Notification access: open Settings, Auto-capture, tap "Notification access", read the disclosure and tap "Agree and continue". It can be skipped; nothing else depends on it.
```

**Content rating (IARC questionnaire).** Category: *Utility, Productivity,
Communication, or Other* (Finance apps are rated under this heading).

| Question | Answer |
|---|---|
| Violence / blood / fear | No |
| Sexual content or nudity | No |
| Profanity or crude humour | No |
| Controlled substances (drugs, alcohol, tobacco) | No |
| Gambling or simulated gambling | No |
| User-generated content or user-to-user communication | No |
| Shares the user's location with others | No |
| Allows purchases of digital goods | **No** for route (a); **Yes** for route (b) |
| Unrestricted web access / browser | No (it only opens the privacy and terms links in the system browser) |

Expected outcome: Everyone / PEGI 3 / IARC 3+. The questionnaire result is
generated by Play; if it comes back higher, re-check the answers above rather
than appealing.

### Data safety form (ready to copy)

Derived by reading every network call in `lib/` and every manifest permission.
**Every network call in the app** (nothing runs automatically; each is started by
the user tapping a refresh or opening a screen that needs a quote):

| Host | Used for | What leaves the device |
|---|---|---|
| `query1.finance.yahoo.com` | share and ETF quotes | a ticker symbol |
| `api.twelvedata.com` | quotes (fallback, user supplies their own API key) | a ticker symbol and the user's own API key |
| `www.alphavantage.co` | quotes (fallback, user supplies their own API key) | a ticker symbol and the user's own API key |
| `www.amfiindia.com` | mutual fund NAVs | nothing: a public file is downloaded |
| `api.frankfurter.dev` | exchange rates (ECB reference rates) | a currency code |
| Google Play Billing | the Pro purchase (only if route (b)) | handled by Google Play, not by the app |

There is **no** analytics, crash reporting, advertising, attribution, Firebase,
remote config or sign-in SDK in the app, no server of ours, and no licence
check over the network (licence keys are verified on the device). Cloud backup
is switched off (`allowBackup="false"`, data-extraction rules exclude everything).

**Section 1, Data collection and security**

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **No** |
| Is all of the user data collected by your app encrypted in transit? | Not applicable (no data collected). For the record, every request is HTTPS |
| Do you provide a way for users to request that their data is deleted? | **Yes.** There is no account; all data is on the device and Settings, Erase all data removes it. Uninstalling also removes it. No deletion URL is needed because nothing is held by the developer |

Why "No" is correct: Play defines *collection* as data transmitted off the
device to the developer or a third party. The only things transmitted are public
market identifiers (ticker symbols, currency codes) with no link to a person, and
a public NAV file. No balance, transaction, holding size, name, email or device
identifier is sent, and nothing is sent to the developer at all. The notification
text read by auto-capture is processed in memory on the device and never
transmitted ("processed ephemerally on device" is not collection).

**Conservative alternative.** Providers such as Yahoo Finance necessarily see the
requester's IP address, and a ticker list can hint at what someone holds. If you
prefer to over-declare rather than risk a reviewer disagreeing, answer
**Yes** for collection and declare only:
- *Financial info, Other financial info* (watch-list ticker symbols): **Shared**
  with third parties, **optional**, purpose **App functionality**, not required.
- Nothing else. Do not declare Personal info, Location, Contacts, Messages, App
  activity, Device or other IDs: none of those are sent.
The privacy policy table already names all five hosts, so either answer matches it.

**Permissions and the data-safety form.** None of the manifest permissions lead
to data collection:

| Permission | Source | Why |
|---|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE` | app, plugin | price, NAV and FX refresh |
| `POST_NOTIFICATIONS`, `VIBRATE`, `RECEIVE_BOOT_COMPLETED` | app | local reminders; the boot receiver restores scheduled alarms after a reboot. No exact-alarm permission is used |
| `USE_BIOMETRIC`, `USE_FINGERPRINT` | `local_auth` plugin | optional unlock; the app gets only yes or no |
| `com.android.vending.BILLING` | `in_app_purchase` plugin | present whichever route is taken; unused if route (a) |
| `BIND_NOTIFICATION_LISTENER_SERVICE` (on the service) | app | optional bank-alert auto-capture; see below |
| `<DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION>` | AndroidX | internal signature permission |

Not requested: `READ_SMS`, `RECEIVE_SMS`, contacts, location, camera, storage,
`SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, foreground-service permissions.

### Policy review: findings

**Target API level.** `targetSdk = flutter.targetSdkVersion`. In the installed
Flutter 3.38.7 SDK
(`packages/flutter_tools/gradle/src/main/kotlin/FlutterExtension.kt`) that is
**36**, with `compileSdk` 36 and `minSdk` 24. The merged release manifest
confirms `targetSdkVersion="36"`. Play's rule (API 35 or higher for new apps and
updates) is met. Re-check this after any Flutter upgrade. The 56 MB bundle
contains arm64-v8a, armeabi-v7a and x86_64 native libraries (64-bit present).

**Exported components** (merged release manifest). Only two are exported:
`MainActivity` (the launcher, required) and
`androidx.profileinstaller.ProfileInstallReceiver` (AndroidX, guarded by the
system `DUMP` permission). The notification listener, the two
`flutter_local_notifications` receivers and every other service/receiver/provider
are `exported="false"`. The listener is protected by
`BIND_NOTIFICATION_LISTENER_SERVICE`, so only the OS can bind it.

**Notification listener, Play User Data policy (prominent disclosure and
consent).** *Finding, before this change:* **weak.** The Auto-capture screen
showed a small card ("Grant notification access so bank alerts are parsed
on-device...") and its button called
`openNotificationAccessSettings` immediately. That is explanatory text on a
screen, not a prominent disclosure that needs an explicit action, and it did not
say the OS shares notifications from *every* app with the listener. *Fix made:*
`lib/features/capture/widgets/notification_access_disclosure.dart` adds a modal
dialog that is not dismissible by tapping outside, titled "Read bank alerts to
add transactions?", with four labelled parts (what Khazana reads, why, where it
goes, how to turn it off) and two equal buttons, "Not now" and "Agree and
continue". The system settings screen opens **only** on "Agree and continue".
The card text was also tightened, and the stale "SMS" wording (SMS capture was
removed) was removed from the Auto-capture list entry, the empty state and the
help text. Covered by `test/widget/notification_access_disclosure_test.dart`.

The disclosure text, for the console and the review video:

> **What Khazana reads.** If you continue, Android will ask you to give Khazana
> notification access. Android shares the notifications that appear on this phone
> with the app. Khazana looks only for bank and UPI payment alerts (for example
> "Rs 450 debited at a store") and ignores every other notification.
> **Why.** To suggest transactions for you to review, so you do not have to type
> each payment in by hand. Nothing is added until you tap Add.
> **Where it goes.** Nowhere. The text is read on this device, in memory, and
> thrown away straight away. Only the amount, merchant and date of a payment alert
> are kept, in your encrypted vault. Nothing is uploaded, shared or used for ads,
> because Khazana has no server.
> **You are in control.** This is optional and off until you turn it on. To turn
> it off, open Android Settings, then Notifications, then Notification access (the
> path varies by phone) and switch Khazana off.

*Residual points to be aware of:*
- The service, once granted, receives notifications from all apps; filtering to
  bank alerts happens in Dart (`NotificationParser`). That is why the disclosure
  says "ignores every other notification" rather than implying it never sees them.
  Do not describe it to Play as "only bank notifications are received".
- Nothing in the native code stores or sends the text (`CaptureBus` holds at most
  50 events in memory while the Dart side is not attached). Keep it that way: any
  change that persists raw text, or logs it, changes the Data safety answers.
- If Play review asks for justification, use the "Notification-listener
  justification" below and offer a short screen recording: Settings, Auto-capture,
  Notification access, the dialog, Agree, the system screen.
- Capture is described as Pro in the (web-era) gate map and paywall but is not
  gated in the Android code today (see the Pro note above).

**SMS.** Correctly absent (`RECEIVE_SMS`/`READ_SMS` are Play restricted
permissions; reading bank texts is not an allowed use).

**Exact alarms, foreground services, full-screen intents, `QUERY_ALL_PACKAGES`,
`MANAGE_EXTERNAL_STORAGE`:** none present.

**Backup.** `allowBackup="false"` plus data-extraction rules keep the vault out
of Google backups, consistent with the policy and the "no data leaves the device"
statement.

**Privacy policy check.** `https://khazana-app.netlify.app/privacy/` answers HTTP
200 and is reachable in-app (Settings). The source page
(`webapp/src/app/privacy/page.tsx`) already listed notification access and the
five network hosts; this change expands the notification-access paragraph to
match the in-app disclosure (explicit agreement first, all notifications visible
to the service but filtered in memory, only amount/merchant/date kept after
approval, not shared or used for ads, how to withdraw). **Redeploy the web app
for that text to go live** (manual Netlify CLI deploy from `webapp/`), then open
the page in a browser and confirm it shows the "Permissions the mobile app asks
for" section. When this was checked, a plain `curl` of the live page returned
the app shell without that section's text in the HTML, so confirm the live
version in a browser rather than assuming it is current. Play also requires the
policy be a working, non-editable web page, not a PDF, and it names the developer
and a contact address (the page does).

**Notification-listener justification (for the Play Console, if asked)**

> Khazana's core function includes recording bank transactions. On Android it can
> read incoming bank transaction alerts and offer to file them as transactions, so
> a user does not have to retype every payment by hand.
>
> The feature is entirely optional and off until the user enables it. Before the
> app opens the system settings screen it shows an in-app disclosure explaining
> what is read, why, that nothing leaves the device and how to switch it off, and
> requires the user to tap "Agree and continue". The notification text is parsed
> on the device, in memory, and discarded. Only the amount, merchant and date are
> retained, and only after the user approves the suggestion. Nothing is
> transmitted: the app has no server and makes no network request related to
> this feature.
>
> No less-broad API provides incoming transaction alerts. The app deliberately
> does not request READ_SMS or RECEIVE_SMS.

**Other store-readiness notes**
- `versionCode` is 1 (from `pubspec.yaml` `1.0.0+1`). Every upload needs a higher
  `+N`; bump it and run `tool/check_versions.sh`.
- The local `flutter build appbundle --release` is signed with the **debug** key
  when `android/key.properties` is absent. Play rejects that; only the CI build
  with the upload keystore secrets is uploadable.
- Create the `khazana_pro` product only under route (b).
- Adaptive launcher icon was fixed in this change (background white, foreground
  mark inside the safe zone, true monochrome layer for themed icons).

---

## Apple App Store

### App name (30 max)
```
Khazana — Private Finance
```
*25 chars.*

### Subtitle (30 max)
```
Encrypted, offline money vault
```
*29 chars.*

### Promotional text (170 max, updatable without review)
```
Your money data never leaves your iPhone. No account, no server, no tracking —
just a private, encrypted vault for everything you own and owe.
```
*146 chars.*

### Keywords (100 max, comma-separated, no spaces)
```
finance,budget,expense,networth,portfolio,offline,private,encrypted,tracker,xirr,tax,mutualfund,sip,emi
```
*103 chars — trim `emi` to fit if the console objects.*

Deliberately absent: the app name (Apple indexes it already), plurals of words
already present, and anything the app does not do.

### Description
Reuse the Play full description above. Apple has no strict format; keep the
same section order so the two listings tell one story.

### Privacy Nutrition Labels
**Data Not Collected** — the whole app. Reuse the content of
`ios/Runner/PrivacyInfo.xcprivacy`, which is already accurate.

### App Review notes
```
No account is required. Khazana works fully offline; a reviewer can create a
vault with any PIN and use every screen immediately. "Load sample data" in
Settings populates a realistic dataset for testing.

Khazana Pro is a one-time non-consumable (khazana_pro), not a subscription.
Restore Purchases is on the Pro screen and in Settings, and remains visible
after purchase. There is no server: purchases are validated on-device by
StoreKit.

The app has no user accounts, no analytics and no backend. Network requests are
made only when the user refreshes market prices or exchange rates, and carry
only ticker symbols and currency codes.

Khazana is a record-keeping tool. All scores and projections are labelled
informational and are not financial advice.
```

---

## Screenshots

Six per device, in this order — the first two are what most people ever see:

1. **Dashboard** — net worth, the four stat tiles, the trend. The product in one
   frame.
2. **Financial Health** — the score with its four areas. The hook.
3. **Investments** — allocation donut and positions.
4. **Tax Centre** — the strongest Pro justification.
5. **Privacy** — "Encrypted on this device. No server. No account." Say the
   differentiator in a screenshot, because most people never read the
   description.
6. **Calendar or Budget** — day-to-day usefulness.

Play screenshots already exist in `docs/play-store/phone/` (see the Google Play
section). Sizes: 6.7" iPhone (1290×2796), 13" iPad (2064×2752), Android phone
(1080×1920+), Android tablet, macOS (2880×1800). Play also needs a
**1024×500 feature graphic**.

Build every screenshot from **Settings → Load sample data**, with **demo market
data switched on**. That is the one legitimate use of the synthesised feed: it
must never be on by default for real users, but a screenshot needs a populated
Markets screen. Never screenshot a real vault.

---

## Landing page

On the custom domain, not `*.netlify.app` — a paid finance product on a free
subdomain reads as untrustworthy, and rightly so.

Above the fold: the one-line pitch, **Try it now** (the live PWA — competitors
cannot let people try before buying, and you can), and store badges. Below:
the privacy architecture, a price with the free tier stated plainly, and links
to `/privacy` and `/terms`.
