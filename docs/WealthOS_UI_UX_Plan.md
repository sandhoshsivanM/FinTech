# WealthOS — UI/UX Plan (MVP)
Based on WealthOS Development Plan v2 — Section 3 (MVP scope), Section 6 (functional spec), Section 7 (health score), Section 8 (narrative insights)

---

## 1. Navigation structure

The plan's own test decides what earns a tab: *"does this module change whether a user opens the app again next week?"* That gives exactly 4 destinations plus Settings — matching Section 3's MVP scope precisely, nothing added.

**Bottom navigation (5 items, mobile-first — Flutter, on-device only):**

| # | Tab | Screen | Why it's here |
|---|---|---|---|
| 1 | Dashboard | Home / net worth | Daily habit-loop screen — loads first, every time |
| 2 | Transactions | Cash flow | Highest-frequency data entry |
| 3 | Investments | Portfolio | Weekly-frequency check |
| 4 | Score | Health Score & Reports | The reason to open the app on a quiet week |
| 5 | Settings | Data, currency, export | Low-frequency, always reachable |

**Not in the bottom nav (reached from within a parent screen or a quick link):** Add Transaction, Add Lot, Import CAS/CAMS, Import Lots, Budget detail, Score category detail. This mirrors the "17 screens off 5 tabs" pattern that already works in Khazana — don't fight it, it's a proven pattern for this exact app shape.

**Deliberately absent from MVP nav** (Section 4 backlog — do not add a tab for these yet): Insurance, Goals, Tax, Liabilities, Calendar, Recurring. If any of these gets a tab before the 4-module core is validated, that's the scope-creep risk Section 15 warns about, happening in the nav bar.

---

## 2. Screen-by-screen plan

### 2.1 Dashboard — home screen

**Purpose:** Answer "how am I doing?" in under 3 seconds, then earn a second look with one insight.

**Layout, top to bottom:**
1. Greeting — "Good morning, Sandhosh" + settings icon
2. **Net worth hero card** — large number, ghost-mode eye toggle to hide amounts, change line (`+₹42,000 · 2.3% this month`)
3. **4 stat tiles** (2×2 grid) — Cash · Investments · Debt · Savings rate. Tappable, route to the owning module
4. **Health score band** — circular gauge + letter grade + 4 mini category bars (Wealth / Protection / Efficiency / Future). Protection and Future show **"Not yet tracked"** rather than a fabricated number until those Section-4 modules exist — this is Section 7's honesty rule, and it belongs in the UI, not just the spec
5. **Insight card** — one narrative sentence from Section 8's template engine, e.g. *"You saved ₹18,200 this month — spending down 9%."* Single card, dismissible, never more than one at a time
6. **Net worth sparkline** — 7D / 1M / 3M toggle
7. **Recent transactions** (last 4–5) — "View all" links to the Transactions tab

**Loads from cache, never recomputes live** (Section 6.1) — this is a hard requirement, not a nice-to-have, since it's the first screen on every cold open.

**Empty states:** "Your net worth trend will appear here" / "No transactions yet" / "Add your first holding to see your score."

---

### 2.2 Transactions

**Purpose:** Fast capture, honest categorisation, budget awareness — in that priority order.

**Layout:**
1. **Budget strip** (collapsible) — top 3 categories closest to their limit, amber/red progress bars
2. **Quick-add field** — natural-language entry, placeholder *"Try: spent 450 on groceries at bigbasket"*
3. **Review queue banner** (only when non-empty) — *"3 SMS transactions to confirm"* — auto-captured items never touch the Dashboard total until reviewed (Section 6.2's confidence/review-queue rule)
4. **Transaction list** — grouped by day, newest first, category icon + merchant + amount, swipe or tap to edit
5. **Floating add button** — opens the full Add Transaction form for manual entry

**Add Transaction (sheet/modal, not a separate page):**
- Expense/Income toggle
- Amount (large, centred, ₹ prefix)
- Category grid (icon tiles, auto-suggested from merchant learning)
- Date chip
- Note (optional)
- Save

**Empty state:** "No transactions yet — try the quick-add above, or wait for your first SMS capture."

---

### 2.3 Investments

**Purpose:** One honest number for "what do I own and what has it made me," broken down the way you actually think about it.

**Layout:**
1. **Import bar** — "Import CAS/CAMS statement" (primary, Section 6.3's core data source) · "Add lot manually" (secondary)
2. **Stat tiles** — Current value · Invested · Unrealised P&L · XIRR
3. **Allocation sunburst** — two-ring hierarchical chart: inner ring = asset class (Equity / Mutual funds / ETF / Bonds / Cash), outer ring = sector or sub-type within that class. Tap a segment to zoom in; tap centre to zoom back out. Replaces a flat donut + separate sector list with one chart that answers both "what do I own" and "what's it made of" — see Section 7
4. **Holdings list** — every position, expandable to lot-level detail

**Non-negotiable UX rule, given what already went wrong once:** every number on this screen and the Dashboard's investment tile must read from the **same single data table**. There is no "legacy vs new" split in this plan — one model, one source of truth, from day one. This is the one lesson to carry forward from Khazana's §7.1 defect.

**Empty state:** "No holdings yet — import your CAS/CAMS statement to get started."

---

### 2.4 Score & Reports

**Purpose:** The weekly "why" behind the Dashboard's grade.

**Layout:**
1. **Score gauge + grade**, large, at top
2. **4 category cards** (Wealth / Protection / Efficiency / Future), each expandable to show its 2–3 underlying metrics and *why* it moved this week
3. **Weekly narrative report** — the Section 8 paragraph, e.g. *"Your wealth increased by ₹42,000 this month. 60% came from investments, 40% from savings."*
4. **Score history** — simple trend line, past 8–12 weeks

**Empty state (categories with no data yet):** shown as neutral/grey, labelled "Not yet tracked" — never estimated.

---

### 2.5 Settings

Standard list: Currency, Data export, Notification preferences, About/version, Erase data (with a real confirmation and a real restore path — Section 6's data-integrity bar applies here too).

---

## 3. Navigation flow (how the 5 tabs connect)

```
Dashboard ──tap stat tile──> owning module (Transactions / Investments)
Dashboard ──tap insight──> Score & Reports (the insight's source category)
Dashboard ──tap "View all" transactions──> Transactions tab

Transactions ──FAB──> Add Transaction (sheet, returns to list on save)
Transactions ──tap review banner──> Confirm queue (sheet)

Investments ──Import CAS/CAMS──> Import preview (review before write, same
              pattern as Khazana's CSV import — nothing writes until confirmed)
Investments ──tap holding──> Lot detail

Score ──tap category card──> expands in place (no navigation, just disclosure)
```

No screen is more than one tap from the tab bar — this is deliberate. A 4-module MVP with deep navigation defeats its own "open it every day" goal.

---

## 4. What this plan deliberately leaves out (matches Section 4's parked backlog)

No screens, tabs, or nav entries for: Insurance, Goals, Tax planning, Liabilities, Calendar, Recurring rules, Multi-profile. Adding any of these to the nav before the 4-module loop is validated is scope creep into Section 4's backlog — the plan's own stated execution risk (Section 15).

---

## 5. Design principles carried through every screen

- **One data model per concept.** Investments has one portfolio table. Transactions has one ledger. No screen may read a different source of truth than another screen showing the "same" number.
- **Cached, not live-computed**, on every screen that opens frequently (Dashboard especially).
- **Honest gaps over fabricated numbers.** "Not yet tracked" beats a placeholder score, per Section 7.
- **Review before write**, for anything auto-captured (SMS, CAS import) — nothing touches the net worth total until a human confirms it.
- **SEBI-safe language** in every narrative sentence — informational framing only, never "buy X / sell Y" (Section 11).

---

## 6. Live pricing pipeline (per asset type)

Section 6.3 of the plan covers *acquiring* holdings via CAS/CAMS, but not how their prices stay current afterward. This fills that gap, using free sources only, matching the free-tier-first architecture in Section 10.

| Asset type | Free source | Cost/limits | Refresh cadence |
|---|---|---|---|
| **Mutual funds** | AMFI's daily NAV feed (raw text dump, or a wrapper API like mfapi.in that serves it as clean JSON) | Free, no key, no sign-up | Once daily, after AMFI publishes (~11 PM IST) |
| **Stocks & ETFs** | Yahoo Finance (unofficial) as primary → AlphaVantage or Twelve Data free tiers as fallback when rate-limited | Free; unofficial source can break without notice, so a fallback matters | Near real-time in market hours, or once daily if refreshed on open |
| **Bonds / G-Secs** | No reliable free live-price API exists | — | Manual entry at cost, refreshed occasionally, or an indicative yield lookup |

**Design implications for the UI:**
- Every holding shows a **"priced as of" timestamp** — MF prices lag a day, bonds may be weeks stale, and the UI should say so rather than imply everything is equally live
- **Bonds carry a visible "manual / indicative" badge**, distinct from live-priced equity and MF/ETF holdings, so the total portfolio value doesn't overstate its own precision
- **One fallback chain, one write target.** All three sources should ultimately write into the same single portfolio table (Section 2.3's non-negotiable) — never a per-source table, which is exactly the split that broke pricing in the earlier Khazana build

---

## 7. Investments visualization — sunburst chart

**Why a sunburst over a donut + list:** a flat donut answers "what asset types do I hold," and a separate sector list answers "what sectors am I exposed to" — but they're disconnected, so a user has to mentally combine two visuals to answer "how much of my *equity* is in IT vs financial services." A sunburst answers both in one chart, because sector sits literally inside its parent asset class.

**Structure (2 rings for MVP):**
- **Inner ring** — asset class: Equity, Mutual funds, ETF, Bonds, Cash
- **Outer ring** — sector/sub-type within that class (e.g. Equity → IT, Financial Services, FMCG, Energy; Mutual funds → Large cap, Mid cap, Debt)
- **Centre** — total portfolio value, doubles as the "zoom out" tap target

**Interaction:**
- Tap a segment with children → zooms in, that segment becomes the new centre
- Tap the centre → zooms back out one level
- Hover/long-press a segment → shows its name, value, and % of portfolio (or of the parent, once zoomed in)
- A breadcrumb trail above the chart shows the current zoom path (Portfolio → Equity → IT)

**Color:** one color per top-level asset class (inner ring), the outer ring's sectors inherit their parent's hue at lower opacity — so at a glance, all of "Equity" reads as one color family even before zooming in.

**Where it lives:** replaces the donut on the Investments screen (Section 2.3). The Dashboard's Investments stat tile stays a simple number — the sunburst is a drill-down tool, not a glanceable summary, so it belongs on the full Investments screen, not the home screen.

---

## 8. Chart component reference — investment & dashboard screens

Bklit UI (referenced at bklit.com/studio) ships 15 chart types. Not all of them fit an investment app — this maps the ones that do to where they belong in WealthOS, so the Investments and Score screens use a consistent, purpose-built chart per job rather than reaching for whichever one looks nicest.

| Bklit component | Use it for | Screen |
|---|---|---|
| **Sunburst chart** | Asset class → sector drill-down allocation | Investments (Section 7) |
| **Area chart** | Net worth / portfolio value trend over time | Dashboard sparkline, Investments trend |
| **Bar chart** (diverging) | Sector-wise or holding-wise profit & loss — bars above/below a zero baseline | Investments screen |
| **Gauge** | Financial Health Score (0–100, with grade) | Dashboard, Score screen |
| **Radar chart** | Comparing the 4 health-score categories (Wealth/Protection/Efficiency/Future) at a glance | Score screen — near-term addition once all 4 categories have real data |
| **Ring chart** | Budget-per-category progress (multi-ring, one ring per category) | Transactions/Budget screen |
| **Candlestick chart** | Individual stock price history, if a per-holding detail view is ever added | Out of MVP scope — only relevant if Section 4's deeper holding drill-down gets built |
| **Heatmap** | Monthly return calendar — a quick "which months were good/bad" view | Investments screen, secondary to the trend chart |
| **Sankey chart** | Income → savings → investments flow, showing where money actually goes each month | Near-term backlog — powerful, but a second visualization to build, not MVP |

**Deliberately not used:** Choropleth (geographic — no use case here), Funnel (conversion funnels — not a personal finance concept), Scatter and Composed (useful later for risk/return analysis across holdings, but adds complexity before the core loop is validated).

Below is what the Investments screen looks like with the area, bar, and heatmap components in place alongside the sunburst.

---

## 9. Platform-specific design — one app, three shells

The MVP is mobile-first (Section 9 of the base plan), but the same Flutter codebase can target macOS, web, and Android from one source — which is exactly the shape Khazana already proved out (macOS, Android, iOS, web from one Flutter app + a separate Next.js web client). The screens in Sections 1–8 are the same everywhere; what changes per platform is **navigation chrome and interaction idiom**, not features.

### 9.1 macOS — native desktop feel

Follows Apple's Human Interface Guidelines for macOS, not a stretched phone screen:

- **Sidebar navigation**, not bottom tabs — persistent left sidebar (~240–260px), grouped into sections (Overview / Money / Wealth / Data), matching the pattern already proven in Khazana's desktop shell
- **Menu bar integration** — File, Edit, View menus with standard shortcuts (`Cmd+N` new transaction, `Cmd+L` lock vault, `Cmd+,` preferences)
- **Window chrome** — native traffic-light controls, resizable, remembers window size/position between launches
- **Keyboard-first** — every primary action reachable without a mouse; visible focus rings
- **Right-click context menus** on transactions and holdings (edit, delete, duplicate) — a desktop affordance with no mobile equivalent
- **Multi-window optional, not required** — a "detach" option for the Investments screen into its own window is a nice-to-have, not MVP

### 9.2 Web — the constrained platform

Web is the platform with the fewest device capabilities, so its design has to be honest about that rather than pretend parity:

- **No SMS/notification capture** — browsers can't read device SMS. CAS/CAMS upload and manual entry become the *primary* input paths on web, not fallbacks — the UI should not show a greyed-out "SMS capture" option, it should simply not exist here, per Khazana's own parity table
- **Responsive breakpoints**, not a fixed shell — sidebar collapses to a hamburger/bottom nav below ~900px, matching the platform-detection logic already used (`isDesktopPlatform` keyed on OS, not window width, but web itself stays width-driven since it's opened on both phones and desktops)
- **Drag-and-drop file upload** for CAS/CAMS statements, since there's no native file picker integration to lean on
- **Installable as a PWA** — offer "Add to Home Screen" so returning users get an app-like re-entry point without an app store

### 9.3 Android — Material Design 3

The Android build should read as a native Android app, not a ported iOS layout:

- **Material 3 ("Material You") dynamic color** — the app's accent color can adapt to the user's system wallpaper palette, while semantic colors (success/danger/warning) stay fixed regardless of theme
- **Bottom navigation bar** (the 5-tab structure from Section 1) with Material's pill-shaped active-state indicator, not a plain icon-and-label tab
- **Floating action button (FAB)** for the primary action per screen — "Add transaction" on Transactions, "Add lot" on Investments — a filled circular button, bottom-right, that scrolls with content per Material spec
- **Elevation via shadow, not borders** — cards lift with a soft shadow on interaction (press, drag) rather than the flat-bordered card style used elsewhere; ripple effect on every tap target
- **Edge-to-edge layout** with the system status bar and gesture nav bar treated as insets, not blocked off
- **Adaptive icon** for the home screen, and Android's own biometric prompt UI (not a custom-drawn one) for vault unlock

### 9.4 What stays identical across all three

- Every screen's information architecture (Sections 2.1–2.5)
- The single-source-of-truth data rule (Section 2.3) — one portfolio table, one ledger, regardless of platform
- The sunburst, area, bar, and heatmap chart logic (Sections 7–8) — same components, same data, just re-flowed into sidebar-shell vs bottom-nav-shell layouts
- The health score's "not yet tracked" honesty rule (Section 7 of the base plan)

**The only thing that should ever look "off" between platforms is chrome** — how you navigate and where buttons sit. If a chart shows a different number on Android than it does on macOS, that's not a platform design choice, that's the two-model bug from Khazana happening again.
