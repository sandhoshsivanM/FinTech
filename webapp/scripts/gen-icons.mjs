/**
 * Renders every app icon in the repo from the brand mark.
 *
 * Source of truth: `assets/brand/khazana-mark.png`, which `extract-mark.mjs`
 * lifts off the supplied brand sheet. Nothing here redraws the mark — every
 * output is that same artwork, resized and placed.
 *
 * Before this, the icons were hand-placed and had drifted into three different
 * marks: the brand render on iOS and Android, a *different* render on macOS,
 * and a flat vector nothing but the PWA manifest referenced. Flutter web was
 * still shipping the stock blue Flutter "F". Generating them all from one file
 * removes the way that happened.
 *
 * Run with `npm run icons` (after `npm run mark` if the brand sheet changed).
 * Deliberately not wired into the build: it writes binaries into the repo, and
 * a build step that rewrites tracked files on every CI run produces noise, not
 * safety.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEBAPP = resolve(HERE, '..');
const REPO = resolve(WEBAPP, '..');
const SOURCE = join(REPO, 'assets', 'brand', 'khazana-mark.png');

/** The Vault plate the mark sits on. Matches --bg in the dark theme. */
const PLATE = { r: 7, g: 13, b: 10, alpha: 1 };

/**
 * How much of the canvas the mark occupies.
 *
 * `any` icons sit at 76%, which reads as a confident app icon. `maskable` sits
 * at 58% because Android may crop to the centre 80% circle, and artwork drawn
 * to the edge loses its rim to that crop.
 */
const INSET = { any: 0.76, maskable: 0.58 };

/**
 * Every raster, as [path relative to the repo root, pixel size, treatment].
 *
 * `plate` puts the mark on the dark Vault square, which is what an app icon
 * needs — the mark itself is transparent, and a launcher that paints it on a
 * white background loses the gold rim. `bare` keeps the transparency, for the
 * two places the app draws the mark against its own surface. `maskable` is
 * plated but inset further, for the Android crop.
 *
 * Paths are grouped by platform and each group notes what reads it, because a
 * generated file with no consumer is how the last set rotted.
 */
const TARGETS = [
  // Next.js web app — public/ is served as-is; layout.tsx declares these.
  ['webapp/public/icon-512.png', 512, 'plate'],
  ['webapp/public/icon-192.png', 192, 'plate'],
  ['webapp/public/apple-touch-icon.png', 180, 'plate'],
  ['webapp/public/favicon-32.png', 32, 'plate'],
  ['webapp/public/favicon-16.png', 16, 'plate'],
  // The in-app BrandMark (sidebar, vault gate) draws the mark on the app's own
  // surface, so this one keeps its transparency. It is a copy of the master.
  ['webapp/public/khazana-mark.png', 1024, 'bare'],

  // Flutter web — these were still the stock Flutter logo.
  ['web/icons/Icon-192.png', 192, 'plate'],
  ['web/icons/Icon-512.png', 512, 'plate'],
  ['web/icons/Icon-maskable-192.png', 192, 'maskable'],
  ['web/icons/Icon-maskable-512.png', 512, 'maskable'],
  ['web/favicon.png', 32, 'plate'],

  // Android — AndroidManifest.xml points at @mipmap/ic_launcher.
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher.png', 48, 'plate'],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher.png', 72, 'plate'],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher.png', 96, 'plate'],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png', 144, 'plate'],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 192, 'plate'],

  // iOS — sizes and filenames are fixed by AppIcon.appiconset/Contents.json.
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@1x.png', 20, 'plate'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@2x.png', 40, 'plate'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@3x.png', 60, 'plate'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@1x.png', 29, 'plate'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@2x.png', 58, 'plate'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@3x.png', 87, 'plate'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@1x.png', 40, 'plate'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@2x.png', 80, 'plate'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@3x.png', 120, 'plate'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@2x.png', 120, 'plate'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@3x.png', 180, 'plate'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@1x.png', 76, 'plate'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@2x.png', 152, 'plate'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-83.5x83.5@2x.png', 167, 'plate'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png', 1024, 'plate'],

  // macOS — this set was a different mark entirely.
  ['macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_16.png', 16, 'plate'],
  ['macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_32.png', 32, 'plate'],
  ['macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_64.png', 64, 'plate'],
  ['macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_128.png', 128, 'plate'],
  ['macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_256.png', 256, 'plate'],
  ['macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_512.png', 512, 'plate'],
  ['macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_1024.png', 1024, 'plate'],

  // Tauri desktop — tauri.conf.json lists the first four; the Square* files are
  // the Windows Store set.
  ['webapp/src-tauri/icons/32x32.png', 32, 'plate'],
  ['webapp/src-tauri/icons/128x128.png', 128, 'plate'],
  ['webapp/src-tauri/icons/128x128@2x.png', 256, 'plate'],
  ['webapp/src-tauri/icons/icon.png', 1024, 'plate'],
  ['webapp/src-tauri/icons/Square30x30Logo.png', 30, 'plate'],
  ['webapp/src-tauri/icons/Square44x44Logo.png', 44, 'plate'],
  ['webapp/src-tauri/icons/Square71x71Logo.png', 71, 'plate'],
  ['webapp/src-tauri/icons/Square89x89Logo.png', 89, 'plate'],
  ['webapp/src-tauri/icons/Square107x107Logo.png', 107, 'plate'],
  ['webapp/src-tauri/icons/Square142x142Logo.png', 142, 'plate'],
  ['webapp/src-tauri/icons/Square150x150Logo.png', 150, 'plate'],
  ['webapp/src-tauri/icons/Square284x284Logo.png', 284, 'plate'],
  ['webapp/src-tauri/icons/Square310x310Logo.png', 310, 'plate'],
  ['webapp/src-tauri/icons/StoreLogo.png', 50, 'plate'],
];

/**
 * The mark, centred on the Vault plate.
 *
 * Composited in two passes because sharp applies `resize` to the base image
 * before `composite` — scaling and placing in one pipeline puts the mark
 * against the pre-resize canvas and strands it in a corner.
 *
 * @param purpose `any` for a normal icon, `maskable` for one Android may crop.
 */
async function plated(size, purpose = 'any') {
  const inner = Math.round(size * INSET[purpose]);
  const mark = await sharp(SOURCE)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
    .png()
    .toBuffer();

  return sharp({ create: { width: size, height: size, channels: 4, background: PLATE } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** The mark alone, transparent. For the in-app BrandMark and the brand sheet. */
async function bare(size) {
  return sharp(SOURCE)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * A .ico carrying the three sizes Windows and browser tabs actually pick from.
 * Hand-assembled because sharp has no ICO encoder — the format is a short
 * header plus embedded PNGs, which is little enough to be worth not adding a
 * dependency for.
 */
async function buildIco(sizes) {
  const images = await Promise.all(sizes.map((s) => plated(s, 'any')));
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(count, 4);

  const directory = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  images.forEach((png, i) => {
    const size = sizes[i];
    const d = 16 * i;
    directory[d] = size >= 256 ? 0 : size; // 0 means 256
    directory[d + 1] = size >= 256 ? 0 : size;
    directory[d + 2] = 0; // palette
    directory[d + 3] = 0; // reserved
    directory.writeUInt16LE(1, d + 4); // colour planes
    directory.writeUInt16LE(32, d + 6); // bits per pixel
    directory.writeUInt32LE(png.length, d + 8);
    directory.writeUInt32LE(offset, d + 12);
    offset += png.length;
  });

  return Buffer.concat([header, directory, ...images]);
}

async function write(relativePath, buffer) {
  const target = join(REPO, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buffer);
  return target;
}

async function main() {
  const make = { plate: (n) => plated(n, 'any'), maskable: (n) => plated(n, 'maskable'), bare };

  // Cached per (treatment, size) so a size used by six platforms is rendered
  // once rather than six times.
  const cache = new Map();
  for (const [path, size, treatment] of TARGETS) {
    const key = `${treatment}:${size}`;
    if (!cache.has(key)) cache.set(key, await make[treatment](size));
    await write(path, cache.get(key));
  }

  await write('webapp/src/app/favicon.ico', await buildIco([16, 32, 48]));
  await write('webapp/src-tauri/icons/icon.ico', await buildIco([16, 32, 48, 64, 256]));

  console.log(`Wrote ${TARGETS.length + 2} icons from ${SOURCE.replace(REPO + '/', '')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
