# WealthOS — UI/UX Plan (MVP)
Based on WealthOS Development Plan v2 — Section 3 (MVP scope), Section 6 (functional spec), Section 7 (health score), Section 8 (narrative insights)

---

## 0. Dashboard v1 — implementation checklist

Everything below is decided and documented elsewhere in this plan. This is the build list, in one place.

**Layout & components (Section 2.1):**
- [ ] Greeting header + settings icon
- [ ] Story ring entry point (Section 12) — compact, above the greeting, opens the Weekly Story Recap full-screen; not embedded in the scroll itself
- [ ] Net worth hero card — large number, ghost-mode eye toggle, change line
- [ ] 4 stat tiles (2×2): Cash · Investments · Debt · Savings rate — tappable, route to owning module
- [ ] Health score band — gauge/grade + 4 category mini-bars (Wealth/Protection/Efficiency/Future)
- [ ] "Not yet tracked" state for Protection & Future until their modules exist (Section 7 honesty rule) — **not** a placeholder number
- [ ] Insight card — one Section 8 narrative sentence, dismissible, never more than one at a time
- [ ] Net worth sparkline — 7D/1M/3M toggle
- [ ] Recent transactions (last 4–5) + "View all"

**Data rules (non-negotiable, Section 2.3 / Section 6):**
- [ ] Every figure reads from the single portfolio/ledger model — no per-screen data source
- [ ] Loads from cache, never recomputes live on open
- [ ] Investments stat tile stays a plain number here — sunburst drill-down lives on the Investments screen only, not the Dashboard (Section 7)

**Brand (Section 10):**
- [ ] Ink (`#1B2340`) / Paper (`#FAF8F4`) base palette
- [ ] Signal amber (`#E8A33D`) reserved for exactly one element per screen — on the Dashboard, that's the Health Score card
- [ ] Manrope, tabular numerals on every currency figure
- [ ] Growth/Caution semantic colors (`#4C7A63` / `#B5493D`) for +/- amounts only — never decorative

**Platform behavior (Section 9):**
- [ ] macOS: Dashboard sits in the sidebar shell's "Overview" group; `Cmd+N` opens Add Transaction from anywhere, including from the Dashboard
- [ ] Android: bottom nav Home tab, Material 3 pill active-state, FAB not shown on Dashboard itself (FAB appears on Transactions/Investments, per Section 9.3)
- [ ] Web: same layout, collapses sidebar→hamburger below ~900px; no SMS-derived recent-transaction entries possible here (Section 9.2)

**Explicitly NOT on the Dashboard (stays elsewhere or deferred):**
- Sunburst allocation chart, sector P&L, monthly heatmap — Investments screen only (Section 7–8)
- Tax lot / STCG-LTCG detail — Investments → Tax sub-view only (Tax Lot Engine Spec, Section 8)
- Weekly Story Recap — separate entry point, not embedded in the Dashboard scroll (Section on signature feature)
- Insurance, Goals, Tax, Liabilities — no Dashboard tiles until their modules exist (Section 4 backlog discipline)

**Still open before this is truly build-ready:**
- Validation kit (Section 11) hasn't been run on real users
- Logo mark (Section 10.4) is a direction, not a final asset

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
3. **Primary chart — allocation sunburst** — always visible. Two-ring hierarchical chart: inner ring = asset class, outer ring = sector/sub-type. Tap a segment to zoom in; tap centre to zoom back out — see Section 7
4. **Primary chart — value trend** — always visible, directly below the sunburst. Area chart, 6-month default range
5. **"More detail" toggle** — collapsed by default. Expands to reveal the **secondary charts**: sector-wise P&L (diverging bar) and the monthly returns heatmap (Section 8). These are real, useful views — but showing all four charts at once on first load turns a calm "how am I doing" screen into a dense analytics dashboard, which fights the base plan's own positioning. Two charts earn a permanent place; two earn a tap.
6. **Holdings list** — every position, expandable to lot-level detail

**Why this split, not just "fewer charts":** the sunburst answers "what do I own," the trend answers "is it working" — those are the two questions someone actually opens this screen with. Sector P&L and monthly heatmap answer "why," which is a follow-up question, not the first one.

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

### 9.3a Interaction depth, not just chrome
A sidebar vs. a bottom nav is chrome. The gap that actually matters is how the *same* interaction — say, drilling into the sunburst — behaves once you're not tapping a touchscreen anymore.

| Interaction | macOS | Android |
|---|---|---|
| Zoom into a sunburst segment | Click segment, or hover + scroll to zoom continuously | Tap segment; pinch-to-zoom not supported (sunburst zoom is discrete, not continuous, so pinch has no natural mapping) |
| Zoom back out | Click centre, or `Esc` | Tap centre, or system back gesture |
| Edit a transaction | Right-click → context menu (Edit/Delete/Duplicate), or select + `Enter` | Long-press → bottom sheet with the same three actions |
| Navigate the transaction list | Arrow keys move selection, `Enter` opens, `Cmd+Backspace` deletes | Swipe left/right on a row for quick delete/edit, standard Material list behaviour |
| Search | `Cmd+F` focuses search from anywhere | Tap the search icon; no global shortcut, since there's no keyboard |
| Weekly Story Recap | Click-through with arrow keys or on-screen chevrons (no swipe gesture available) | Swipe left/right between cards, matching the Stories format it's borrowing from |

This table is what actually gets a platform to "feels native" rather than "looks native" — the visual chrome was the easy 80%.

### 9.4 What stays identical across all three

- Every screen's information architecture (Sections 2.1–2.5)
- The single-source-of-truth data rule (Section 2.3) — one portfolio table, one ledger, regardless of platform
- The sunburst, area, bar, and heatmap chart logic (Sections 7–8) — same components, same data, just re-flowed into sidebar-shell vs bottom-nav-shell layouts
- The health score's "not yet tracked" honesty rule (Section 7 of the base plan)

**The only thing that should ever look "off" between platforms is chrome** — how you navigate and where buttons sit. If a chart shows a different number on Android than it does on macOS, that's not a platform design choice, that's the two-model bug from Khazana happening again.

---

## 10. Brand & visual identity system

Every mockup so far used the generic chat-widget design system — functional, but interchangeable with any other app's dashboard. This section defines what actually makes WealthOS look like *itself*.

### 10.1 Color system
Most Indian fintech defaults to bright blue-and-green (trust + money, literally). WealthOS's positioning — "the operating system for your financial life" — calls for something calmer and more editorial, closer to how a well-designed OS or a Stripe-adjacent product feels than a typical finance app.

| Role | Color | Hex | Why |
|---|---|---|---|
| **Ink** (primary, text/nav) | Deep indigo-navy | `#1B2340` | Stable, intelligent, not another finance-app blue |
| **Paper** (background) | Warm off-white | `#FAF8F4` | Editorial, calm — not stark clinical white |
| **Signal** (accent — insights, score, the one thing to look at) | Warm amber-gold | `#E8A33D` | Used *sparingly*, so it always means "look here" — the Health Score, the Weekly Story, a key insight. If it's on every button, it stops meaning anything |
| **Growth** (positive) | Muted sage | `#4C7A63` | Deliberately not neon green — confident, not shouty |
| **Caution** (negative) | Muted brick | `#B5493D` | Serious without being alarming |
| **Ink-40** (secondary text/borders) | `#6B6F80` | Derived from Ink at reduced opacity, not a separate gray |

**The rule that makes this a system, not a palette:** Signal (amber) is the *only* saturated color allowed to be decorative. Everything else is either Ink (structure), Paper (space), or a semantic Growth/Caution pair (meaning). A screen with three amber elements has failed — amber marks the single most important thing on that screen, never more than one at a time.

### 10.2 Typography
- **Headings & numbers** — Manrope (geometric, slightly rounded terminals — warmer than a strict grotesk, still feels precise for currency figures)
- **Body & UI text** — same family, regular weight, for consistency rather than pairing two typefaces
- **Numerals** — tabular figures everywhere a number might update (net worth, P&L) so digits don't jitter horizontally when they change

### 10.3 Iconography & motion
- Outline icons throughout, 1.5px stroke weight, rounded joins — consistent with what's already in the mockups, kept rather than replaced
- **Icon color follows the same discipline as Signal**: icons are Ink by default; only the active/selected state gets amber
- Motion: transitions are quick and functional (150–200ms), never decorative — this is a finance app, not a game; the one exception is the Weekly Story Recap, which can use a slightly slower swipe transition (250ms) since that screen is meant to feel like a moment, not a task

### 10.3a Dashboard motion — what actually animates

The rule above was too generic to build from. Here's what's specified now, element by element:

| Element | Animation | Duration | Trigger | Why it's functional, not decorative |
|---|---|---|---|---|
| Net worth figure | Count-up from 0 to value | ~900ms, ease-out | On screen mount (once, cached data still loads instantly — this animates the *display*, not a live recompute) | Draws the eye to the number that matters most, first |
| Health score gauge | Arc sweeps from empty to the score's fill | ~900ms, ease-out | On screen mount | Reinforces "explainable, not just a number" (Section 7 of base plan) — watching it settle mirrors the idea that it's built from parts |
| Net worth sparkline | Line draws left to right | ~800ms, ease-out, starts 150ms after the count-up | On screen mount | Signals "this is a trend," not a static image |
| Story ring | Gentle opacity pulse (1 → 0.55 → 1) | 2.2s loop | Continuous, only while an unviewed recap exists; stops once viewed | The one intentionally continuous animation — it's a notification, and notifications are supposed to draw attention |
| Stat tiles, insight card | Fade + 4px slide-in, staggered ~40ms apart | 200ms each | On screen mount | Standard entrance, nothing that delays reading the numbers |
| Everything else (taps, navigation) | Standard platform transition | Platform default | Interaction | Android uses Material 3's standard/emphasized easing curves, not a custom one — a hand-rolled curve is what makes an app feel like a web view instead of a native one |

**Reduced motion:** every animation above degrades to an instant final-state jump under `prefers-reduced-motion: reduce` — no exceptions, including the story ring pulse.

**What deliberately doesn't animate:** stat tile numbers don't count up (only the hero net worth figure does — count-up on every number would slow down reading, not help it), and nothing on the Dashboard animates on every re-render, only on first mount.

### 10.4 Logo direction (concept, not final)
An abstract mark suggesting a gauge or pulse settling into balance — two overlapping arcs in Ink and Signal, echoing the Health Score gauge that's already the product's core visual metaphor. Worth designing properly as a follow-up, not guessed at here.

Below is the Dashboard reskinned with this system in place, next to what it looked like before — same layout, same data, different identity.

---

## 11. Validation plan (not yet run — this is a script, not evidence)

Section 5 of the base plan sets the Stage 2 exit criteria as *unprompted repeat usage in week 2* from 5–10 real users. Nothing in this document, including this section, satisfies that — a plan for validation isn't validation. This is the concrete kit to actually run it.

**Recruit:** 5–10 people who currently track finances in a spreadsheet or another app — not friends doing a favor, people with a real existing habit to compare against.

**Task-based session (15–20 min each), in order:**
1. Import or manually add their real CAS/CAMS statement or a week of real transactions — watch where they hesitate, don't help unless stuck for 30+ seconds
2. Find their net worth, then find "why did my score change this week" — un-narrated, see if the Health Score's structure is self-explanatory
3. Try to delete/undo something — tests whether the data-integrity fixes actually hold up under real fumbling, not just clean demo data

**Metrics that matter more than opinions:**
- Task completion without help (target: 4/5 tasks unassisted)
- Time-to-first-insight (how long until they say something like "oh, interesting" unprompted)
- **Week-2 return without a reminder** — the actual Stage 2 exit criteria, tracked via a simple "did you open it again" check-in, not a survey

**What to explicitly ask, not just observe:** *"What would make you delete this and go back to your spreadsheet?"* — a sharper question than "what did you like," because it surfaces the actual dealbreaker rather than polite feedback.

**Honest scope:** this closes the validation gap only once it's actually run. Everything else in this document can reasonably be called a 9/10 effort. This one stays capped until real people have used it.

---

## 12. Signature feature — Weekly Story Recap

This was decided during planning but never actually written into the spec until now — worth naming, since a decision that only exists in conversation isn't a decision anyone can build from.

### 12.1 Why this, specifically
The Health Score is good execution of a known idea — every competitor scores something. The gap the base plan doesn't close on its own is a single unmistakable experience: the thing someone describes to a friend as "the app that does *that*." A swipeable, Instagram-Stories-format weekly recap is that thing, for two reasons: nobody in Indian personal finance uses this format, and it costs almost nothing extra to build, because it's Section 8's narrative engine wrapped in a different presentation layer rather than new logic.

### 12.2 Entry point (not embedded in the Dashboard scroll)
A single compact "story ring" sits at the very top of the Dashboard, above the greeting — the same visual language as an Instagram/WhatsApp status ring: a circular avatar-style element that fills with the Signal amber outline when a new recap is ready, and dims to Ink-40 once viewed. Tapping it opens the recap full-screen. This keeps the Dashboard itself calm (Section 0's checklist) while making the recap impossible to miss.

### 12.3 Card structure (5–6 cards, swipeable)
Generated fresh every week, following a fixed slot order:

1. **Opening card** — headline number: net worth movement for the week
2. **Score card** — Health Score movement, one line on which category moved it most
3. **Win card** — the single largest positive change (spending down in a category, a gain, idle cash reduced)
4. **Attention card** — the single largest thing worth a look (spending up, idle cash sitting, a score category slipping)
5. **Flashback card** *(conditional — see 12.4)* — the Time Machine counterfactual, only when a real trigger condition is met, not every week
6. **Closing card** — one CTA (review this week's budget / see full Investments breakdown) plus a streak indicator if the score held or improved

### 12.4 Time Machine — the flashback card
*"If you'd moved that idle ₹1.2L into a fund a year ago, you'd have ₹9,400 more today."*

Uses only the person's own real historical data — an idle-cash balance that actually sat there, compared against an actual benchmark return over the actual period. Deterministic, no LLM. **Trigger conditions** (appears only when true, so it stays meaningful rather than routine):
- Idle cash has sat above the Efficiency-category threshold for 30+ days, or
- A holding just crossed the 12-month LTCG threshold (ties naturally into the Tax Lot Engine's "days to LTCG" tracking), or
- It's the first recap of a new month (a monthly-cadence fallback so the feature doesn't go quiet for people without an active trigger)

### 12.5 Generation logic (deterministic, matching Section 8's philosophy)
Same template-engine approach as the base plan's narrative insights — no LLM, no hallucination risk, every number traceable to a real aggregate:
1. Compute week-over-week deltas across all tracked metrics (spending by category, investment value, idle cash, score per category)
2. Rank by magnitude of change, normalized against that metric's own recent volatility — a ₹500 move in a usually-stable category matters more than ₹500 in a naturally noisy one
3. Slot the top positive delta into the Win card, the top negative/attention-worthy delta into the Attention card
4. Check Flashback trigger conditions; include or skip accordingly
5. Fill each card's template with real numbers — same SEBI-safe, informational-only language rules as Section 8 and the Tax Lot Engine's Section 9

### 12.6 Platform interaction
Already specified in Section 9.3a: swipe left/right between cards on Android (matching the format's own convention), click-through with on-screen chevrons or arrow keys on macOS, since there's no swipe gesture to borrow there.

### 12.7 Data dependencies
No new data sources — this card set reads entirely from Transactions, Investments, and the Health Score's four categories, all of which are already MVP-scope. The only new piece of logic is the ranking/selection step in 12.5.

### 12.8 Sequencing
This is **not** new scope — it's a presentation-layer extension of Track A's existing Phase 9–12 deliverable ("Health Score & Narrative Reports," per the base plan's timeline), not a separate build phase. The ranking logic in 12.5 is the only genuinely new work; everything else already had to be built for Section 8's insight cards regardless.
