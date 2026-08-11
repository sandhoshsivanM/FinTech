# Khazana — Product Design Hardening

### From "AI-built dashboard" → real financial software

This is a phase of the same weight as the v3 functional hardening, and it sits
alongside `Khazana_Implementation_Plan_v3_Hardening_Roadmap.pdf` rather than
under it. The functional plan makes every number **true**. This one makes the
product look like somebody **decided** it.

The goal is not beauty. A professional finance application should feel **quiet,
precise, trustworthy, consistent and intentional**. Flashy is the failure mode,
not the target.

---

## 0. The problem, stated precisely

No single pattern below is wrong. The failure is that they appear *together*,
and the product stops having a visual language of its own:

- generic green success / red expense colours everywhere
- rounded cards around everything
- generic outline icons, generic market icons
- repeated KPI card rows
- pill badges everywhere
- large empty card areas
- identical spacing on every screen
- decorative chart styling
- borders doing work that space should do
- `DEMO` indicators sitting inside production chrome

**Measured at the start of this phase:** 12 distinct corner radii in use across
the app and 46 separate `rounded-full` pills. That is the signature of software
that was assembled rather than designed.

### The identity to design toward

> **Khazana = private financial vault + modern wealth terminal**

Not: another green personal-finance dashboard.

| Attribute | Khazana |
|---|---|
| Personality | Premium, private, intelligent |
| Density | Medium/high |
| Corners | Small/moderate |
| Shadows | Very subtle |
| Borders | Thin and purposeful |
| Animation | Minimal |
| Icons | Technical/precise |
| Typography | Financial/editorial |
| Charts | Analytical |
| Colour | Muted + controlled |
| Cards | Used only when useful |
| Data | More important than decoration |

---

## 1. The governing rule

> **Do not introduce a UI component, icon, colour, spacing value, typography
> style, badge, card treatment, or interaction pattern unless it belongs to the
> Khazana Design System.**

> **No generic SaaS templates, AI-generated dashboard patterns, decorative
> gradients, excessive pills, excessive cards, or arbitrary icon substitutions.**

This is a development rule, not a preference. A new arbitrary value is a defect
in the same way an unbalanced ledger entry is a defect.

---

## 2. Colour — green must stop doing everything

Today green is the button, the positive value, the selected nav item, the
progress bar, the badge, the status dot, the market figure and the brand. A
colour that means nine things means nothing, and the numbers that actually
matter stop standing out.

### The separation

| Role | Colour |
|---|---|
| Primary / interaction | **Deep green** — buttons, active nav, focus |
| Positive value | Green |
| Negative value | Muted red |
| Ordinary financial information | **Near-black** |
| Secondary information | Grey |
| Identity | Gold — the mark and brand moments only, never a control |

The single most important line: **an ordinary number is black, not green.**
Colour is reserved for a number that has a sign worth noticing.

### Light — "Ledger"

```
Background        #F6F7F5      Primary text      #151815
Surface           #FFFFFF      Secondary text    #69716B
Surface elevated  #FBFCFA      Muted text        #929A94
Border            #E2E6E1
```

### Dark — "Vault"

Dark is a **separate palette**, not an inversion. Inverting light is the other
classic generated-UI tell: it produces grey text on grey panels with no depth.

```
App background    #0B0F0D      Primary text      #F1F4F1
Surface           #111713      Secondary text    #A5AEA8
Elevated surface  #161D18      Muted             #68736C
Border            #263029
```

### Brand and semantics

```
                  LIGHT        DARK
Khazana green     #176B4D      #3A8B68
Deep vault        #0D3B2E      #1B5A43
Gold              #C99A3D      #D5A94E

Positive          #19734D      lighter step
Negative          #B54444      lighter step
Warning           #A97824      lighter step
Info              #5966A8      lighter step
```

Semantic colours are used **sparingly**. If everything is coloured, nothing is.

---

## 3. Radius — collapse the scale

```
Buttons      7–8px
Inputs       7–8px
Cards        10–12px
Dialogs      12px
Badges       999px — only where a pill is genuinely right
```

Not everything is a pill. Twelve radii become four.

---

## 4. Stop putting everything in cards

The single biggest visual improvement available. The current composition is
classic generated-dashboard:

```
┌────────┐ ┌────────┐ ┌────────┐
│  KPI   │ │  KPI   │ │  KPI   │
└────────┘ └────────┘ └────────┘
┌─────────────────────────────────┐
│             Chart               │
└─────────────────────────────────┘
```

Use **sections** separated by rules and space:

```
NET WORTH

₹4,27,314.92
+₹18,230 this month

────────────────────────────────────────

Cash          Investments       Debt
₹42,731       ₹3,84,583         ₹0

────────────────────────────────────────

NET WORTH TREND
[               chart               ]
```

A card is for something that is genuinely a discrete object. It is not the
default container.

---

## 5. Typography and numbers

- **Inter** for the entire interface: navigation, tables, numbers, forms.
- An optional display serif **only** for brand moments — onboarding, empty
  states, one large dashboard statement. Never body copy, never tables.

Numbers are the product. They get special treatment:

```css
font-variant-numeric: tabular-nums;
```

so that `₹42,731.49`, `₹8,668.29` and `₹2,36,253.42` align on the decimal in a
column. Consistent decimal and sign rules everywhere:

```
₹42,731        +₹2,340        −₹1,280
```

This one detail carries more perceived professionalism than any amount of
styling.

---

## 6. Icons — one family, one weight, financial semantics

Every icon comes from **one family** (Lucide), at fixed sizes:

```
Sidebar / navigation   18px
Table                  16px
Inline                 14–16px
Primary action         16px
```

Same stroke width, same optical size, same weight. Never mix families, never
emoji. An icon goes inside a coloured rounded square **only** when it genuinely
needs emphasis — which is rarely.

Semantics should be financial, not generic SaaS:

```
Portfolio    → trend / holdings      Liabilities  → debt / obligation
Holdings     → layered assets        Insurance    → shield
Cash flow    → directional flow      Safety Net   → vault / shield
Budget       → allocation / ruler    Tax Centre   → document / calculation
                                     Reconcile    → balance
```

---

## 7. Tables are first-class

Portfolio and transaction data belong in tables, not in six giant cards with
colourful numbers.

| Asset | Qty | Avg cost | LTP | Value | P&L |
|---|--:|--:|--:|--:|--:|
| HDFC Bank | 20 | ₹1,642 | ₹1,731 | ₹34,620 | +₹1,780 |
| TCS | 5 | ₹3,412 | ₹3,521 | ₹17,605 | +₹545 |

Right-aligned numerics, tabular figures, thin rules, no zebra striping.

---

## 8. Charts should look analytical

Avoid: giant colourful bars, rounded chart elements, gradients, decorative
legends, heavy grids, many colours.

Use: thin lines, subtle grid, precise axis labels, a strong hover state, a
financial tooltip. **The data dominates; the chrome recedes.**

---

## 9. Periods — consistent, and appropriate to the concept

One global period vocabulary for money:

```
This month | Last month | 3M | 6M | 12M | Custom
```

Portfolio performance is a different time-series concept and keeps its own:

```
1D | 1W | 1M | 3M | 1Y | All
```

Knowing that these are *different* is what makes a product feel built by
someone who understands finance. The period control does not appear on every
screen — only where a period is genuinely a choice.

### A dedicated "This Month" experience

The daily home must not require choosing between 3M/6M/12M to understand the
current position:

```
THIS MONTH        August 2026 · 1–31 Aug

Income                 ₹82,400
Expenses               ₹36,220
Invested               ₹20,000
Remaining              ₹26,180
```

then income vs expense, top categories, upcoming, budget status.

---

## 10. Language — every label has a precise financial meaning

Generic phrasing is another place generated software exposes itself.
"Conditions met" is understandable but says nothing.

```
Alerts      Triggered · Active · Paused · Watching · Not triggered
Budget      Budget · Spent · Remaining · Available · Over budget
Portfolio   Invested · Current value · Unrealised P&L · Realised P&L ·
            Day change · Return
Cash flow   Income · Expenses · Transfers · Investments · Net cash flow
```

### Screen names

- `Score` → **Financial Health**
- `Safety Net` → keep; it is a genuinely strong Khazana-specific name
- `Alerts` → keep; clearer than a coined word for serious finance software
- `Reports`, `Markets` → keep

---

## 11. Brand language, propagated

The vault concept is strong and is currently confined to the logo. It should
reach the words:

| Generic | Khazana |
|---|---|
| No data found | **Your vault is empty** — "Import your first statement to start building your financial picture." |
| Export database | **Vault backup** |
| Encryption enabled | **Vault secured** — "Encrypted on this device" |

### Logo system

```
Primary logo   symbol + KHAZANA (+ tagline variant)
Symbol         vault / K monogram
Wordmark       KHAZANA
App icon       symbol only
```

- **Sidebar:** small symbol + `KHAZANA`, not a large decorative logo.
- **macOS / Windows / mobile icons:** symbol only — the OS supplies the name.
- **Lock screen:** the strongest brand moment in the product, and the most
  restrained.

---

## 12. Remove demo indicators from production chrome

A `DEMO` badge inside the market widget tells the user this is a prototype.
Demo data, where it exists, is an **application state** surfaced once — not a
badge sprinkled through the interface.

---

## 13. Desktop is a desktop application

The macOS build must not feel like a web page in a Mac window:

native window spacing · keyboard shortcuts · command palette · proper menus ·
resizable tables · compact sidebar · hover states · tooltips · keyboard
navigation · ⌘K, ⌘N, ⌘F.

---

## 14. Component system

Every screen composes from one library, so a button on Budget cannot differ
from a button on Reports:

```
/design-system   colours · typography · spacing · elevation · radius · icons

/components      Button · Input · Select · MoneyInput · MoneyValue ·
                 DateRange · StatusBadge · Metric · DataTable · EmptyState ·
                 PageHeader · SectionHeader · Chart · ConfirmDialog ·
                 CommandPalette
```

### Tokens

```ts
spacing  xs 4 · sm 8 · md 12 · lg 16 · xl 24 · 2xl 32 · 3xl 48
radius   sm 6 · md 8 · lg 12
control  sm 32 · md 36 · lg 40
```

Arbitrary values outside these are not permitted.

---

## 15. Navigation reflects the user's mental model

Not one menu item per feature because the feature exists.

```
OVERVIEW   Dashboard · Financial Health · Reports
INVEST     Portfolio · Holdings · Watchlist · Markets · Dividends · Tax
MONEY      Accounts · Transactions · Budget · Recurring · Goals
PROTECT    Liabilities · Insurance · Safety Net
TOOLS      Import · Reconcile · Alerts · Diagnostics
           Settings
```

---

## Phase order

```
1  Design system            8  Budget + cash flow
2  Typography + icons       9  Portfolio + markets
3  Light theme             10  Reports + Financial Health
4  Dark theme              11  Alerts + Safety Net
5  Navigation + layout     12  macOS / Windows / web polish
6  Dashboard               13  Accessibility + keyboard + responsive
7  Transactions + accounts 14  Full regression
```

---

## Where this phase started

| Dimension | Score |
|---|---|
| Engineering / product foundation | 8.5 / 10 |
| Feature breadth | 8.5 / 10 |
| Financial domain ambition | 9 / 10 |
| UI/UX maturity | 6.5–7 / 10 |
| Brand identity | 6 / 10 |
| Potential after hardening | 9+ / 10 |

---

## The one sentence to hold on to

**Do not make Khazana more beautiful. Make it more intentional.** Every icon,
colour, label, spacing value, chart, number format, interaction and empty state
should look like it came from one product team with a strong financial-software
design system.
