#!/usr/bin/env node
/**
 * Guards the icon pipeline (webapp/scripts/gen-icons.mjs).
 *
 * Two opposite alpha rules broke builds on the same day:
 *   - App Store Connect rejects an iOS app icon that merely *has* an alpha
 *     channel (ITMS-90717), so the iOS AppIcon set must be RGB.
 *   - Tauri refuses non-RGBA icons at compile time and Next's favicon.ico
 *     decoder rejects non-RGBA entries, so everything else must be RGBA.
 * Stripping alpha everywhere "fixed" the first and broke the second. This
 * checks both rules, plus that each generated file has the size the generator
 * says it should, and that the hand-built macOS icon.icns still carries the
 * same artwork as the generated icon.png (it is produced by iconutil, outside
 * the generator, and went stale once).
 *
 * Dependency-free (node: built-ins only) so it runs straight after checkout on
 * any OS: PNG headers and pixels are read here directly.
 *
 * Usage: node tool/check_icons.mjs        (from anywhere; exits 1 on failure)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GENERATOR = join(REPO, 'webapp/scripts/gen-icons.mjs');
const IOS_SET = 'ios/Runner/Assets.xcassets/AppIcon.appiconset';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COLOR = { 0: 'gray', 2: 'RGB', 3: 'palette', 4: 'gray+alpha', 6: 'RGBA' };

const failures = [];
let checked = 0;
const fail = (msg) => failures.push(msg);

/** Width, height, bit depth and colour type from a PNG's IHDR. */
function pngInfo(buf, label) {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIG) || buf.toString('latin1', 12, 16) !== 'IHDR') {
    fail(`${label}: not a PNG`);
    return null;
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    depth: buf[24],
    colorType: buf[25],
    interlace: buf[28],
  };
}

/**
 * A PNG has an alpha channel if its colour type carries one, or if it is
 * palette/gray/RGB with a tRNS chunk (which is alpha in all but name — App
 * Store Connect counts it).
 */
function hasAlpha(buf, info) {
  if (info.colorType === 4 || info.colorType === 6) return true;
  for (let o = 8; o + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('latin1', o + 4, o + 8);
    if (type === 'tRNS') return true;
    if (type === 'IEND') break;
    o += 12 + len;
  }
  return false;
}

/** Decode an 8-bit, non-interlaced RGB/RGBA PNG to RGBA pixels. */
function decodePng(buf) {
  const info = pngInfo(buf, 'decode');
  if (!info || info.depth !== 8 || info.interlace !== 0 || ![2, 6].includes(info.colorType)) return null;
  const chunks = [];
  for (let o = 8; o + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('latin1', o + 4, o + 8);
    if (type === 'IDAT') chunks.push(buf.subarray(o + 8, o + 8 + len));
    if (type === 'IEND') break;
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const bpp = info.colorType === 6 ? 4 : 3;
  const stride = info.width * bpp;
  const out = Buffer.alloc(info.width * info.height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < info.height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = (line[x] + add) & 0xff;
    }
    for (let x = 0; x < info.width; x++) {
      const s = x * bpp, d = (y * info.width + x) * 4;
      out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2];
      out[d + 3] = bpp === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { ...info, pixels: out };
}

/** Mean absolute per-channel difference of two same-size decoded PNGs. */
function meanDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.pixels.length; i++) sum += Math.abs(a.pixels[i] - b.pixels[i]);
  return sum / a.pixels.length;
}

/** Embedded images of a .ico. Each must be a PNG (what gen-icons writes) and RGBA. */
function checkIco(rel) {
  const path = join(REPO, rel);
  if (!existsSync(path)) return fail(`${rel}: missing`);
  const buf = readFileSync(path);
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return fail(`${rel}: not an ICO`);
  const count = buf.readUInt16LE(4);
  if (count === 0) return fail(`${rel}: no entries`);
  for (let i = 0; i < count; i++) {
    const d = 6 + 16 * i;
    const declared = buf[d] || 256;
    const size = buf.readUInt32LE(d + 8);
    const offset = buf.readUInt32LE(d + 12);
    const img = buf.subarray(offset, offset + size);
    const label = `${rel} entry ${i} (${declared}px)`;
    checked++;
    if (!img.subarray(0, 8).equals(PNG_SIG)) {
      // A BMP entry: 32 bpp is BGRA, anything less has no alpha.
      const bpp = img.readUInt16LE(14);
      if (bpp !== 32) fail(`${label}: BMP at ${bpp} bpp, must be 32 bpp (RGBA)`);
      continue;
    }
    const info = pngInfo(img, label);
    if (!info) continue;
    if (info.colorType !== 6) fail(`${label}: ${COLOR[info.colorType]}, must be RGBA (Next's ICO decoder and Tauri reject it)`);
    if (info.width !== declared || info.height !== declared) fail(`${label}: is ${info.width}x${info.height}`);
  }
}

// 1. Every PNG target the generator writes: right size, right channels.
const source = readFileSync(GENERATOR, 'utf8');
const targets = [...source.matchAll(/\[\s*'([^']+\.png)'\s*,\s*(\d+)\s*,\s*'(\w+)'\s*\]/g)].map(
  ([, path, size, treatment]) => ({ path, size: Number(size), treatment }),
);
if (targets.length < 20) fail(`could only read ${targets.length} targets from ${GENERATOR}; has its TARGETS format changed?`);

for (const { path: rel, size, treatment } of targets) {
  const path = join(REPO, rel);
  if (!existsSync(path)) { fail(`${rel}: missing (run \`npm run icons\` in webapp/)`); continue; }
  const buf = readFileSync(path);
  const info = pngInfo(buf, rel);
  if (!info) continue;
  checked++;
  if (info.width !== size || info.height !== size) fail(`${rel}: is ${info.width}x${info.height}, generator says ${size}x${size}`);
  const alpha = hasAlpha(buf, info);
  if (treatment === 'opaque') {
    if (alpha) fail(`${rel}: has an alpha channel (${COLOR[info.colorType]}); iOS app icons must be opaque RGB (ITMS-90717)`);
  } else if (info.colorType !== 6) {
    fail(`${rel}: ${COLOR[info.colorType]}, must be RGBA (Tauri and Next reject non-RGBA icons)`);
  }
}

// 1b. Android adaptive-icon layers and splash marks. Beyond size/RGBA:
//   - foreground: transparent corners, and every visible pixel inside the 66dp
//     safe zone of the 108dp canvas (anything outside gets masked off);
//   - mono: pure white pixels only (Android 13 tints it), with some transparency;
//   - the XML must point at the monochrome file, not the colour foreground, and
//     the background colour must be the white the plated icons use.
for (const { path: rel, size, treatment } of targets) {
  if (!['foreground', 'mono', 'splash', 'splashDark'].includes(treatment)) continue;
  const path = join(REPO, rel);
  if (!existsSync(path)) continue;
  const img = decodePng(readFileSync(path));
  if (!img) { fail(`${rel}: could not decode for content checks`); continue; }
  let minX = size, minY = size, maxX = -1, maxY = -1, opaque = 0, nonWhite = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    if (img.pixels[i + 3] > 8) {
      opaque++;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (img.pixels[i] !== 255 || img.pixels[i + 1] !== 255 || img.pixels[i + 2] !== 255) nonWhite++;
    }
  }
  if (opaque === 0) { fail(`${rel}: fully transparent`); continue; }
  if (img.pixels[3] > 8) fail(`${rel}: top-left pixel is not transparent`);
  if (treatment === 'foreground' || treatment === 'mono') {
    const margin = Math.floor((size * (1 - 66 / 108)) / 2) - 1; // 1px of anti-alias slack
    if (minX < margin || minY < margin || maxX > size - 1 - margin || maxY > size - 1 - margin) {
      fail(`${rel}: artwork spills outside the 66dp safe zone (bounds ${minX},${minY}-${maxX},${maxY} of ${size})`);
    }
  }
  if (treatment === 'mono' && nonWhite > 0) fail(`${rel}: ${nonWhite} visible pixels are not white; a monochrome layer must be one colour`);
  if (treatment === 'foreground' && nonWhite === 0) fail(`${rel}: looks like a silhouette, expected the full-colour mark`);
}
{
  const res = 'android/app/src/main/res';
  for (const xml of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    const rel = `${res}/mipmap-anydpi-v26/${xml}`;
    checked++;
    if (!existsSync(join(REPO, rel))) { fail(`${rel}: missing`); continue; }
    const text = readFileSync(join(REPO, rel), 'utf8');
    if (!/<monochrome android:drawable="@mipmap\/ic_launcher_monochrome"/.test(text)) fail(`${rel}: <monochrome> must be @mipmap/ic_launcher_monochrome`);
    if (!/<foreground android:drawable="@mipmap\/ic_launcher_foreground"/.test(text)) fail(`${rel}: <foreground> must be @mipmap/ic_launcher_foreground`);
  }
  const bgRel = `${res}/values/ic_launcher_background.xml`;
  checked++;
  if (!/>#FFFFFF</i.test(readFileSync(join(REPO, bgRel), 'utf8'))) fail(`${bgRel}: ic_launcher_background must be #FFFFFF`);
}

// 2. Nothing in the iOS AppIcon set may carry alpha, generated or not.
for (const name of readdirSync(join(REPO, IOS_SET)).filter((f) => f.endsWith('.png'))) {
  const rel = `${IOS_SET}/${name}`;
  if (targets.some((t) => t.path === rel)) continue;
  const buf = readFileSync(join(REPO, rel));
  const info = pngInfo(buf, rel);
  checked++;
  if (info && hasAlpha(buf, info)) fail(`${rel}: has an alpha channel; iOS app icons must be opaque RGB (ITMS-90717)`);
}

// 3. ICO files: every entry RGBA.
checkIco('webapp/src/app/favicon.ico');
checkIco('webapp/src-tauri/icons/icon.ico');

// 4. icon.icns: present, RGBA entries, and the same artwork as icon.png.
{
  const rel = 'webapp/src-tauri/icons/icon.icns';
  // `--icns <file>` checks another .icns against the generated PNGs (for
  // trying a rebuilt one before replacing the tracked file).
  const flag = process.argv.indexOf('--icns');
  const path = flag > 0 ? resolve(process.argv[flag + 1]) : join(REPO, rel);
  if (!existsSync(path)) fail(`${rel}: missing (tauri.conf.json lists it)`);
  else {
    const buf = readFileSync(path);
    if (buf.toString('latin1', 0, 4) !== 'icns' || buf.readUInt32BE(4) !== buf.length) fail(`${rel}: not a valid icns`);
    else {
      const pngs = new Map();
      for (let o = 8; o + 8 <= buf.length; ) {
        const type = buf.toString('latin1', o, o + 4);
        const len = buf.readUInt32BE(o + 4);
        if (len < 8) { fail(`${rel}: corrupt entry ${type}`); break; }
        const data = buf.subarray(o + 8, o + len);
        if (data.subarray(0, 8).equals(PNG_SIG)) {
          const info = pngInfo(data, `${rel} ${type}`);
          checked++;
          if (info && info.colorType !== 6) fail(`${rel} ${type}: ${COLOR[info.colorType]}, must be RGBA`);
          if (info) pngs.set(info.width, data);
        }
        o += len;
      }
      // Compare entries against the generator's outputs. iconutil re-encodes
      // (and resamples the smaller sizes), so bytes differ: a current .icns
      // measured 0.0 / 1.4 / 2.6 mean channel diff at 1024 / 256 / 128 px,
      // while the stale one this replaced measured ~144. 8 sits well between.
      for (const [size, ref] of [[1024, 'icon.png'], [256, '128x128@2x.png'], [128, '128x128.png']]) {
        const entry = pngs.get(size);
        if (!entry) { fail(`${rel}: no ${size}px PNG entry`); continue; }
        const a = decodePng(entry);
        const b = decodePng(readFileSync(join(REPO, 'webapp/src-tauri/icons', ref)));
        if (!a || !b) { fail(`${rel}: could not decode ${size}px entry or ${ref} for comparison`); continue; }
        const diff = meanDiff(a, b);
        if (process.env.ICON_DEBUG) console.log(`icns ${size}px vs ${ref}: mean diff ${diff.toFixed(2)}`);
        if (diff > 8) {
          fail(`${rel}: ${size}px entry differs from ${ref} (mean channel diff ${diff.toFixed(2)}); ` +
            'the .icns is stale — rebuild it from the generated PNGs with iconutil (see gen-icons.mjs)');
        }
      }
    }
  }
}

if (failures.length) {
  console.error(`Icon check FAILED (${failures.length} problem${failures.length === 1 ? '' : 's'}):`);
  for (const f of failures) {
    console.error(`  - ${f}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=Icon pipeline::${f}`);
  }
  process.exit(1);
}
console.log(`Icon check passed: ${checked} images across ${targets.length} generated PNGs, 2 .ico files and icon.icns.`);
