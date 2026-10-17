/**
 * Turning a picked image into a profile photo.
 *
 * The photo lives inside the encrypted vault, so it is kept small: a centred
 * square, scaled to 256px and re-encoded as JPEG — tens of kilobytes rather
 * than the several megabytes a phone camera produces. Re-encoding also drops
 * the original's EXIF block, which on a phone photo can include where it was
 * taken.
 */

export const PHOTO_SIZE = 256;
/** Refuse anything bigger before decoding it: a 40MB RAW file is not a profile photo. */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

/** The largest centred square inside a `w × h` image. */
export function centreSquare(w: number, h: number): { sx: number; sy: number; side: number } {
  const side = Math.min(w, h);
  return { sx: Math.floor((w - side) / 2), sy: Math.floor((h - side) / 2), side };
}

export class PhotoError extends Error {}

export async function fileToProfilePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new PhotoError('That file is not an image. Choose a JPG, PNG or WebP photo.');
  if (file.size > MAX_PHOTO_BYTES) throw new PhotoError('That image is larger than 15 MB. Choose a smaller photo.');
  let bitmap: ImageBitmap;
  try {
    // `from-image` applies the EXIF rotation, so a portrait phone photo is not sideways.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoError('This image could not be read. Try a JPG or PNG.');
  }
  const { sx, sy, side } = centreSquare(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoError('This browser could not resize the image.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}
