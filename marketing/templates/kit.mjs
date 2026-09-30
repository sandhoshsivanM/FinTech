/**
 * Shared brand pieces for every composition: tokens, backdrop, lockup,
 * browser frame, trust pills. Each layout in compose.mjs is built from these,
 * so all formats read as one family.
 *
 * Colours come from the app (webapp/src/app/globals.css: canvas #F6F7F5 /
 * #0B0F0D, accent #176B4D) plus the gold of the supplied mark.
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const url = (p) => pathToFileURL(resolve(ROOT, p)).href;

export const MARK = url('assets/brand/khazana-mark.png');
export const screen = (theme, name) => url(`marketing/screens/${theme}/${name}.png`);

// From webapp/src/lib/brand.ts — kept literal so this kit has no TS build step.
export const TAGLINE = 'Your wealth. Your vault.';
export const TRUST = ['100% private', 'AES-256 encrypted', 'Offline first'];
export const SITE = 'khazana-app.netlify.app';

const TOKENS = {
  light: {
    bg: '#F4F4EF', ink: '#0D1A14', muted: '#56635C', accent: '#176B4D',
    gold: '#A87A22', line: 'rgba(13,26,20,0.10)', pill: 'rgba(255,255,255,0.72)',
    glowA: 'rgba(23,107,77,0.20)', glowB: 'rgba(212,166,74,0.22)',
    grid: 'rgba(13,26,20,0.045)', chrome: '#ECEDE8', chromeInk: '#7A857F',
    shadow: '0 40px 80px -20px rgba(13,40,28,0.28), 0 12px 28px -8px rgba(13,40,28,0.18)',
  },
  dark: {
    bg: '#070B09', ink: '#EEF3EF', muted: '#93A199', accent: '#3FBF8A',
    gold: '#E2B659', line: 'rgba(238,243,239,0.10)', pill: 'rgba(255,255,255,0.05)',
    glowA: 'rgba(40,160,110,0.26)', glowB: 'rgba(226,182,89,0.14)',
    grid: 'rgba(238,243,239,0.035)', chrome: '#161D19', chromeInk: '#6F7D75',
    shadow: '0 40px 90px -20px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.06)',
  },
};

const FONT = (w, f) =>
  `@font-face{font-family:Inter;font-weight:${w};src:url(${url(`assets/fonts/Inter-${f}.ttf`)});}`;

const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.09 0"/></filter><rect width="200" height="200" filter="url(#n)"/></svg>',
)}")`;

/** Full HTML document for one canvas. `theme` is the canvas theme. */
export function page({ w, h, theme, body, css = '' }) {
  const t = TOKENS[theme];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT(400, 'Regular')}${FONT(500, 'Medium')}${FONT(600, 'SemiBold')}${FONT(700, 'Bold')}
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:${t.bg};--ink:${t.ink};--muted:${t.muted};--accent:${t.accent};--gold:${t.gold};
  --line:${t.line};--pill:${t.pill};}
html,body{width:${w}px;height:${h}px;overflow:hidden}
body{font-family:Inter,system-ui,sans-serif;color:var(--ink);background:var(--bg);position:relative;
  -webkit-font-smoothing:antialiased;font-feature-settings:"ss01","cv11"}
.bg{position:absolute;inset:0;pointer-events:none;
  background:
    radial-gradient(60% 70% at 88% 18%, ${t.glowA}, transparent 70%),
    radial-gradient(50% 60% at 8% 100%, ${t.glowB}, transparent 70%),
    linear-gradient(${t.grid} 1px, transparent 1px) 0 0/48px 48px,
    linear-gradient(90deg, ${t.grid} 1px, transparent 1px) 0 0/48px 48px;
  -webkit-mask-image:radial-gradient(120% 120% at 50% 40%, #000 55%, transparent 100%)}
.grain{position:absolute;inset:0;background:${GRAIN};opacity:.55;mix-blend-mode:${theme === 'dark' ? 'screen' : 'multiply'};pointer-events:none;z-index:50}
.lockup{display:flex;align-items:center;gap:.5em}
.lockup img{width:1.9em;height:1.9em;filter:drop-shadow(0 4px 10px rgba(0,0,0,.25))}
.lockup span{font-weight:700;letter-spacing:.24em;text-transform:uppercase}
.eyebrow{font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--gold)}
.h{font-weight:700;letter-spacing:-.035em;line-height:1.02}
.h em{font-style:normal;color:var(--accent)}
.sub{color:var(--muted);line-height:1.45;font-weight:500;text-wrap:pretty}
.h{text-wrap:balance}
.pills{display:flex;flex-wrap:wrap;gap:.5em}
.pill{display:inline-flex;align-items:center;gap:.45em;padding:.5em .9em;border-radius:999px;
  border:1px solid var(--line);background:var(--pill);font-weight:600;backdrop-filter:blur(8px);white-space:nowrap}
.pill i{width:.5em;height:.5em;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 22%,transparent)}
.frame{position:absolute;border-radius:14px;overflow:hidden}
.frame .bar{display:flex;align-items:center;gap:7px;padding:0 14px;height:34px}
.frame .bar b{width:11px;height:11px;border-radius:50%}
.frame .url{margin:0 auto;padding:4px 14px;border-radius:7px;font-size:11.5px;font-weight:500;min-width:40%;text-align:center}
.frame .shot{position:relative;overflow:hidden}
.frame .shot img{display:block;width:100%;position:absolute;top:0;left:0}
${css}
</style></head><body><div class="bg"></div>${body}<div class="grain"></div></body></html>`;
}

/**
 * macOS-style browser window around a real screen.
 * `theme` picks the screenshot + chrome; `split` overlays the dark screen on
 * the right of a clean diagonal cut — the light/dark signature.
 */
export function frame({ name, theme = 'light', split = false, x, y, w, h, route = '/dashboard',
  z = 1, transform = '', tall = false, offsetY = 0, offsetX = 0, zoom = 1, extra = '' }) {
  const chromeTheme = split ? 'light' : theme;
  const t = TOKENS[chromeTheme];
  const file = tall ? `${name}-tall` : name;
  const barH = 34;
  const shotH = h - barH;
  const img = (th) => `<img src="${screen(th, file)}" style="top:${-offsetY}px;left:${-offsetX}px;width:${zoom * 100}%">`;
  const darkChrome = TOKENS.dark;
  const splitLayer = split ? `
    <div style="position:absolute;inset:0;clip-path:polygon(58% 0,100% 0,100% 100%,42% 100%)">
      <div class="bar" style="background:${darkChrome.chrome}">
        <b style="background:#FF5F57"></b><b style="background:#FEBC2E"></b><b style="background:#28C840"></b>
        <div class="url" style="background:rgba(255,255,255,.06);color:${darkChrome.chromeInk}">🔒 ${SITE}${route}</div>
      </div>
      <div class="shot" style="height:${shotH}px">${img('dark')}</div>
    </div>` : '';
  return `<div class="frame" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;z-index:${z};
      box-shadow:${TOKENS[theme].shadow};transform:${transform};transform-origin:center;${extra}">
    <div class="bar" style="background:${t.chrome}">
      <b style="background:#FF5F57"></b><b style="background:#FEBC2E"></b><b style="background:#28C840"></b>
      <div class="url" style="background:${chromeTheme === 'dark' ? 'rgba(255,255,255,.06)' : '#fff'};color:${t.chromeInk}">🔒 ${SITE}${route}</div>
    </div>
    <div class="shot" style="height:${shotH}px">${img(split ? 'light' : theme)}</div>
    ${splitLayer}
  </div>`;
}

export const lockup = (size) =>
  `<div class="lockup" style="font-size:${size}px"><img src="${MARK}"><span>Khazana</span></div>`;

export const pills = (size, items = TRUST) =>
  `<div class="pills" style="font-size:${size}px">${items.map((p) => `<span class="pill"><i></i>${p}</span>`).join('')}</div>`;
