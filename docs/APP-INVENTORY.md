# Khazana — App Inventory

A complete map of what exists in the app today: every screen, every menu, every
widget, every write path — with a status marker on each, and a defects section
recording what is actually broken.

Written to be read two ways. Each screen is described first for a **user**
(what it is for, what you see, what you can do), then for a **developer**
(files, providers, exact strings). Skip whichever half you don't need.

Companion docs: [ARCHITECTURE.md](ARCHITECTURE.md) (why the system is shaped
this way), [THREAT-MODEL.md](THREAT-MODEL.md) (security reasoning),
[HOW-IT-WORKS.md](HOW-IT-WORKS.md) (end-to-end walkthrough). This file is the
inventory; it does not repeat their arguments.

**Status markers used throughout**

| Marker | Meaning |
|---|---|
| ✅ **Working** | Reachable from the UI and wired end to end |
| 🟡 **Partial** | Works, with a stated limitation |
| 🔌 **Unreachable** | Implemented and tested, but no UI path invokes it |
| ❌ **Broken** | Actively produces a wrong or contradictory result — see [§7](#7-defects) |

---

## 1. What Khazana is

An offline-first, encrypted personal finance and wealth app. There is no server,
no account, no sync and no telemetry. All data lives in an AES-256 SQLCipher
database on the device, unlocked by a PIN that is never stored.

Two clients share one design:

| Client | Stack | Status |
|---|---|---|
| **Flutter app** | Drift + SQLCipher, Riverpod. macOS, Android, iOS, web | ✅ primary |
| **Next.js web app** (`webapp/`) | Dexie (IndexedDB) + WebCrypto, Zustand | 🟡 parity partial — see [§9](#9-flutter--web-parity) |

Scale: 237 Dart files, 22 database tables, 22 screens, 24 domain services,
263 tests.

**Running it**

```bash
flutter run -d macos          # desktop
flutter run -d <android-id>   # phone
cd webapp && npm run dev      # web app on :3100
```

Release builds need `--no-tree-shake-icons` (see [§7.11](#711-release-builds-need---no-tree-shake-icons)).

---

## 2. Navigation map

### 2.1 Two shells, chosen by platform

The app presents differently on desktop and phone, and the choice is made by
**platform, not window width** (`lib/presentation/app_shell.dart:29-33`):

```dart
bool get isDesktopPlatform =>
    !kIsWeb && (macOS || windows || linux);
```

A narrow window on a Mac is still a Mac app and keeps its sidebar; a wide
Android tablet still wants touch targets. Web is excluded deliberately — it is
served to phones as often as to desktops, so it keeps the width-driven layout.

Desktop also opts out of the phone width cap (`lib/main.dart:54`); otherwise a
640px column would sit in the middle of the window.

### 2.2 Mobile — bottom navigation (5 items)

`lib/presentation/app_shell.dart:47-53`

| # | Label | Route |
|---|---|---|
| 1 | Dashboard | `/app/dashboard` |
| 2 | Cash Flow | `/app/transactions` |
| 3 | Investments | `/app/investments` |
| 4 | Reports | `/app/reports` |
| 5 | Settings | `/app/settings` |

🟡 **Partial** — 5 tabs for 22 screens. The other 17 are reachable only via
dashboard quick-links or the Settings list.

### 2.3 Desktop — sidebar (16 items, 4 sections)

`lib/presentation/desktop_shell.dart:23-60`. 248px, brand header at top,
"Lock vault" button at the bottom.

| Section | Items |
|---|---|
| **Overview** | Dashboard · Reports · Safety Net |
| **Money** | Cash Flow · Calendar · Budget · Recurring · Search |
| **Wealth** | Investments · Breakdown · Liabilities · Insurance · Goals |
| **Data** | Capture Inbox · Import · Settings |

✅ **Working**. Active item uses longest-prefix matching, so
`/app/investments/add-lot` keeps *Investments* highlighted
(`desktop_shell.dart:70-82`).

> Not in the sidebar: Add Transaction, Add Lot, Import Lots, Search results,
> Market Data and Currency settings — all reached from within their parent
> screen. Market Data and Currency highlight *Settings* while open.

### 2.4 All routes

`lib/core/router/app_router.dart:32-55`. Every `/app/*` path is gated: while
locked, any location redirects to `/unlock`; once unlocked, `/unlock` redirects
forward to the dashboard (`:70-76`).

| Route | Screen |
|---|---|
| `/unlock` | UnlockGateScreen |
| `/app/dashboard` | DashboardScreen |
| `/app/transactions` → `add` | TransactionsScreen → AddTransactionScreen |
| `/app/search` | SearchScreen |
| `/app/budget` | BudgetScreen |
| `/app/investments` → `breakdown`, `add-lot`, `import-lots` | InvestmentsScreen → Breakdown / AddLot / ImportLots |
| `/app/liabilities` | LiabilitiesScreen |
| `/app/insurance` | InsuranceScreen |
| `/app/safety-net` | SafetyNetScreen |
| `/app/goals` | GoalsScreen |
| `/app/reports` | ReportsScreen |
| `/app/import/bank` | BankImportScreen |
| `/app/recurring` | RecurringScreen |
| `/app/capture` | CaptureInboxScreen |
| `/app/calendar` | CalendarLedgerScreen |
| `/app/settings` | SettingsScreen |
| `/app/settings/market-data` | MarketDataSettingsScreen |
| `/app/settings/currency` | CurrencySettingsScreen |

### 2.5 Keyboard shortcuts

Registered once in `AppShell`, so they work on every authenticated screen but
not on the unlock gate (`app_shell.dart:87-113`).

| Key | Effect |
|---|---|
| `N` | New transaction |
| `Ctrl`+`L` / `Cmd`+`L` | Lock the vault |

✅ **Working**. There are no other shortcuts.

### 2.6 Dialogs and sheets

17 dialogs: New recurring rule · New monthly budget · 50/30/20 quick start ·
New goal · Contribute to goal · Add liability · Debt payoff plan · Add policy ·
Add exchange rate · Load sample data? · sample-data spinner · Erase all data? ·
New vault · Export error log · guided tour (13 pages, full screen) · two date
pickers.

2 bottom sheets: the calendar **day ledger** (compact layout only) and the
**Vaults** switcher.

---

## 3. Screen by screen

### 3.1 Unlock Gate — `/unlock`

**For you.** The first thing you see. On a new device it asks you to create a
PIN; after that it asks you to enter it. Your PIN encrypts everything and is
never stored, so there is no recovery if you forget it.

**What you see** — a shield logo, "Khazana", and one of four states:

| State | Shows |
|---|---|
| First run | "Set up your vault" · "Your PIN encrypts everything on this device. It is never stored." · Create PIN · Confirm PIN |
| Locked | "Unlock" · Enter PIN · optionally "Use biometrics" |
| Working | spinner |
| Locked out | "Too many attempts" · "Try again in *n* s" (live countdown) |

Errors appear with an icon, never colour alone: "PIN must be at least 4
digits." / "PINs do not match."

**Rules.** 3 failed biometric attempts fall back to PIN only. 5 failed PINs
trigger a 30-second cooldown.

*File:* `lib/presentation/unlock_gate_screen.dart` · ✅ **Working**

> On macOS the OS asks for your **login keychain password** the first time.
> That is macOS granting the app access to its own keychain entry, not an app
> password. Choose "Always Allow" once.

---

### 3.2 Dashboard — `/app/dashboard`

**For you.** The home screen. Net worth at the top, then key figures, quick
links to everything, a trend chart, your health score and recent activity.

**What you see**, in order:

1. **Guided tour launcher** and a one-time welcome banner
2. **Greeting** — "Good morning/afternoon/evening" 👋, with a Settings button
3. **Net worth hero card** — big figure on a gradient, an eye toggle to hide
   all amounts ("ghost mode"), and a change line `±₹x (n.n%) this period`
4. **Four stat tiles** — Net Cash · Investments · Liabilities · Savings Rate.
   Investments and Liabilities are tappable
5. **Quick links** — chips for Calendar, Auto-capture, Budget, Goals,
   Liabilities, Insurance, Safety Net, Recurring, Search
6. **7D / 1M / 3M** selector and a **net-worth sparkline**
7. **Financial health** — circular gauge with a grade and per-pillar bars
8. **Insights** — safe-to-spend per day plus up to 2 spending anomalies
9. **Recent Transactions** (4) and **Upcoming Bills** (4)

**When empty:** "Your net worth trend will appear here" · "No transactions yet"
· "No upcoming bills" · "No alerts right now — your spending looks steady."

*File:* `lib/features/reports/screens/dashboard_screen.dart` (1,388 lines)

❌ **Broken** — the Investments tile reads the **legacy** `Holdings` table
(`dashboard_providers.dart:84`), so it can show a large figure while the
Investments screen shows nothing. See [§7.1](#71-two-portfolio-models-disagree).

---

### 3.3 Transactions — `/app/transactions`

**For you.** Every transaction, newest first. Swipe-free list with a delete
button per row; the **Add** button is bottom-right.

**When empty:** "No transactions yet" / "Tap Add to log your first one."

*File:* `lib/features/transactions/screens/transactions_screen.dart` ·
🟡 **Partial** — list and delete work, but there is **no edit screen**
([§7.9](#79-no-transaction-edit-screen)).

---

### 3.4 Add Transaction — `/app/transactions/add`

**For you.** Log money in or out. There is a shortcut at the top: type
something like *"spent 450 on groceries at bigbasket"* and it fills the form
for you.

**What you see:**

1. **Quick-add** field — hint "Try: spent 450 on groceries at bigbasket"
2. **Expense / Income** toggle
3. **Amount** — large centred field with a ₹ prefix
4. **Date** chip — "Today, 30 Jul 2026", opens a date picker
5. **Category grid** — icon tiles, headed "Select Category"
6. **Note** (optional)
7. **Attach receipt** button
8. **Save Transaction**

Saving also *learns*: the merchant you typed is linked to the category you
chose, so next time it is suggested automatically.

*File:* `lib/features/transactions/screens/add_transaction_screen.dart`

🟡 **Partial** — saving, categorising, learning and double-entry postings all
work. **The receipt attachment is not saved**
([§7.6](#76-receipt-attachments-never-persist)).

---

### 3.5 Search — `/app/search`

**For you.** Full-text search across merchant, note and category.

**When empty:** "No matching transactions"

*File:* `lib/features/transactions/screens/search_screen.dart` · ✅ **Working**
— real SQLite FTS5 with a porter tokenizer, not a substring filter.

---

### 3.6 Recurring — `/app/recurring`

**For you.** Rules that create transactions automatically — rent, salary,
subscriptions. Each row shows amount, category, frequency and next run date.

Rules materialise **once per unlock**, and catch up on any runs missed while
the app was closed.

**When empty:** "No recurring rules yet."

*File:* `lib/features/transactions/screens/recurring_screen.dart`

❌ **Broken** — materialised transactions write **no double-entry postings**
([§7.7](#77-recurring-and-imported-transactions-skip-the-ledger)), so they are
invisible to account-based net worth.

---

### 3.7 Budget — `/app/budget`

**For you.** A monthly limit per category, with a progress bar that turns amber
past 70% and red past 90%. "50/30/20" sets up needs/wants/savings from your
income in one step.

Spent is always recalculated from your transactions — never stored — so it
cannot drift.

**When empty:** "No budgets yet" / "Add one or use the 50/30/20 quick start."

*File:* `lib/features/budget/screens/budget_screen.dart` · ✅ **Working**
(fires a local notification when you cross your alert threshold)

---

### 3.8 Calendar Ledger — `/app/calendar`

**For you.** A month grid with income/expense dots on each day. Tap a day to
see everything that happened. On a wide screen it is three columns (totals ·
calendar · day detail); on a phone the day detail opens as a bottom sheet.

**What you see:** month totals (Income / Spending / Net), the calendar, and a
budget tracker.

**When empty:** "Select a day to see its ledger." / "No transactions on this day."

*File:* `lib/features/calendar/screens/calendar_ledger_screen.dart`

🟡 **Partial** — read-only. You cannot add or edit a transaction from a day
cell. It is also the only screen that widens the global layout cap to 1280px.

---

### 3.9 Investments — `/app/investments`

**For you.** Your portfolio: what it is worth, what you paid, what you have
made, and how it splits by sector.

**What you see** (two columns on screens ≥1000px):

1. **Six stat tiles** — Current value (with "Priced today / n days ago"),
   Invested, Unrealised P&L with %, Realised P&L with disposal count, XIRR,
   Dividends
2. **Warning banners** — holdings with no price; imported lots awaiting review
3. **Allocation** donut by asset group
4. **Profit & loss by sector** — top 6 with share bars, "All" opens Breakdown
5. **Market cap** split
6. **Movers** — best and worst 3 by return
7. **Holdings** — every position, expandable to per-lot detail with cost basis,
   price date, industry, ISIN and an "if sold today" tax estimate

**Toolbar:** Full breakdown · Import lots · **Add lot**

**When empty:** "No holdings yet" / "Add a lot with its purchase price and
charges, or import a broker CSV. Profit and loss by sector appears as soon as
you record a current price."

*File:* `lib/features/investments/screens/investments_screen.dart`

❌ **Broken** — reads only the **new** lot model, while the Dashboard, Safety
Net and Accounts read the **legacy** one. Loading sample data populates the
dashboard but leaves this screen empty
([§7.1](#71-two-portfolio-models-disagree)). Additionally, imported lots can
never be priced ([§7.2](#72-prices-cannot-reach-the-new-model)), so they show
"at cost — no price" with zero P&L forever.

---

### 3.10 Breakdown — `/app/investments/breakdown`

**For you.** The full profit-and-loss table, grouped however you like: by
**Sector, Industry, Market cap, Asset class, Holding** or **Currency**. Each
row shows value, cost, P&L, return % and share of portfolio. The bold **Total**
row at the bottom always reconciles to the sum of the rows above.

**When empty:** "No lots yet" / "Add a holding with its purchase price to see
profit and loss broken down by sector."
Without prices: "No prices recorded — showing cost, not value."

*File:* `lib/features/investments/screens/portfolio_breakdown_screen.dart` ·
✅ **Working** — the reconciliation invariant is enforced by tests across
*every* dimension.

---

### 3.11 Add Lot — `/app/investments/add-lot`

**For you.** Record a purchase or sale. Three groups:

1. **Instrument** — Buy/Sell, asset type, symbol (it tells you the sector it
   recognised), name, exchange, ISIN, AMFI scheme code for funds
2. **The lot** — quantity, price, **charges**, trade date
3. **Current price** (optional, buy only)

Charges are asked for because they are part of your cost basis — leaving them
out makes your P&L look better than it is. The trade date decides short-term vs
long-term tax.

*File:* `lib/features/investments/screens/add_lot_screen.dart` · ✅ **Working**
— the only path that can write a price.

---

### 3.12 Import Lots — `/app/investments/import-lots`

**For you.** Load holdings or trades from a broker CSV. Columns are matched by
name, so order does not matter, and preamble rows are skipped. Everything is
previewed before anything is written, and rejected rows are listed with the
line number and reason.

Re-importing the same file will not duplicate anything.

**When nothing parses:** "Nothing could be read from this file. Check that it
has a header row naming a quantity column and a price column."

*File:* `lib/features/investments/screens/import_lots_screen.dart`

🟡 **Partial** — import works and is idempotent, but **imported lots have no
price**, so they contribute ₹0 P&L and cannot be updated
([§7.2](#72-prices-cannot-reach-the-new-model)).

---

### 3.13 Liabilities — `/app/liabilities`

**For you.** Credit cards and loans. Total outstanding at the top, then each
debt with its APR and EMI. **Payoff plan** simulates Avalanche vs Snowball and
tells you "Debt-free in *n* months. Total interest: ₹x".

**When empty:** "No liabilities tracked."

*File:* `lib/features/liabilities/screens/liabilities_screen.dart` · ✅ **Working**

---

### 3.14 Insurance — `/app/insurance`

**For you.** Policies and, more usefully, a **coverage gap analysis** — how
much cover you have against a rule-of-thumb recommendation, with the shortfall
in rupees.

Guideline shown: life cover ≈ 10× annual income; health ≥ ₹5L. Labelled "Not
financial advice".

**When empty:** "No policies yet. Tap Add."

*File:* `lib/features/insurance/screens/insurance_screen.dart` · ✅ **Working**

---

### 3.15 Goals — `/app/goals`

**For you.** Savings targets with progress bars. Each goal projects a
completion date from your actual contribution rate — "On track · est. Mar 2027"
or "4 months behind pace". Completed goals get an "Achieved" chip.

**When empty:** "No goals yet. Add one to start saving."

*File:* `lib/features/goals/screens/goals_screen.dart` · ✅ **Working**

---

### 3.16 Safety Net — `/app/safety-net`

**For you.** One readiness score out of 100 combining your emergency fund,
insurance cover and retirement assets, with a per-component breakdown showing
what you have against what is recommended.

*File:* `lib/features/safety_net/screens/safety_net_screen.dart`

🟡 **Partial** — the scoring is the best-tested service in the app, but the
screen has **no interactive elements at all**: it tells you the gap and offers
no way to act on it. It also reads the legacy holdings table
([§7.1](#71-two-portfolio-models-disagree)).

---

### 3.17 Reports — `/app/reports`

**For you.** Income vs expense bars, a spending-by-category donut (top 5 plus
"Others"), and a net-worth trend line, over 7D / 1M / 3M.

**When empty:** "No expenses in this period." / "Net worth trend will appear here"

*File:* `lib/features/reports/screens/reports_screen.dart` · ✅ **Working**

---

### 3.18 Capture Inbox — `/app/capture`

**For you.** Android only. Bank SMS and notifications are parsed **on the
device** into draft transactions that wait here for your approval. The raw
message is discarded the instant it is parsed — only amount, merchant and date
are kept. Nothing is ever added to your ledger without you tapping Add.

**What you see:** a permission card (Notification access · Allow SMS), then one
card per draft with a category dropdown and Dismiss / Add.

**When empty:** "Nothing to review" / "Incoming bank SMS and notifications are
parsed on-device and appear here as ready-to-add transactions."

On other platforms: "Automatic SMS / notification capture is available on
Android only. You can still add transactions manually."

*File:* `lib/features/capture/screens/capture_inbox_screen.dart` · ✅ **Working**
— confirming a draft runs the full transaction path, postings included.

---

### 3.19 Bank Import — `/app/import/bank`

**For you.** Import a statement CSV from **HDFC, ICICI, SBI or Axis**. You get
a preview showing how many rows parsed, how many are new and how many are
duplicates, before anything is written. Duplicates are struck through.

Deduplication is by SHA-256 fingerprint of date + amount + description, so
re-importing an overlapping statement is safe.

**When empty:** "Pick a statement file to preview."

*File:* `lib/features/import/screens/bank_import_screen.dart`

❌ **Broken** — imported transactions write **no double-entry postings**
([§7.7](#77-recurring-and-imported-transactions-skip-the-ledger)).

---

### 3.20 Settings — `/app/settings`

| Section | Items |
|---|---|
| **Vault** | Active vault · Lock now · Switch / add vault |
| **Help** | Take a tour |
| **Demo** | Load sample data |
| **Import** | Calendar ledger · Auto-capture · Import bank statement · Market data · Currency |
| **Backup** | Export encrypted backup |
| **Data & Privacy** | Export error log |
| **Danger zone** | Erase all data |

Footer: *"Khazana is fully offline. Nothing leaves this device without your
explicit action."*

*File:* `lib/features/settings/screens/settings_screen.dart`

❌ **Broken** — three separate problems live here:
**Load sample data** populates only the legacy model ([§7.1](#71-two-portfolio-models-disagree));
**Export backup** stamps the wrong schema version and **there is no restore**
([§7.4](#74-backup-is-write-only-and-mis-stamped));
**Erase all data** leaves the entire portfolio behind
([§7.3](#73-erase-all-data-does-not-erase-the-portfolio)).

---

### 3.21 Market Data — `/app/settings/market-data`

**For you.** Optional API keys for live price fallbacks. Yahoo Finance is used
first and needs no key. Keys are stored in your device keychain.

*File:* `lib/features/settings/screens/market_data_settings_screen.dart`

🟡 **Partial** — keys save and the fetch chain works, but refreshed prices land
in the **legacy** table only ([§7.2](#72-prices-cannot-reach-the-new-model)).

---

### 3.22 Currency — `/app/settings/currency`

**For you.** Manually entered exchange rates. The screen says they are "used to
convert foreign holdings into your vault currency".

**When empty:** "No exchange rates stored yet."

*File:* `lib/features/settings/screens/currency_settings_screen.dart`

❌ **Broken** — that promise is not kept. Rates are stored but
`currency_converter.dart` is imported by nothing
([§8.5](#85-dead-services)), so no holding is ever converted.

---

## 4. Data model

22 Drift tables, schema version **4** (`lib/data/database/app_database.dart:89`).
Money is **always** `Decimal` stored as TEXT; `double` is banned for monetary
values. All dates are Unix milliseconds.

### 4.1 Core ledger

| Table | Key columns | DAO / Repository |
|---|---|---|
| `Categories` | name, iconCodepoint | CategoryDao / DriftCategoryRepository |
| `Transactions` | amount, type, categoryId, merchant, note, accountId, attachmentRef, date | TransactionDao / DriftTransactionRepository |
| `Budgets` | categoryId, amountLimit, rolloverEnabled, alertThresholdPct | BudgetDao / DriftBudgetRepository |
| `MerchantAliases` | merchantPattern → categoryId, hitCount | MerchantAliasDao / DriftMerchantAliasRepository |
| `RecurringRules` | amount, frequency, nextRun, active | RecurringDao / DriftRecurringRepository |
| `TransactionFingerprints` | composite PK (vaultId, fingerprint) | FingerprintDao / **no repository** |

`Budgets` deliberately stores no `spent` column — it is computed from
transactions on every read, so it cannot drift.

### 4.2 Double-entry (v3)

| Table | Key columns |
|---|---|
| `Accounts` | name, type (asset/liability/income/expense/equity), subtype, openingBalance |
| `Postings` | entryId → Transactions, accountId → Accounts, amount (**debit-signed**) |

Postings for one entry always sum to zero.

### 4.3 Assets, liabilities, goals, insurance

| Table | Notes |
|---|---|
| `Holdings` | **Legacy**, superseded by v4 but still read by 5 places |
| `Liabilities` | principal, aprPct, termMonths |
| `Goals` / `GoalContributions` | contributions have no `vaultId` |
| `Insurances` | coverAmount, premium, renewalDate |
| `NetWorthSnapshots` | one per day, id `snap-<vault>-<yyyy-mm-dd>` |

### 4.4 Lot-level portfolio (v4)

| Table | Purpose |
|---|---|
| `Instruments` | One row per security: symbol, isin, schemeCode, sector, industry, marketCapBand, plus **sectorOverride/industryOverride** so a user correction survives a data upgrade |
| `Trades` | Every buy and sell with charges broken out (brokerage, STT, stamp duty, GST, other), source, isReviewed |
| `InstrumentPrices` | A dated price *series*, not a single column — this is what makes staleness showable |
| `Dividends` | Tracked separately from capital P&L |
| `FundHoldings` | Scheme → underlying ISIN at weight in basis points |
| `BenchmarkSeries` | Index closes |

All six front onto one `PortfolioDao` / `DriftPortfolioRepository`.

### 4.5 Auto-capture and FX

| Table | Notes |
|---|---|
| `PendingCaptures` | Extracted values only — **raw message text is never stored** |
| `FxRates` | Append-only; the only auto-increment integer PK |

### 4.6 Full-text search

`transactions_fts` — an FTS5 virtual table over merchant + note + category
name, kept in sync by three triggers (insert/delete/update).

### 4.7 Migrations

| Version | What it did |
|---|---|
| **v2** | Added `Insurances`, `NetWorthSnapshots` |
| **v3** | Added double-entry. Created cash/opening/income accounts per vault and one expense account per category, then converted every existing transaction into two balanced postings. Idempotent via deterministic ids |
| **v4** | Added the six portfolio tables and backfilled each legacy holding into one `Instrument` + one opening buy `Trade` at its average cost, flagged `isReviewed = false` — an average is not a real lot |

---

## 5. Transaction flows

### 5.1 Add a transaction ✅

`AddTransactionScreen._save()` → `TransactionNotifier.add()` → repository save →
`LedgerWriter.writeEntry()`.

The ledger writes two legs, debit-signed:

| Type | Debit `<id>:dr` | Credit `<id>:cr` |
|---|---|---|
| Expense | `acct-exp-<categoryId>` | cash account |
| Income | cash account | `acct-income-<vault>` |

Accounts are created on demand using the same id scheme as the v3 migration, so
new entries land on migrated accounts.

### 5.2 Edit / delete 🟡

Delete works and is correctly ordered — postings first, then the transaction, so
the foreign key is never violated. Fingerprints are deliberately *not* removed,
so a re-import stays deduplicated.

`update()` exists and correctly replaces both legs, but **nothing calls it**.

### 5.3 Quick natural-language entry ✅

`NlpParser` extracts amount (₹/rs/inr prefixes, commas stripped), type (11
income keywords), date (`yesterday`/`tomorrow`), merchant (`at`/`from`) and a
category hint (`on`/`for`). The resolver then looks up a learned merchant alias,
falling back to fuzzy category matching. **Nothing is saved from quick entry
alone** — it fills the form; you still press Save.

### 5.4 Recurring materialisation ❌

Runs once per unlock. Walks `nextRun` forward, catching up missed occurrences
(capped at 1000), writes them in one transaction and advances the rule.
**Writes no postings** — see [§7.7](#77-recurring-and-imported-transactions-skip-the-ledger).

### 5.5 SMS / notification capture ✅

1. Reject anything without a debit or credit keyword
2. **Strip the balance figure first**, so "Avl Bal Rs 12,345" is never read as
   the amount
3. Require a currency token on the amount, so account numbers are not read as money
4. Fingerprint as `date|amount|merchant`; drop duplicates
5. Save a draft — **raw text is discarded immediately**

Confirming a draft runs the full §5.1 path, postings included.

### 5.6 Bank CSV import ❌ (postings)

Four bank parsers with per-bank quirks — HDFC has separate withdrawal/deposit
columns, SBI has a single amount column with direction inferred from a minus
sign, Axis has two preamble rows. Dates accept five formats. Dedup is by
SHA-256 of `date|amount|first 30 chars of description`, checked in one batched
lookup, and the fingerprint is written in the same transaction as the row.
**Writes no postings.**

### 5.7 Add / import investment lots ✅ 🟡

Instrument matching precedence is **ISIN → schemeCode → symbol+exchange**, so a
manual entry and an import converge on one row rather than duplicating. Manual
lots are `isReviewed: true` (you typed them); imported lots are `false`.

Import ids are a deterministic FNV-1a hash of the trade's own values, so
re-importing updates the same rows. The CSV parser rejects rather than guesses:
unreadable dates, missing quantities and unidentifiable rows come back with line
numbers. Day-first date parsing (Indian convention), and `31 Feb` is rejected
rather than rolled into March. "SIP" is correctly a purchase, not a sell.

### 5.8 Prices ❌

`recordManualPrice` writes to `InstrumentPrices`. Latest-price selection reduces
in **Dart, not SQL**, because a SQL `MAX` over Decimal-in-TEXT would compare
lexicographically.

The refresh chain is Yahoo (no key) → AlphaVantage (key, 25/day) → TwelveData
(key, 8/min) → in-memory cache. **It writes to the legacy table only** — see
[§7.2](#72-prices-cannot-reach-the-new-model).

### 5.9 Encrypted backup 🟡

Header layout (all big-endian):

| Offset | Size | Field |
|---|---|---|
| `0x0000` | 4 | magic `0x46544F53` = `"FTOS"` |
| `0x0004` | 4 | schema version |
| `0x0008` | 4 | app version (encoded semver) |
| `0x000C` | 8 | timestamp ms |
| `0x0014` | 4 | plaintext size |
| `0x0018` | 32 | SHA-256 of the pre-encryption database |
| `0x0038` | 12 | AES-GCM nonce (**fresh per export, never reused**) |
| `0x0044` | … | AES-256-GCM ciphertext |
| `EOF−16` | 16 | GCM authentication tag |

The six restore checks: magic header · schema version policy · decrypt · GCM tag
· length + constant-time SHA-256 comparison · write only if all pass. A wrong
PIN and a corrupt file give the *same* message deliberately — no PIN oracle.

Export works. **Restore does not exist** — [§7.4](#74-backup-is-write-only-and-mis-stamped).

### 5.10 Erase all data ❌

Deletes transactions, budgets, holdings, liabilities, goals, contributions,
recurring rules, insurances, snapshots, fingerprints, postings, captures and the
FTS index. Deliberately keeps categories, merchant aliases, FX rates and
accounts so the vault stays usable.

**Leaves all six v4 portfolio tables intact** — [§7.3](#73-erase-all-data-does-not-erase-the-portfolio).

---

## 6. Security

| Aspect | Implementation |
|---|---|
| **Key derivation** | PBKDF2-HMAC-SHA256, **600,000 iterations**, 32-byte random salt → 32-byte AES key. Runs off the UI isolate (Web Crypto on web) |
| **In the keychain** | Salt, setup marker, derived key (for biometric unlock), vault registry, market-data API keys |
| **In the database** | Everything else, encrypted at rest by SQLCipher AES-256 via `PRAGMA key` |
| **Never stored** | The PIN itself |
| **PIN verification** | Re-derive and compare in **constant time** |
| **Biometrics** | Retrieves the stored key; device PIN allowed as system fallback |
| **Failure cascade** | 3 biometric failures → PIN only · 5 PIN failures → 30s cooldown |
| **Auto-lock** | On app background. Locking closes the SQLCipher handle, not just the UI |
| **Keychain scope** | `first_unlock_this_device` — survives reboot, never syncs to iCloud, never migrates device |
| **Log safety** | A sanitiser strips numeric runs longer than 3 digits before any log line is written |

macOS uses the **file-based** keychain (`usesDataProtectionKeychain: false`)
because the data-protection keychain requires a `keychain-access-groups`
entitlement that Xcode only accepts on a build signed with a real Apple
development certificate. Without this, vault creation failed with
`errSecMissingEntitlement` (-34018).

---

## 7. Defects

Ordered by how much they affect you. **7.1–7.8 and 7.10 are fixed** — see the
notes under each. **7.9, 7.11 and 7.12 still stand.**

### 7.1 Two portfolio models disagree — FIXED

**Impact:** the Investments screen shows "No holdings yet" while the Dashboard
shows a large investments figure, in the same vault.

**Fixed.** `InvestmentTotals` (`lib/domain/entities/investment_totals.dart`) is
now the single derivation every consumer outside the Investments feature reads,
exposed as `investmentTotalsProvider`. The legacy repository, DAO and providers
are deleted, so there is no second path left to drift. Sample data writes the
lot model. Pinned by `test/integration/holdings_cutover_test.dart`. The
`Holdings` *table* survives one more release for the v3 backfill, then goes.

**Root cause:** the app has two portfolio models and they never got unified.

| Reads **legacy** `Holdings` | Reads **new** `Instruments`/`Trades` |
|---|---|
| Dashboard net worth + Investments tile | Investments screen |
| Safety Net | Breakdown screen |
| Accounts net worth | |
| Market-data cache seed | |

**"Load sample data" writes only to `Holdings`** — five holdings (NIFTYBEES,
GOLDBEES, RELIANCE, INFY, SBIN). The Investments screen therefore renders its
empty state, correctly, because there genuinely are no `Trades`.

It cannot self-correct: a new vault is created at schema 4 via `onCreate`, so
`onUpgrade` never runs, and the v4 backfill early-returns on an empty
`Holdings` anyway. There is no "re-run backfill" action.

*Evidence:* `sample_data_provider.dart:116-135` · `investments_screen.dart:74-77` ·
`dashboard_providers.dart:84` · `app_database.dart:209-212`

**Fix:** point sample data at the lot model, and migrate the remaining legacy
readers.

### 7.2 Prices cannot reach the new model — FIXED

**Impact:** imported lots show "at cost — no price" with ₹0 P&L, permanently.
No amount of tapping refresh changes it.

**Fixed.** `PriceRefreshService` writes `InstrumentPrices` with the date the
*source* reported, routed by asset type: mutual funds to AMFI (finally wiring
the provider that had been built and tested with zero callers), equities and
ETFs to the ticker chain, and bonds/FDs to nothing at all — reported as skipped
rather than failed, since no free live source exists for them. A refresh button
sits in the Investments AppBar; there is still no scheduler, by design.

Two halves:
- `refreshPrices` writes to `Holdings.lastPrice` and never to `InstrumentPrices`
- `recordManualPrice` is called from exactly **one** place — the optional
  "Price today" field on the *first* Add Lot. There is no way to price an
  existing holding.

*Evidence:* `investment_providers.dart:111-128` · `add_lot_screen.dart:116`

### 7.3 "Erase all data" does not erase the portfolio — FIXED

**Impact:** after wiping, your lots, cost basis, prices, dividends and
benchmarks are all still there.

`eraseAllData` predates v4 and was never extended to the six new tables.

**Fixed.** `eraseAllData` now deletes `instruments`, `trades`,
`instrumentPrices` and `dividends`, children before parents. (`fundHoldings`
and `benchmarkSeries` are vault-independent reference data and are correctly
kept.) The app promises in writing that this button removes your financial data;
`test/integration/erase_all_data_test.dart` is that promise.

### 7.4 Backup is write-only and mis-stamped — FIXED

Two problems:
- Every backup is stamped **schema version 1** while the database is at **4** —
  and the comment claims the two match. A genuinely newer backup would be
  wrongly accepted.
- **There is no restore path.** `verifyBackup` exists, never writes, and has
  zero callers. Settings offers export only.

**Fixed.** `restoreBackup` is implemented and reachable — Settings → Restore
calls `verifyBackup` first and only then `restoreBackup`
(`settings_screen.dart:88,121`), with PIN entry for a backup written under a
different PIN. Round-tripped by
`test/integration/backup_restore_roundtrip_test.dart`.

The version mismatch turned out not to be a bug but an undocumented decision,
and is now documented as one: the header version answers "was this backup
written by an app newer than me", Drift's `schemaVersion` answers "how do I
migrate this file". They are deliberately independent, because the restore path
migrates the database it unpacks. Raising the header version would strand every
backup written from now on for no gain. See the comment on
`SettingsActions._schemaVersion`.

### 7.5 Currency conversion is promised but not wired — FIXED

The Currency screen states rates convert foreign holdings. They do not —
`CurrencyConverter` is tested but imported by nothing, and holdings are summed
across currencies without conversion.

**Fixed.** `investmentTotalsProvider` converts every foreign holding into the
base currency before anything downstream sees it, so the converter is now
load-bearing rather than decorative. A holding with no stored rate is
**excluded** from the total and named in `InvestmentTotals.unconvertedCurrencies`,
with a notice on the Investments screen — counting 100 USD as 100 INR would
understate net worth by 99% and look entirely plausible. Rates can be fetched
live from ECB reference rates (free, no key, one request for all currencies) and
are stamped with the source's publication date, not the fetch time. Base
currency is a `shared_preferences` setting.

### 7.6 Receipt attachments never persist — FIXED

The repository omits `accountId` and `attachmentRef` when writing *and* when
reading back, so an attached receipt is silently discarded. The calendar reads
`attachmentRef`, which is always null.

**Fixed.** Both columns now round-trip in both directions —
`drift_transaction_repository.dart:60-61` reading and `:74-75` writing — so the
calendar's attachment indicator reflects a real file. Pinned by
`test/integration/transaction_repository_test.dart`.

### 7.7 Recurring and imported transactions skip the ledger — FIXED

Both write via the DAO directly instead of `LedgerWriter`, so they get no
double-entry postings. They appear in lists and search but are invisible to
account-based net worth.

**Fixed.** Both paths go through `ledgerWriterProvider`
(`recurring_providers.dart`, `bank_import_providers.dart:69`), so a recurring
charge or an imported statement line now moves account balances and net worth
like any hand-entered transaction. Pinned by
`test/unit/ledger_write_path_test.dart`.

### 7.8 Attachments are stored unencrypted — FIXED

Receipt images are copied to a sandboxed directory in the clear, while every
other artifact in the vault is encrypted. The web app's copy claims they are
encrypted.

**Fixed.** `AttachmentService` seals every file with AES-256-GCM under the vault
key — the same key that opens the database — in the same layout as the backup
format (12-byte random IV, ciphertext, 16-byte GCM tag), written to `.enc` files.
The bytes go from the picker straight through the cipher, so the plaintext is
never on disk even briefly. `purgeAll()` is wired into "Erase all data", which
previously deleted the rows and left every image behind. A file that exists but
fails authentication raises rather than rendering blank, because silent failure
would hide tampering or a key mismatch. Pinned by
`test/unit/attachment_encryption_test.dart`.

This one mattered beyond the bug: it was the only place where the product's
loudest claim — everything in the vault is encrypted on your device — was false.

### 7.9 No transaction edit screen

`update()` is implemented and correct; no UI reaches it. You can only add and
delete.

### 7.10 `'legacy'` is an undocumented enum value — FIXED

The v4 migration writes `source: 'legacy'` into `Trades` and `InstrumentPrices`,
but neither column documents it as valid.

**Fixed.** `PriceSource` is a real enum with a documented `legacy` member, and
it carries the consequence: because the migration stamps its own run time as
`asOf`, `legacy` maps to `PriceQuality.unknownDate` so those rows can never
render as "priced 2 minutes ago".

### 7.11 Release builds need `--no-tree-shake-icons`

A dynamic `IconData` in the category icon map defeats icon tree-shaking, so a
plain `flutter build` fails. Pre-existing, unrelated to recent work.

### 7.12 One golden test fails

`glass_card_fallback` fails at 4.06% pixel difference. Confirmed to fail
identically on a clean tree — an environment/font difference, not a regression.

---

## 8. Built but unreachable

Working, tested code with no way to invoke it from the app.

### 8.1 AMFI NAV provider 🔌

A single request returns the NAV for **every mutual-fund scheme in India** —
free, no API key, and it reveals nothing about which funds you own. Fully
implemented and unit-tested. Imported only by its test.

### 8.2 Add dividend 🔌

`PortfolioActions.addDividend` has no caller, so the Dividends tile is always
₹0 and dividends never enter XIRR.

### 8.3 Re-run backfill 🔌

`backfillLotsFromHoldings` is `@visibleForTesting` and reachable only from the
v4 migration. Exposing it would fix [§7.1](#71-two-portfolio-models-disagree)
for existing vaults in one tap.

### 8.4 XIRR calculator ✅ (now wired)

Was dead; now used by `portfolio_analytics.dart` and surfaced on both
investment screens.

### 8.5 Dead services

| File | Tests | Consumers |
|---|---|---|
| `currency_converter.dart` | 4 | none |
| `sync_merge.dart` | 8 | none |

Roughly 200 lines and 12 tests are green against code no user can reach.

---

## 9. Flutter ↔ web parity

| Feature | Flutter | Web |
|---|---|---|
| Encrypted vault, PIN unlock | ✅ | ✅ |
| Transactions, budgets, goals, insurance, liabilities | ✅ | ✅ |
| Calendar ledger | ✅ | ✅ |
| Safety net, reports, dashboard | ✅ | ✅ |
| Sector-wise P&L | ✅ lot-level | 🟡 aggregated, **unrealised only** |
| Allocation donut (validated palette) | ✅ | ✅ |
| **Multi-profile** (self / spouse / child) | ❌ absent | ✅ |
| **Bank statement import** | ✅ 4 banks | ❌ |
| **SMS / notification capture** | ✅ Android | ❌ parser exists, no UI |
| **Full-text search** | ✅ FTS5 | 🟡 substring filter |
| **Market data / live prices** | 🟡 legacy only | ❌ |
| **Multi-vault switching** | ✅ | ❌ single vault |
| Encrypted backup export | ✅ | ✅ |
| Backup restore | ❌ | ✅ |
| Guided tour | ✅ | ✅ |

The two clients share bundled data (`assets/instrument_master.json` is served to
the web app from `public/`) and mirror their domain logic with paired test
files, so sector roll-ups agree on both sides.

---

## 10. Verification

```bash
flutter analyze                     # expect: no issues
flutter test                        # expect: 263 pass, 1 known golden failure
cd webapp && npx tsc --noEmit       # expect: clean
cd webapp && npm test               # expect: 62 pass

# real-platform keychain (catches entitlement problems unit tests cannot)
flutter test integration_test/keychain_macos_test.dart -d macos

# builds
flutter build macos --release --no-tree-shake-icons
flutter build apk   --release --no-tree-shake-icons
```

**Current counts:** 263 Flutter tests · 62 web tests · 22 tables · 22 screens ·
24 domain services · 237 Dart files.

### Fastest way to see the portfolio working

Because of [§7.1](#71-two-portfolio-models-disagree), *Load sample data will not
populate the Investments screen*. Enter a lot by hand instead:

1. Investments → **Add lot**
2. `INFY`, quantity 10, price 1500, charges 20, **Price today** 1650
3. Repeat: `HDFCBANK`, 20 @ 700, price today 750

Both are in the bundled sector table, so the sector card splits them across
Information Technology and Financial Services with real profit and loss, and the
Breakdown screen's Total row reconciles.
