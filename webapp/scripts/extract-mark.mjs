/**
 * Lifts the Khazana mark off the supplied brand sheet and writes the master.
 *
 * Source: `docs/design-spec/Untitled design.png` — the artwork as delivered,
 * mark above wordmark on a white page. This is the brand asset; nothing here
 * redraws it, recolours it or reinterprets it. All it does is separate the mark
 * from the page it was delivered on so the icon generator has a square,
 * transparent master to resize.
 *
 * The white is removed by flood-filling inward from the edges rather than by
 * thresholding every pixel: the gold bevel carries near-white specular
 * highlights, and a global "white becomes transparent" rule punches holes
 * straight through them. Only background connected to the border is dropped.
 *
 * Output: `assets/brand/khazana-mark.png`, 1024×1024, transparent.
 * Run with `npm run mark`, then `npm run icons`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SOURCE = join(REPO, 'docs', 'design-spec', 'Untitled design.png');
const MASTER = join(REPO, 'assets', 'brand', 'khazana-mark.png');
const WEB_MASTER = join(REPO, 'webapp', 'public', 'khazana-mark.png');

/** Final master size. Square, mark centred, transparent surround. */
const MASTER_SIZE = 1024;

/**
 * A pixel counts as page background when it is bright and unsaturated — white
 * paper, or the soft grey drop shadow the render sits on. Both are page, not
 * mark, and dropping the shadow is deliberate: its dithered edge is what
 * fringed the old icons at small sizes.
 */
function isBackground(r, g, b) {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min > 200 && max - min < 28;
}

/** Background connected to the border, found by flood fill. */
function backgroundMask(data, W, H, C) {
  const bg = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const p = y * W + x;
    if (bg[p]) return;
    const i = p * C;
    if (!isBackground(data[i], data[i + 1], data[i + 2])) return;
    bg[p] = 1;
    stack.push(x, y);
  };

  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }

  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return bg;
}

async function main() {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;

  const bg = backgroundMask(data, W, H, C);

  // Keep the mark only. The sheet also carries the KHAZANA wordmark and its
  // tagline below; the icon is the mark alone, and the first fully-empty row
  // under the mark is where one ends and the other begins.
  const rowPainted = new Array(H).fill(0);
  for (let y = 0; y < H; y++) {
    let painted = 0;
    for (let x = 0; x < W; x++) if (!bg[y * W + x]) painted++;
    rowPainted[y] = painted;
  }
  // The first blank row *after* the mark has started, not the leading margin
  // above it — the page begins with 100-odd empty rows.
  const firstPainted = rowPainted.findIndex((n) => n > 0);
  if (firstPainted < 0) throw new Error('The source page appears to be blank.');
  let split = H;
  for (let y = firstPainted; y < H; y++) {
    if (rowPainted[y] === 0) { split = y; break; }
  }

  let minX = W; let minY = H; let maxX = -1; let maxY = -1;
  for (let y = 0; y < split; y++) {
    for (let x = 0; x < W; x++) {
      if (bg[y * W + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('No mark found above the wordmark.');

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  // RGBA for the crop, alpha straight off the mask.
  const rgba = Buffer.alloc(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const src = ((y + minY) * W + (x + minX)) * C;
      const dst = (y * cropW + x) * 4;
      rgba[dst] = data[src];
      rgba[dst + 1] = data[src + 1];
      rgba[dst + 2] = data[src + 2];
      rgba[dst + 3] = bg[(y + minY) * W + (x + minX)] ? 0 : 255;
    }
  }

  // Square canvas so every downstream resize keeps the aspect ratio, with a
  // little breathing room — an icon whose artwork touches the edge looks
  // cramped in a launcher grid and gets clipped by a maskable crop.
  const side = Math.max(cropW, cropH);
  const pad = Math.round(side * 0.06);
  const canvas = side + pad * 2;

  const mark = await sharp(rgba, { raw: { width: cropW, height: cropH, channels: 4 } })
    .png()
    .toBuffer();

  // Two passes on purpose: sharp applies `resize` to the base image *before*
  // compositing, so centring and scaling in one pipeline places the mark
  // against the pre-resize canvas and leaves it stranded in a corner.
  const centred = await sharp({
    create: {
      width: canvas, height: canvas, channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{
      input: mark,
      left: Math.round((canvas - cropW) / 2),
      top: Math.round((canvas - cropH) / 2),
    }])
    .png()
    .toBuffer();

  const master = await sharp(centred)
    .resize(MASTER_SIZE, MASTER_SIZE, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toBuffer();

  for (const target of [MASTER, WEB_MASTER]) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, master);
  }

  console.log(
    `Mark lifted from ${cropW}×${cropH} at (${minX},${minY}) → ${MASTER_SIZE}×${MASTER_SIZE} master`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
