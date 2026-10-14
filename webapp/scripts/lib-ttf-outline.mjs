/**
 * Converts text to SVG outlines straight from a TrueType file (cmap format 4,
 * hmtx, loca, simple and composite glyf records; no kerning). Shared by the
 * link-preview card (gen-og-image.mjs) and the Play Store graphics
 * (gen-play-graphics.mjs): neither librsvg nor sharp's text input actually
 * uses a bundled font on macOS, so outlines are the only way the brand
 * typeface survives.
 */
import { readFileSync } from 'node:fs';

export function loadFont(file) {
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
