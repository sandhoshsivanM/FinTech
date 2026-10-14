/**
 * Google Play listing graphics, in the Zentra style, written to docs/play-store/:
 *   - icon-512.png            hi-res icon, 512x512, 32-bit PNG (RGBA)
 *   - feature-graphic.png     1024x500 feature graphic
 *
 * The phone screenshots in docs/play-store/phone/ are captured from the running
 * app (see docs/store-listing.md), not generated here.
 *
 * Run from webapp/: `npm run play-graphics`. Like gen-icons.mjs and
 * gen-og-image.mjs it writes tracked binaries, so it is not part of the build.
 * Text is rendered as outlines from the bundled Anek Latin TTFs (see
 * lib-ttf-outline.mjs).
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadFont } from './lib-ttf-outline.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEBAPP = resolve(HERE, '..');
const REPO = resolve(WEBAPP, '..');
const FONTS = join(WEBAPP, 'public', 'fonts');
const OUT = join(REPO, 'docs', 'play-store');
const MARK = join(REPO, 'assets', 'brand', 'khazana-mark.png');

const INK = '#111214';
const MUTED = '#6E6E73';
const BLUE = '#1C6FFB';

await mkdir(OUT, { recursive: true });

// ------------------------------------------------------------------ icon 512
// Same artwork and plating as the app icon (white plate, mark at 76%). Play
// applies its own rounded-corner mask to the hi-res icon, so the plate stays
// square and full-bleed. 32-bit PNG: RGBA, 8 bits per channel.
{
  const size = 512;
  const inner = Math.round(size * 0.76);
  const mark = await sharp(MARK).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: mark, gravity: 'centre' }])
    .ensureAlpha()
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, 'icon-512.png'));
}

// ------------------------------------------------------------ feature graphic
{
  const W = 1024;
  const H = 500;
  const medium = loadFont(join(FONTS, 'AnekLatin-Medium.ttf'));
  const light = loadFont(join(FONTS, 'AnekLatin-Light.ttf'));
  const regular = loadFont(join(FONTS, 'AnekLatin-Regular.ttf'));

  const CARD = { x: 40, y: 40, w: W - 80, h: H - 80, r: 36 };
  const MARK_SIZE = 220;
  const markX = CARD.x + 84;
  const markY = Math.round((H - MARK_SIZE) / 2);
  const textX = markX + MARK_SIZE + 64;

  const WORD = 68;
  const TAG = 44;
  const SUB = 23;
  const blockTop = 150;
  const wordBase = blockTop + Math.round(WORD * 0.72);
  const ruleY = wordBase + 26;
  const tagBase = ruleY + 6 + 26 + Math.round(TAG * 0.72);
  const subBase = tagBase + 42;

  const word = medium.path('KHAZANA', textX, wordBase, WORD, 0.22);
  const tag = light.path('Your wealth. Your vault.', textX - 2, tagBase, TAG);
  const sub = regular.path('Private, encrypted, offline money manager', textX, subBase, SUB);

  if (textX + Math.max(word.width, tag.width, sub.width) > CARD.x + CARD.w - 40) {
    throw new Error('feature graphic text overflows the card');
  }

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <filter id="s" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="${INK}" flood-opacity="0.10"/>
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
  <rect x="${textX + 2}" y="${ruleY}" width="52" height="6" rx="3" fill="${BLUE}"/>
  <path d="${tag.d}" fill="${INK}"/>
  <path d="${sub.d}" fill="${MUTED}"/>
</svg>`;

  const mark = await sharp(MARK)
    .resize(MARK_SIZE, MARK_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // Play wants a 24-bit PNG or JPEG for the feature graphic (no alpha).
  await sharp(Buffer.from(svg), { density: 72 })
    .composite([{ input: mark, left: markX, top: markY }])
    .flatten({ background: '#F2F2F2' })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, 'feature-graphic.png'));
}

console.log(`wrote icon-512.png and feature-graphic.png to ${OUT}`);
