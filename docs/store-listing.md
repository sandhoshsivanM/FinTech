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

### App name (30 max)
```
Khazana: Private Money Vault
```
*28 chars.*

### Short description (80 max)
```
Encrypted, offline personal finance. No account, no server, no ads, no tracking.
```
*79 chars.*

### Full description (4000 max)

```
Khazana is a personal finance and wealth app that keeps your money data on your
phone — encrypted, offline, and out of everyone's reach including ours.

There is no account to create. No email, no phone number, no sign-up. There is
no server behind Khazana, so there is nothing for us to look at, nothing to
sell, and nothing to lose in a breach.

WHY THIS IS DIFFERENT

Most finance apps ask for your bank login so they can aggregate your data on
their servers. That data is the product. Khazana takes the opposite approach:
your records live in an encrypted database on this device, unlocked by a PIN
only you know. We cannot read it. There is no password reset, because a
recovery path we controlled would mean we could open your vault.

WHAT YOU CAN TRACK

• Transactions, accounts and transfers with proper double-entry bookkeeping
• Budgets per category, with alerts before you overspend
• Investments — stocks, ETFs, mutual funds — with cost basis and returns
• Liabilities, EMIs, and payoff plans (avalanche or snowball)
• Insurance policies and where your cover falls short
• Goals, and whether you are on track
• A financial health score across four areas, explained rather than asserted
• Safety net: how long you could hold out with no income

BUILT FOR INDIA

Rupee formatting with lakh and crore. Capital gains rules for Indian equity and
mutual funds. AMFI NAV lookup. Statement import for HDFC, ICICI, SBI and Axis.
Multi-currency for anything held abroad.

FREE FOREVER, WITH NO CATCH

No limits on your ledger — unlimited transactions, accounts, budgets, goals and
holdings. Encrypted backup and restore, and a full CSV export, are free and
always will be. Nothing that gets your own data out of Khazana is ever behind a
payment.

KHAZANA PRO — one payment, not a subscription

Unlocks the Tax Centre, XIRR and benchmark analysis, sector-level profit and
loss, bank and broker statement import, automatic capture from bank
notifications, household profiles, full report history, and formatted exports.
Buy once, keep it.

PRIVACY, PRECISELY

• Your vault: AES-256 encryption (SQLCipher), key derived from your PIN using
  PBKDF2-HMAC-SHA256 at 600,000 iterations
• Analytics: none. No telemetry of any kind, from anywhere in the app
• Ads: none
• Network: only when you ask for a price or exchange-rate refresh, and those
  requests carry ticker symbols and currency codes — never anything about you
• Backups: encrypted files you hold, restorable only with your PIN

Khazana is a record-keeping and calculation tool. Its scores, projections and
tax estimates are informational only and are not investment, tax or insurance
advice.
```
*~2,150 chars.*

### Play Data Safety declaration

Unusually simple, because the honest answers are all "no":

| Question | Answer |
|---|---|
| Does your app collect or share any user data? | **No** |
| Is all user data encrypted in transit? | N/A — no user data is transmitted |
| Do you provide a way to delete data? | **Yes** — Settings → Erase all data |

Financial Features declaration: **not** a lender, broker, payment app, crypto
exchange or insurance provider. A personal finance manager only.

Restricted permissions to declare:
- `BIND_NOTIFICATION_LISTENER_SERVICE` — see the justification below.
- `READ_SMS` / `RECEIVE_SMS` — **not requested.** Removed deliberately.

### Notification-listener justification

> Khazana's core function includes recording bank transactions. On Android it
> can read incoming bank transaction alerts and offer to file them as
> transactions, so a user does not have to retype every payment by hand.
>
> The feature is entirely optional and off until the user enables it in system
> settings. The notification text is parsed on the device, in memory. Only the
> amount, merchant and date are retained, and only after the user approves the
> suggestion. Nothing is transmitted — the app has no server and makes no
> network request related to this feature.
>
> No less-broad API provides incoming transaction alerts. We deliberately do
> not request READ_SMS or RECEIVE_SMS.

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

Sizes: 6.7" iPhone (1290×2796), 13" iPad (2064×2752), Android phone
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
