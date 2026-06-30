# Khazana — Web app

The Next.js / React client for Khazana. Offline-first, fully client-side, and
the logic twin of the Flutter app. See the repo root
[README](../README.md), [ARCHITECTURE](../docs/ARCHITECTURE.md), and
[THREAT-MODEL](../docs/THREAT-MODEL.md) for the full picture.

## Stack

- **Next.js 16** (App Router, `output: 'export'` — static, no Node server)
- **React 19** + TypeScript (strict)
- **Zustand** single store (`src/lib/store.ts`) — vault lifecycle + entities
- **Dexie / IndexedDB** persistence of **encrypted** record blobs
- **Web Crypto** AES-256-GCM + PBKDF2 (`src/lib/crypto.ts`)
- **Tailwind CSS v4**, hand-built chart primitives (donut / ring / sparkline)
- **Tauri 2** optional desktop shell (`src-tauri/`)

## Layout

| Path | What |
|---|---|
| `src/domain/` | Framework-free financial logic (TS port of the Dart `lib/domain`) |
| `src/lib/` | `crypto.ts`, `store.ts`, Dexie wiring, money/`Decimal`, types |
| `src/app/` | App-Router routes (`dashboard`, `transactions`, `insurance`, `safety-net`, …) |
| `src/components/` | `Shell`, `VaultGate`, `Tour`, `AutoLock`, and the `ui.tsx` primitive kit |
| `scripts/` | `bench-crypto.ts`, tests |

## Scripts

```bash
npm run dev        # dev server
npm run build      # static export → out/
npm run serve      # serve the built out/ locally
npm run test       # Vitest: run all tests once
npm run test:watch # Vitest watch mode
npm run test:cov   # Vitest with v8 coverage
npm run lint       # eslint (see note below)
```

## Testing

Tests run on **Vitest** (jsdom). Coverage today:

- **Domain unit tests** — `src/domain/*.test.ts` (safety net, insurance, finance,
  sync-merge). Pure functions, fast.
- **Component test (RTL)** — `src/app/safety-net/page.test.tsx` seeds the real
  Zustand store and renders the page, proving the React Testing Library path.

```bash
npm run test
```

> **Lint note:** the codebase carries pre-existing `react-hooks/purity` findings
> (e.g. `Date.now()` called in render) under Next 16's ruleset. These predate the
> test/CI work and are tracked as cleanup. CI runs `npm run lint` as **advisory**
> (non-blocking); `npm run test` and `npm run build` are the hard gates.

> ⚠️ This is not the Next.js in your training data — read the guides under
> `node_modules/next/dist/docs/` before changing build/router/config code.
