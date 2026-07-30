# Distributing Khazana (web app)

The app is a **fully static, offline, local-only** build — no server, no cloud.
`npm run build` emits portable files into `out/` (plain HTML/JS/CSS, plus the
PWA `manifest.webmanifest`, `sw.js`, and `icon.svg`). All data stays in the
browser's IndexedDB, encrypted with your PIN.

## 1. Run / host the static build

```bash
npm run build          # produces ./out
npm run serve          # serves ./out at http://localhost:3200 (uses `serve`)
# offline alternative (no download):
python3 -m http.server 3200 --directory out
```

You can drop `out/` on any static host (Netlify, GitHub Pages, an internal
file server, a USB stick + local server) — it needs no backend.

## 2. Install as an app (PWA)

Open the served URL in a **Chromium browser** (Chrome/Edge/Brave) → address-bar
**Install** icon → it gets its own window + icon and works offline (the service
worker caches the shell). The service worker activates in production builds
only, not in `npm run dev`.

> Firefox does not support PWA install. It still works offline via the service
> worker, but for an installed icon use Chrome, or the desktop wrapper below.

## 3. Desktop app (Tauri) — one-time setup

Tauri wraps the static `out/` into a tiny native app (Mac/Windows/Linux). It
needs the **Rust toolchain** (not currently installed on this machine).

```bash
# 1. Install Rust (one time): https://rustup.rs
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Add the Tauri CLI to this project
npm install -D @tauri-apps/cli

# 3. Initialise Tauri, pointing it at the static export
npx tauri init \
  --app-name "Khazana" \
  --frontend-dist ../out \
  --dev-url http://localhost:3100 \
  --before-dev-command "npm run dev" \
  --before-build-command "npm run build"

# 4. Build the installable desktop app
npx tauri build      # outputs a .app/.dmg (macOS) or .exe/.msi (Windows)
```

After `tauri init`, replace the generated `src-tauri/icons` with real icons
(`npx tauri icon ./public/icon.svg` generates all sizes from the app icon).

## Notes
- `npm run dev` still works for development (hot reload).
- Because the build is a static export, there is no `next start`; serve `out/`.
