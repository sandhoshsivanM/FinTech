/**
 * Stage 2 — compose raw screens into branded marketing images.
 *
 * Every layout is a sized HTML page built from templates/kit.mjs, rendered by
 * Playwright at 2x. Output: output/<format>/khazana-<format>-<variant>.png,
 * plus a PDF of each carousel (LinkedIn posts carousels as documents).
 *
 * Variants: light, dark, and split (light screen with a dark diagonal half).
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { page, frame, lockup, pills, TAGLINE, SITE } from './templates/kit.mjs';

const OUT = resolve(import.meta.dirname, 'output');
const BUILD = resolve(OUT, '.build');
const SCALE = 2;
const SCREEN_RATIO = 900 / 1440;
const BAR = 34;
/** Frame height that shows a full 1440×900 screen at width w. */
const fh = (w) => Math.round(w * SCREEN_RATIO + BAR);
/** Crop that drops the sidebar (≈17% of the screen width). */
const noRail = (w) => ({ zoom: 1.21, offsetX: Math.round(w * 1.21 * 0.172) });

/** Dashboard: start below the page header so the net-worth chart is in view. */
const dash = (w) => ({ tall: true, offsetY: Math.round(270 * w / 1440) });

const SUB = 'Net worth, portfolio, budgets and forecasts — encrypted on your device. No server. No tracking.';
const TILT_R = 'perspective(2400px) rotateY(-13deg) rotateX(5deg) rotateZ(1.5deg)';
const TILT_L = 'perspective(2400px) rotateY(11deg) rotateX(5deg) rotateZ(-1.5deg)';

const jobs = [];
const add = (format, variant, w, h, html) => jobs.push({ format, variant, w, h, html });
const variants = (fn, withSplit = true) =>
  [['light', false], ['dark', false], ...(withSplit ? [['dark', true]] : [])]
    .map(([theme, split]) => ({ theme, split, variant: split ? 'split' : theme }));

// ── Landscape hero: text left, layered frames right ─────────────────────────
function landscape({ w, h, theme, split }) {
  const pad = Math.round(h * 0.1);
  const fw = Math.round(w * 0.64);
  return page({ w, h, theme, body: `
    <div style="position:absolute;left:${pad}px;top:0;bottom:0;width:${w * 0.4}px;display:flex;flex-direction:column;justify-content:center;gap:${h * 0.034}px;z-index:10">
      ${lockup(Math.round(h * 0.03))}
      <div class="eyebrow" style="font-size:${h * 0.021}px">Private wealth · Offline first</div>
      <div class="h" style="font-size:${h * 0.108}px">Your wealth.<br><em>Your vault.</em></div>
      <div class="sub" style="font-size:${h * 0.029}px;max-width:94%">${SUB}</div>
      ${pills(Math.round(h * 0.021))}
    </div>
    ${frame({ name: 'portfolio', theme: split ? 'dark' : theme, route: '/investments', x: w * 0.5, y: h * 0.07, w: fw, h: fh(fw), transform: TILT_R, z: 1, extra: 'opacity:.9' })}
    ${frame({ name: 'dashboard', theme, split, route: '/dashboard', x: w * 0.43, y: h * 0.25, w: fw, h: fh(fw), transform: TILT_R, z: 2, ...dash(fw) })}
  ` });
}

// ── Centered: headline top, big frame bleeding off the bottom ───────────────
function centered({ w, h, theme, split, layered = false }) {
  const fw = Math.round(w * 0.74);
  const side = Math.round(w * 0.42);
  return page({ w, h, theme, body: `
    <div style="position:absolute;top:${h * 0.075}px;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:${h * 0.028}px;text-align:center;z-index:10">
      ${lockup(Math.round(h * 0.03))}
      <div class="h" style="font-size:${h * 0.085}px">Your wealth. <em>Your vault.</em></div>
      <div class="sub" style="font-size:${h * 0.027}px;max-width:${w * 0.62}px">${SUB}</div>
      ${pills(Math.round(h * 0.02))}
    </div>
    ${layered ? `
      ${frame({ name: 'portfolio', theme: split ? 'light' : theme, route: '/investments', x: w * 0.02, y: h * 0.56, w: side, h: fh(side), transform: TILT_L, z: 1 })}
      ${frame({ name: 'analytics', theme: split ? 'dark' : theme, route: '/analytics', x: w - side - w * 0.02, y: h * 0.56, w: side, h: fh(side), transform: TILT_R, z: 1 })}` : ''}
    ${frame({ name: 'dashboard', theme, split, route: '/dashboard', x: (w - fw) / 2, y: h * 0.47, w: fw, h: fh(fw), z: 2, ...dash(fw) })}
  ` });
}

for (const v of variants()) {
  add('linkedin-post', v.variant, 1200, 627, landscape({ w: 1200, h: 627, ...v }));
  add('x-post', v.variant, 1600, 900, landscape({ w: 1600, h: 900, ...v }));
  add('github-social-preview', v.variant, 1280, 640, landscape({ w: 1280, h: 640, ...v }));
  add('open-graph', v.variant, 1200, 630, centered({ w: 1200, h: 630, ...v }));
  add('github-readme-hero', v.variant, 1280, 640, centered({ w: 1280, h: 640, layered: true, ...v }));
}

// ── LinkedIn profile banner 1584×396 ────────────────────────────────────────
// The avatar covers roughly the left 400px on desktop, so text starts past it.
for (const v of variants()) {
  const { theme, split } = v;
  const fw = 500;
  add('linkedin-banner', v.variant, 1584, 396, page({ w: 1584, h: 396, theme, body: `
    <div style="position:absolute;left:430px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:14px;z-index:10">
      ${lockup(15)}
      <div class="h" style="font-size:40px">Your wealth. <em>Your vault.</em></div>
      <div class="sub" style="font-size:15px;max-width:440px">Private, offline-first personal finance. Encrypted on your device.</div>
      ${pills(12)}
    </div>
    ${frame({ name: 'portfolio', theme: split ? 'light' : theme, route: '/investments', x: 1000, y: 70, w: fw, h: fh(fw), transform: TILT_R, z: 1 })}
    ${frame({ name: 'dashboard', theme, split, route: '/dashboard', x: 1150, y: 130, w: fw, h: fh(fw), transform: TILT_R, z: 2, ...dash(fw) })}
  ` }));
}

// ── Instagram square 1080×1080 ──────────────────────────────────────────────
for (const v of variants()) {
  const { theme, split } = v;
  const fw = 1180;
  add('instagram-square', v.variant, 1080, 1080, page({ w: 1080, h: 1080, theme, body: `
    <div style="position:absolute;left:84px;top:84px;right:84px;display:flex;flex-direction:column;gap:26px;z-index:10">
      ${lockup(28)}
      <div class="h" style="font-size:96px">Your wealth.<br><em>Your vault.</em></div>
      <div class="sub" style="font-size:26px;max-width:760px">${SUB}</div>
    </div>
    ${frame({ name: 'dashboard', theme, split, route: '/dashboard', x: 84, y: 590, w: fw, h: fh(fw), z: 2, ...dash(fw) })}
  ` }));
}

// ── Story / Reels 1080×1920 (safe zone: 250 top, 340 bottom) ────────────────
for (const v of variants()) {
  const { theme, split } = v;
  const fw = 940;
  const f = (name, route, y, x, tf, z, th = theme, sp = false) =>
    frame({ name, route, theme: th, split: sp, x, y, w: fw, h: fh(fw), transform: tf, z,
      ...(name === 'dashboard' ? dash(fw) : {}) });
  add('story', v.variant, 1080, 1920, page({ w: 1080, h: 1920, theme, body: `
    <div style="position:absolute;left:80px;right:80px;top:260px;display:flex;flex-direction:column;gap:28px;z-index:10">
      ${lockup(30)}
      <div class="h" style="font-size:112px">Your wealth.<br><em>Your vault.</em></div>
      <div class="sub" style="font-size:30px">${SUB}</div>
      ${pills(22)}
    </div>
    ${f('analytics', '/analytics', 900, 190, TILT_R, 1, split ? 'dark' : theme)}
    ${f('portfolio', '/investments', 1110, -40, TILT_L, 2, split ? 'light' : theme)}
    ${f('dashboard', '/dashboard', 1320, 160, TILT_R, 3, theme, split)}
  ` }));
}

// ── Carousel 1080×1350 × 8 (LinkedIn document / Instagram) ──────────────────
const SLIDES = [
  { kind: 'cover' },
  { eyebrow: 'Dashboard', h: 'Net worth, <em>at a glance.</em>', cap: 'What you own minus what you owe — every account, holding and loan rolled into one number, with the trend behind it.', shots: [['dashboard', '/dashboard', 0]] },
  { eyebrow: 'Portfolio', h: 'All your investments <em>in one view.</em>', cap: 'Stocks, ETFs, debt funds, gold and NPS — value, cost and allocation side by side.', shots: [['portfolio', '/investments', 0]] },
  { eyebrow: 'Financial health', h: 'One score. <em>Four areas behind it.</em>', cap: 'See what is strong, what needs work, and how the score has moved over time.', shots: [['score', '/score', 0]] },
  { eyebrow: 'Safety net', h: 'Know you are <em>covered.</em>', cap: 'Emergency fund, insurance cover and safe & retirement assets, in one place.', shots: [['safety-net', '/safety-net', 0]] },
  { eyebrow: 'Analytics & forecast', h: 'How it is built. <em>Where it is going.</em>', cap: 'Diversification, concentration and return quality — plus projections from your own records.', shots: [['analytics', '/analytics', 0], ['forecast', '/forecast', 1]] },
  { eyebrow: 'Holdings & budget', h: 'Every holding. <em>Every rupee.</em>', cap: 'Positions with market value and unrealised P&L, and 50/30/20 budgets that alert before you overspend.', shots: [['holdings', '/holdings', 0], ['budget', '/budget', 1]] },
  { kind: 'close' },
];

function slide(s, i, theme) {
  const n = String(i + 1).padStart(2, '0');
  const top = `<div style="position:absolute;left:80px;right:80px;top:64px;display:flex;justify-content:space-between;align-items:center;z-index:10">
      ${lockup(22)}<span class="eyebrow" style="font-size:18px;color:var(--muted)">${n} / ${String(SLIDES.length).padStart(2, '0')}</span></div>`;
  if (s.kind === 'cover') {
    const fw = 1100;
    return page({ w: 1080, h: 1350, theme, body: `${top}
      <div style="position:absolute;left:80px;right:80px;top:200px;display:flex;flex-direction:column;gap:30px;z-index:10">
        <div class="eyebrow" style="font-size:20px">Introducing Khazana</div>
        <div class="h" style="font-size:112px">Your wealth.<br><em>Your vault.</em></div>
        <div class="sub" style="font-size:30px">${SUB}</div>
      </div>
      ${frame({ name: 'dashboard', theme: 'dark', split: true, route: '/dashboard', x: 80, y: 760, w: fw, h: fh(fw), z: 2, ...dash(fw) })}
      <div style="position:absolute;right:80px;bottom:56px;font-size:20px;font-weight:600;color:var(--muted);z-index:10">Swipe →</div>` });
  }
  if (s.kind === 'close') {
    const card = (t, d) => `<div style="padding:34px 36px;border-radius:22px;border:1px solid var(--line);background:var(--pill);backdrop-filter:blur(10px)">
        <div style="display:flex;align-items:center;gap:14px;font-size:34px;font-weight:700;letter-spacing:-.02em"><i style="width:14px;height:14px;border-radius:50%;background:var(--accent)"></i>${t}</div>
        <div class="sub" style="font-size:24px;margin-top:10px">${d}</div></div>`;
    return page({ w: 1080, h: 1350, theme, body: `${top}
      <div style="position:absolute;left:80px;right:80px;top:210px;display:flex;flex-direction:column;gap:26px;z-index:10">
        <div class="eyebrow" style="font-size:20px">Private by design</div>
        <div class="h" style="font-size:92px">Your data never <em>leaves the vault.</em></div>
        <div style="display:flex;flex-direction:column;gap:18px;margin-top:22px">
          ${card('100% private', 'No server. No tracking. No account to sign up for.')}
          ${card('Encrypted', 'AES-256 at rest. Your PIN never leaves the device.')}
          ${card('Offline first', 'Works everywhere. No internet required.')}
        </div>
        <div style="margin-top:28px;display:flex;align-items:center;gap:18px">
          <span class="pill" style="font-size:26px;padding:16px 28px;background:var(--accent);color:#fff;border-color:transparent">Try it → ${SITE}</span>
        </div>
      </div>` });
  }
  const shots = s.shots.map(([name, route, k]) => {
    const fw = s.shots.length === 1 ? 1180 : 1000;
    const y = s.shots.length === 1 ? 560 : 540 + k * 300;
    const x = s.shots.length === 1 ? 80 : 80 + k * 120;
    return frame({ name, route, theme, tall: true, x, y, w: fw, h: 1100, z: k + 1, ...noRail(fw) });
  }).join('');
  return page({ w: 1080, h: 1350, theme, body: `${top}
    <div style="position:absolute;left:80px;right:80px;top:180px;display:flex;flex-direction:column;gap:24px;z-index:10">
      <div class="eyebrow" style="font-size:20px">${s.eyebrow}</div>
      <div class="h" style="font-size:68px">${s.h}</div>
      <div class="sub" style="font-size:28px">${s.cap}</div>
    </div>${shots}` });
}

for (const theme of ['light', 'dark']) {
  SLIDES.forEach((s, i) => {
    const name = s.kind ?? s.shots[0][0];
    add(`carousel-${theme}`, `${String(i + 1).padStart(2, '0')}-${name}`, 1080, 1350, slide(s, i, theme));
  });
}

// ── Render ──────────────────────────────────────────────────────────────────
const only = process.argv[2]; // optional: render one format, e.g. `node compose.mjs story`
await mkdir(BUILD, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: SCALE });
const tab = await ctx.newPage();
const done = {};

for (const j of jobs) {
  if (only && j.format !== only) continue;
  const html = resolve(BUILD, `${j.format}-${j.variant}.html`);
  await writeFile(html, j.html);
  await tab.setViewportSize({ width: j.w, height: j.h });
  await tab.goto(pathToFileURL(html).href);
  await tab.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
  });
  const dir = resolve(OUT, j.format);
  await mkdir(dir, { recursive: true });
  const file = resolve(dir, `khazana-${j.format}-${j.variant}.png`);
  await tab.screenshot({ path: file });
  (done[j.format] ??= []).push(file);
  console.log(`  ${j.format}/${j.variant}  ${j.w * SCALE}×${j.h * SCALE}`);
}

// Carousel PDFs: one page per slide, for LinkedIn document posts.
for (const theme of ['light', 'dark']) {
  const files = done[`carousel-${theme}`];
  if (!files) continue;
  const html = resolve(BUILD, `carousel-${theme}.html`);
  await writeFile(html, `<!doctype html><html><head><style>
    @page{size:1080px 1350px;margin:0}*{margin:0}img{display:block;width:1080px;height:1350px;page-break-after:always}
    </style></head><body>${files.map((f) => `<img src="${pathToFileURL(f).href}">`).join('')}</body></html>`);
  await tab.goto(pathToFileURL(html).href);
  await tab.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  await tab.pdf({ path: resolve(OUT, `carousel-${theme}`, `khazana-carousel-${theme}.pdf`), width: '1080px', height: '1350px', printBackground: true });
  console.log(`  carousel-${theme}.pdf`);
}

await browser.close();
