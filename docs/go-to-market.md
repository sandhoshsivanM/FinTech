# Go to market

Ready-to-post content and the sequence to post it in. Written to be edited —
your voice, not mine — but complete enough to publish as-is.

## The strategic point

Your strongest asset for LinkedIn is **not the app**. It is how it was built.
`docs/` holds a real threat model, an architecture document, and a candid
1,000-line defect inventory that names its own bugs. Engineers respect that, and
it is also the proof behind the privacy claim: anyone can say "we don't sell
your data", and almost nobody publishes the design that makes it impossible.

So the sequence sells the *architecture* for three weeks and the *product*
once. The engineers who engage with the first three posts are the ones who
believe the fourth.

---

## Week 1 — The problem

> Every personal finance app in India wants your bank login.
>
> Not your transactions. Your *login*. Because the business isn't the app — the
> business is the aggregated data behind it, and you are the raw material.
>
> I wanted to track my own money without that trade, so I spent a year building
> the version that doesn't make it.
>
> No account. No server. No sign-up. Your records sit in an encrypted database
> on your own phone, unlocked by a PIN only you know. I can't read them. There's
> no password reset either, because a recovery path I controlled would mean I
> could open your vault.
>
> That last part is the whole design in one sentence: **the guarantee is only
> real if it's inconvenient for me too.**
>
> More on how it works this week.

*No link. This post is for reach.*

---

## Week 2 — The architecture (highest-engagement post)

> "We don't sell your data" is a promise. Here's an architecture that makes it
> a fact.
>
> Khazana has no backend. Not "a backend we don't log from" — none. Here's what
> that actually took:
>
> **Storage.** SQLCipher, AES-256, whole-file encryption. The key is derived
> from your PIN with PBKDF2-HMAC-SHA256 at 600,000 iterations and a 32-byte
> salt. The key is never written anywhere. Lose the PIN and the data is gone —
> for you and for me.
>
> **Backups.** A custom encrypted envelope: magic header, schema version,
> SHA-256 of the plaintext, fresh AES-GCM nonce per export. Six validation
> checks before a single byte is written on restore. Wrong PIN and tampered file
> produce an identical error, deliberately, so the format can't be used as an
> oracle to test PIN guesses.
>
> **Network.** The web client makes zero requests. The mobile client calls price
> and FX providers only when you ask it to refresh, carrying ticker symbols and
> currency codes — never anything about you.
>
> **Telemetry.** None. Which means I find out about crashes when someone emails
> me. That's the cost, and I'd make the trade again.
>
> The threat model is in the repo, including what it does *not* defend against.
> An honest one has to.

*Attach the layer diagram from `docs/ARCHITECTURE.md`.*

---

## Week 3 — The hard parts (engineer credibility)

> Three decisions from a year of building a finance app that surprised me:
>
> **1. `double` is banned.** Every monetary value is a `Decimal`. Floating point
> is fine until someone's net worth is off by ₹0.03 and they stop trusting the
> whole app — and they're right to. There's a lint rule.
>
> **2. Two engines, one set of test fixtures.** There's a Dart engine and a
> TypeScript engine — mobile and web — computing the same XIRR, the same capital
> gains, the same health score. Independent implementations drift. So they're
> driven by shared JSON fixtures: same inputs, same expected outputs, both
> suites. When they disagree, the build fails instead of a user finding two
> different numbers for the same portfolio.
>
> **3. No chart library.** Every chart is a hand-written painter, because each
> one needs a pixel-comparable twin on the other client. A charting library's
> styling API has no equivalent in the other language, so adopting one
> guarantees the two clients look different.
>
> None of these were in the plan. All three came from a bug.

---

## Week 4 — Launch

> Khazana is live.
>
> A personal finance and wealth app that keeps your data on your device —
> encrypted, offline, no account, no server, no ads, no tracking.
>
> Free, with no catch and no limits on your ledger: unlimited transactions,
> accounts, budgets, goals and holdings. Encrypted backup, restore and a full
> CSV export are free forever, because nothing that gets your own data out of
> the app should ever be behind a payment.
>
> Khazana Pro is one payment — not a subscription — for the Tax Centre, XIRR and
> benchmark analysis, statement import, and household profiles.
>
> Try it in your browser before you install anything. That link is the whole
> app.
>
> [ links ]
>
> Built solo over the past year. The architecture, threat model and a fairly
> unflattering defect list are all public.

---

## Other channels, in order

1. **The Play closed test, run in public.** Google requires 12 testers for 14
   continuous days before an individual developer gets production access.
   Recruit them from post #2 or #3. This turns a bureaucratic gate into a launch
   runway and gets real feedback before you charge anyone. **Start it the day
   the Play account clears** — it is the critical path.
2. **Hacker News, Show HN.** The privacy architecture is genuinely HN-shaped.
   Lead with the engineering, not the product. Post Tue–Thu, ~8am ET.
3. **Reddit** — r/IndiaInvestments, r/personalfinanceindia, r/india.
   **Participate for two weeks before you post anything of your own.** These
   communities punish drive-by promotion and the punishment is permanent.
4. **Product Hunt** — after the store listings are live, so the traffic lands
   somewhere that converts.
5. **Indian personal-finance newsletters** — offer the privacy angle as a story,
   not an ad.

## What to measure

You ship no analytics, and that is the right call — but it means you are blind,
so use the signals you legitimately have:

- Play Console and App Store Connect: installs, conversion rate, crashes
- Netlify: landing-page traffic and PWA installs
- Merchant of record: sales, refund rate, and where buyers came from
- Store reviews and support email: the only qualitative signal you get

Refund rate is the number that matters. Above ~5% means the paywall is
promising something Pro does not deliver, and the fix is the copy, not the
price.
