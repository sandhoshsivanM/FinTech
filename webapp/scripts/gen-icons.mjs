/**
 * Renders every app icon in the repo from the brand mark.
 *
 * Source of truth: the vector master `assets/brand/khazana-mark.svg`, rendered
 * to the 1024px PNG `assets/brand/khazana-mark.png` that this script reads.
 * Nothing here redraws the mark — every output is that same artwork, resized
 * and placed.
 *
 * Before this, the icons were hand-placed and had drifted into three different
 * marks: the brand render on iOS and Android, a *different* render on macOS,
 * and a flat vector nothing but the PWA manifest referenced. Flutter web was
 * still shipping the stock blue Flutter "F". Generating them all from one file
 * removes the way that happened.
 *
 * Run with `npm run icons` (after re-rendering khazana-mark.png from the SVG if
 * the mark changed).
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
const SOURCE_DARK = join(REPO, 'assets', 'brand', 'khazana-mark-dark.png');

/**
 * The plate the mark sits on: white, as on the light app icon.
 * The mark is deep green, so a dark plate would swallow it.
 */
const PLATE = { r: 255, g: 255, b: 255, alpha: 1 };

/**
 * How much of the canvas the mark occupies.
 *
 * `any` icons sit at 76%, which reads as a confident app icon. `maskable` sits
 * at 58% because Android may crop to the centre 80% circle, and artwork drawn
 * to the edge loses its rim to that crop.
 */
const INSET = { any: 0.76, maskable: 0.58 };

/**
 * Android adaptive-icon layers are a 108dp canvas of which only the centre
 * 66dp is guaranteed visible (the launcher mask and parallax eat the rest), so
 * the mark is fitted inside that 66dp square: 66/108 of the canvas.
 */
const SAFE_ZONE = 66 / 108;

/** How much of the splash canvas the mark fills (iOS LaunchImage, Android splash). */
const SPLASH_INSET = 0.62;

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
  // Adaptive-icon layers (mipmap-anydpi-v26/ic_launcher*.xml): a 108dp canvas,
  // 108/162/216/324/432 px. `foreground` is the mark fitted in the 66dp safe
  // zone on transparency (the background layer is the flat colour
  // @color/ic_launcher_background = white); `mono` is the single-colour
  // silhouette Android 13+ tints for themed icons.
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png', 108, 'foreground'],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png', 162, 'foreground'],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png', 216, 'foreground'],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png', 324, 'foreground'],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png', 432, 'foreground'],
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher_monochrome.png', 108, 'mono'],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher_monochrome.png', 162, 'mono'],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher_monochrome.png', 216, 'mono'],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher_monochrome.png', 324, 'mono'],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_monochrome.png', 432, 'mono'],
  // Launch splash mark (launch_background.xml and the Android 12 splash icon):
  // the mark alone on transparency, light and night variants, over the
  // #F2F2F2 / #0E0E10 window colour.
  ['android/app/src/main/res/drawable-nodpi/splash_mark.png', 576, 'splash'],
  ['android/app/src/main/res/drawable-night-nodpi/splash_mark.png', 576, 'splashDark'],

  // iOS — sizes and filenames are fixed by AppIcon.appiconset/Contents.json.
  // iOS launch image (LaunchScreen.storyboard, 168pt): 1x/2x/3x, light + dark.
  ['ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage.png', 168, 'splash'],
  ['ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@2x.png', 336, 'splash'],
  ['ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@3x.png', 504, 'splash'],
  ['ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImageDark.png', 168, 'splashDark'],
  ['ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImageDark@2x.png', 336, 'splashDark'],
  ['ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImageDark@3x.png', 504, 'splashDark'],

  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@1x.png', 20, 'opaque'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@2x.png', 40, 'opaque'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@3x.png', 60, 'opaque'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@1x.png', 29, 'opaque'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@2x.png', 58, 'opaque'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@3x.png', 87, 'opaque'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@1x.png', 40, 'opaque'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@2x.png', 80, 'opaque'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@3x.png', 120, 'opaque'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@2x.png', 120, 'opaque'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@3x.png', 180, 'opaque'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@1x.png', 76, 'opaque'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@2x.png', 152, 'opaque'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-83.5x83.5@2x.png', 167, 'opaque'],
  ['ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png', 1024, 'opaque'],

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

  const composed = await sharp({ create: { width: size, height: size, channels: 4, background: PLATE } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toBuffer();
  return sharp(composed).png({ compressionLevel: 9 }).toBuffer();
}

/**
 * A plated icon with the alpha channel removed, for iOS only.
 *
 * App Store Connect rejects a marketing icon that merely *has* an alpha channel
 * (ITMS-90717), and release-mobile.yml checks for exactly that. Everything else
 * must keep RGBA: Tauri refuses non-RGBA icons at compile time and Next's ICO
 * decoder rejects them, so stripping alpha everywhere broke both builds.
 */
async function opaque(size) {
  return sharp(await plated(size, 'any')).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
}

/** The mark alone, transparent. For the in-app BrandMark. */
async function bare(size) {
  return sharp(SOURCE)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** The mark (from `source`) fitted into `fraction` of a transparent square canvas. */
async function fitted(size, fraction, source = SOURCE) {
  const box = Math.round(size * fraction);
  const trimmed = await sharp(source).trim().png().toBuffer();
  const mark = await sharp(trimmed)
    .resize(box, box, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Adaptive-icon foreground: the mark inside the 66dp safe zone of a 108dp canvas. */
const foreground = (size) => fitted(size, SAFE_ZONE);

/**
 * Themed-icon silhouette: white where the mark is solid, transparent elsewhere.
 * The gold keyhole is knocked out (it is the one gold shape inside the dark
 * body) so the silhouette keeps the mark's recognisable detail; the two gold
 * shapes are told apart from the green by colour (red channel well above blue).
 */
async function mono(size) {
  const { data, info } = await sharp(SOURCE).raw().toBuffer({ resolveWithObject: true });
  const split = Math.round(info.width * (504 / 1024)); // the body/triangles gap in the master
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const x = (i / 4) % info.width;
    let alpha = data[i + 3];
    if (x < split) {
      // Gold (r - b ~ 118) vs green (r - b ~ -5): knock out proportionally so
      // the keyhole's anti-aliased rim stays smooth.
      const gold = Math.min(1, Math.max(0, (data[i] - data[i + 2] + 10) / 120));
      alpha = Math.round(alpha * (1 - gold));
    }
    out[i] = out[i + 1] = out[i + 2] = 255;
    out[i + 3] = alpha;
  }
  const master = await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  // Resampling leaves faint non-white RGB under the soft edge; the layer must be
  // exactly one colour, so force white and keep only the alpha.
  const placed = await sharp(await fitted(size, SAFE_ZONE, master)).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < placed.data.length; i += 4) placed.data[i] = placed.data[i + 1] = placed.data[i + 2] = 255;
  return sharp(placed.data, { raw: { width: placed.info.width, height: placed.info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Splash mark on transparency, light or night (the night mark is the lighter green). */
const splash = (size) => fitted(size, SPLASH_INSET);
const splashDark = (size) => fitted(size, SPLASH_INSET, SOURCE_DARK);

/**
 * A .ico carrying the three sizes Windows and browser tabs actually pick from.
 * Hand-assembled because sharp has no ICO encoder — the format is a short
 * header plus embedded PNGs, which is little enough to be worth not adding a
 * dependency for.
 */
async function buildIco(sizes) {
  // ICO entries keep an alpha channel: Next's ICO decoder (and some Windows
  // shells) reject embedded PNGs that are not RGBA, even fully opaque ones.
  const images = await Promise.all(
    sizes.map(async (s) => sharp(await plated(s, 'any')).ensureAlpha().png({ compressionLevel: 9 }).toBuffer()),
  );
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
  const make = { plate: (n) => plated(n, 'any'), opaque, maskable: (n) => plated(n, 'maskable'), bare, foreground, mono, splash, splashDark };

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
