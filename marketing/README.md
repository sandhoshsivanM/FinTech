# Khazana brand image kit

Generates branded light and dark images of the real app, with sample data, for
LinkedIn, GitHub, X, Instagram and Open Graph.

```sh
cd webapp && npm run build     # only if the UI changed; captures use webapp/out
cd ../marketing && npm i && npx playwright install chromium
./run.sh                       # serve webapp/out → capture → compose
STAGE=compose ./run.sh         # re-compose only, from existing screens/
```

- `capture.mjs` creates a throwaway vault, loads **Settings → Load sample data**,
  and saves every screen in both themes to `screens/`. The Pro screens need a
  licence key. It reads the last line of `~/khazana-keys-pool.txt` by default,
  or the file in `LICENSE_KEY_FILE`. The key is never written anywhere.
- `compose.mjs` lays those screens out in `templates/kit.mjs` brand frames and
  writes `output/<format>/…png` at 2x. It also writes a PDF of each carousel for
  LinkedIn document posts.

| Format | Size (1x) | Variants |
|---|---|---|
| linkedin-post | 1200×627 | light, dark, split |
| linkedin-banner | 1584×396 | light, dark, split |
| carousel-light / carousel-dark | 1080×1350 × 8 + PDF | per theme |
| x-post | 1600×900 | light, dark, split |
| github-social-preview | 1280×640 | light, dark, split |
| github-readme-hero | 1280×640 | light, dark, split |
| open-graph | 1200×630 | light, dark, split |
| instagram-square | 1080×1080 | light, dark, split |
| story | 1080×1920 | light, dark, split |

The README images are a compressed subset in `docs/showcase/`.
