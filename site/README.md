# The Khazana marketing site

Hand-written static HTML. No build step, no dependencies, no framework — so
publishing a change is editing a file and running one command.

```
netlify deploy --prod --dir=site
```

## Two things are generated and NOT in git

A fresh clone is missing both, and deploying without them ships a page with
dead links. Regenerate before every deploy:

| Path | Produced by | Why it is not committed |
|---|---|---|
| `site/case-study/` | `./docs/case-study/build.sh` | A stale copy would publish the private appendices that script exists to strip |
| `site/downloads/*.dmg` | `cd webapp && npx tauri build` | 6 MB per release; git would carry every past build forever |

Staging the desktop build:

```bash
cd webapp && npx tauri build
cp src-tauri/target/release/bundle/dmg/Khazana_1.0.0_aarch64.dmg \
   ../site/downloads/Khazana-1.0.0-arm64.dmg
```

**When you bump the version, three things must change together:** the filename
above, the `href` on the download button in `index.html`, and the version, size
and SHA-256 printed beside it. There is no build step to keep them in step, so
they are checked by hand — a download link pointing at a file that no longer
exists is a 404 on the page that is supposed to close the sale.

Recompute the hash with:

```bash
shasum -a 256 site/downloads/Khazana-1.0.0-arm64.dmg
```

## The download is unsigned, and the page says so

The DMG is ad-hoc signed (`Signature=adhoc`, no Team ID), so Gatekeeper refuses
it on first open. The page explains this and gives the right-click → Open
workaround rather than letting it ambush the user.

Signing and notarising needs a paid Apple Developer account. Until then this is
acceptable for a free download and **is a blocker for selling the desktop build**
— `docs/RELEASE-CHECKLIST.md` calls an unsigned installer fatal to conversion on
a paid download, and that judgement stands.

## What belongs where

- `index.html` — sells to a **buyer**. Never link a defect log from here.
- `case-study/` — explains the build to an **engineer**.

One page cannot serve both audiences; they want opposite things.
