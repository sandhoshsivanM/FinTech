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
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEBAPP = resolve(HERE, '..');
const FONTS = join(WEBAPP, 'public', 'fonts');
const OUT = process.argv[2] ?? join(WEBAPP, 'public', 'og-image.jpg');

const W = 1200;
const H = 630;
const INK = '#111214';
const MUTED = '#6E6E73';
const BLUE = '#1C6FFB';

// ---------------------------------------------------------------- TTF -> path
function loadFont(file) {
  const b = readFileSync(file);
  const u16 = (o) => b.readUInt16BE(o);
  const i16 = (o) => b.readInt16BE(o);
  const u32 = (o) => b.readUInt32BE(o);
  const tables = {};
  for (let i = 0, n = u16(4); i < n; i++) {
    const r = 12 + 16 * i;
    tables[b.toString('latin1', r, r + 4)] = u32(r + 8);
  }
  const unitsPerEm = u16(tables.head + 18);
  const longLoca = i16(tables.head + 50) === 1;
  const ascender = i16(tables.hhea + 4);
  const numHMetrics = u16(tables.hhea + 34);
  const advance = (g) => u16(tables.hmtx + 4 * Math.min(g, numHMetrics - 1));
  const loca = (g) => (longLoca ? u32(tables.loca + 4 * g) : u16(tables.loca + 2 * g) * 2);

  // cmap: first format-4 subtable (Unicode BMP).
  let cmap4 = null;
  for (let i = 0, n = u16(tables.cmap + 2); i < n; i++) {
    const off = tables.cmap + u32(tables.cmap + 4 + 8 * i + 4);
    if (u16(off) === 4) { cmap4 = off; break; }
  }
  if (cmap4 === null) throw new Error(`${file}: no cmap format 4`);
  const segX2 = u16(cmap4 + 6);
  const ends = cmap4 + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  const glyphOf = (cp) => {
    for (let s = 0; s < segX2; s += 2) {
      if (cp > u16(ends + s)) continue;
      if (cp < u16(starts + s)) return 0;
      const ro = u16(ranges + s);
      if (ro === 0) return (cp + i16(deltas + s)) & 0xffff;
      const g = u16(ranges + s + ro + 2 * (cp - u16(starts + s)));
      return g === 0 ? 0 : (g + i16(deltas + s)) & 0xffff;
    }
    return 0;
  };

  /** Contours of glyph g as arrays of {x, y, on}. */
  function contours(g, dx = 0, dy = 0) {
    const start = tables.glyf + loca(g);
    if (loca(g + 1) === loca(g)) return [];
    const nc = i16(start);
    if (nc < 0) {
      // Composite: offsets only (ARGS are xy values); scaling not needed here.
      const out = [];
      let p = start + 10;
      for (;;) {
        const flags = u16(p); const child = u16(p + 2); p += 4;
        let ax; let ay;
        if (flags & 1) { ax = i16(p); ay = i16(p + 2); p += 4; } else { ax = b.readInt8(p); ay = b.readInt8(p + 1); p += 2; }
        if (flags & 8) p += 2; else if (flags & 0x40) p += 4; else if (flags & 0x80) p += 8;
        out.push(...contours(child, dx + ax, dy + ay));
        if (!(flags & 0x20)) break;
      }
      return out;
    }
    const endPts = [];
    for (let i = 0; i < nc; i++) endPts.push(u16(start + 10 + 2 * i));
    const nPts = endPts[nc - 1] + 1;
    let p = start + 10 + 2 * nc;
    p += 2 + u16(p); // instructions
    const flags = [];
    while (flags.length < nPts) {
      const f = b[p++]; flags.push(f);
      if (f & 8) { let r = b[p++]; while (r--) flags.push(f); }
    }
    const readCoords = (short, same) => {
      const v = []; let c = 0;
      for (const f of flags) {
        if (f & short) { const d = b[p++]; c += f & same ? d : -d; } else if (!(f & same)) { c += i16(p); p += 2; }
        v.push(c);
      }
      return v;
    };
    const xs = readCoords(2, 16);
    const ys = readCoords(4, 32);
    const out = []; let s = 0;
    for (const e of endPts) {
      const c = [];
      for (let i = s; i <= e; i++) c.push({ x: xs[i] + dx, y: ys[i] + dy, on: !!(flags[i] & 1) });
      out.push(c); s = e + 1;
    }
    return out;
  }

  /** SVG path for `text` with its baseline-left at (x, y), in px. */
  function path(text, x, y, size, tracking = 0) {
    const k = size / unitsPerEm;
    const X = (v) => (x + v * k).toFixed(2);
    const Y = (v) => (y - v * k).toFixed(2);
    let d = ''; let pen = 0;
    for (const ch of text) {
      const g = glyphOf(ch.codePointAt(0));
      for (const c of contours(g, pen, 0)) {
        if (!c.length) continue;
        // Start on an on-curve point (or the midpoint of two off-curve ones).
        let first = c.findIndex((q) => q.on);
        let pts = c;
        if (first < 0) {
          const m = { x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2, on: true };
          pts = [m, ...c.slice(1), c[0]]; first = 0;
        } else pts = [...c.slice(first), ...c.slice(0, first)];
        d += `M${X(pts[0].x)} ${Y(pts[0].y)}`;
        for (let i = 1; i <= pts.length; i++) {
          const q = pts[i % pts.length];
          if (q.on) { d += `L${X(q.x)} ${Y(q.y)}`; continue; }
          const n = pts[(i + 1) % pts.length];
          const end = n.on ? n : { x: (q.x + n.x) / 2, y: (q.y + n.y) / 2 };
          d += `Q${X(q.x)} ${Y(q.y)} ${X(end.x)} ${Y(end.y)}`;
          if (n.on) i++;
        }
        d += 'Z';
      }
      pen += advance(g) + tracking * unitsPerEm;
    }
    const width = (pen - tracking * unitsPerEm) * k;
    return { d, width, ascent: ascender * k };
  }

  return { path };
}

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
