/**
 * Renders the link-preview card, `public/og-image.jpg` (1200×630), in the
 * Zentra style: #F2F2F2 page, one #F8F8F8 card, the brand mark, the tracked
 * KHAZANA wordmark and the tagline in Anek Latin, and one blue data accent.
 *
 * Run from webapp/: `npm run og` (or `node scripts/gen-og-image.mjs [out.jpg]`). Not wired into
 * the build for the same reason as gen-icons.mjs — it writes a tracked binary.
 *
 * The text is converted to SVG outlines here, straight from the bundled TTFs.
 * Neither librsvg (no @font-face from a file) nor sharp's Pango text input
 * (the macOS build uses CoreText and ignores `fontfile`) would actually use
 * Anek Latin — both silently fall back to Helvetica. Outlines can't drift.
 * Only what this card needs is parsed: cmap format 4, hmtx, loca and simple
 * or composite glyf records. No kerning — the lines are short and tracked.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadFont } from './lib-ttf-outline.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEBAPP = resolve(HERE, '..');
const FONTS = join(WEBAPP, 'public', 'fonts');
const OUT = process.argv[2] ?? join(WEBAPP, 'public', 'og-image.jpg');

const W = 1200;
const H = 630;
const INK = '#111214';
const MUTED = '#6E6E73';
const BLUE = '#1C6FFB';

const font = (w) => loadFont(join(FONTS, `AnekLatin-${w}.ttf`));
const medium = font('Medium');
const light = font('Light');
const regular = font('Regular');

// ---------------------------------------------------------------- layout
const CARD = { x: 56, y: 56, w: W - 112, h: H - 112, r: 40 };
const MARK = 232;
const markX = CARD.x + 96;
const markY = Math.round((H - MARK) / 2);
const textX = markX + MARK + 72;

// Baselines, measured from the cap/x heights of Anek Latin at these sizes.
const WORD = 76; const TAG = 52; const SUB = 26;
const blockTop = 212;
const wordBase = blockTop + Math.round(WORD * 0.72);
const ruleY = wordBase + 30;
const tagBase = ruleY + 6 + 30 + Math.round(TAG * 0.72);
const subBase = tagBase + 46;

const word = medium.path('KHAZANA', textX, wordBase, WORD, 0.22);
const tag = light.path('Your wealth. Your vault.', textX - 2, tagBase, TAG);
const sub = regular.path('Private, offline-first money manager', textX, subBase, SUB);

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <filter id="s" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#111214" flood-opacity="0.10"/>
    </filter>
    <radialGradient id="glow" cx="100%" cy="0%" r="70%">
      <stop offset="0" stop-color="${BLUE}" stop-opacity="0.10"/>
      <stop offset="1" stop-color="${BLUE}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#F2F2F2"/>
  <rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.r}" fill="#F8F8F8" filter="url(#s)"/>
  <rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.r}" fill="url(#glow)"/>
  <rect x="${CARD.x + 0.5}" y="${CARD.y + 0.5}" width="${CARD.w - 1}" height="${CARD.h - 1}" rx="${CARD.r}" fill="none" stroke="#FFFFFF" stroke-opacity="0.9"/>
  <path d="${word.d}" fill="${INK}"/>
  <rect x="${textX + 2}" y="${ruleY}" width="56" height="6" rx="3" fill="${BLUE}"/>
  <path d="${tag.d}" fill="${INK}"/>
  <path d="${sub.d}" fill="${MUTED}"/>
</svg>`;

if (textX + Math.max(word.width, tag.width, sub.width) > CARD.x + CARD.w - 48) {
  throw new Error('text overflows the card');
}

const mark = await sharp(join(WEBAPP, 'public', 'khazana-mark.png'))
  .resize(MARK, MARK, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer();

await sharp(Buffer.from(svg), { density: 72 })
  .composite([{ input: mark, left: markX, top: markY }])
  .flatten({ background: '#F2F2F2' })
  .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: '4:4:4' })
  .toFile(OUT);

console.log(`wrote ${OUT}`);
