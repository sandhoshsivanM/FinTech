import { describe, expect, test } from 'vitest';
import { centreSquare, fileToProfilePhoto, PhotoError } from './profilePhoto';

describe('centreSquare', () => {
  test('crops the middle of a landscape image', () => {
    expect(centreSquare(4000, 3000)).toEqual({ sx: 500, sy: 0, side: 3000 });
  });
  test('crops the middle of a portrait image', () => {
    expect(centreSquare(1080, 1920)).toEqual({ sx: 0, sy: 420, side: 1080 });
  });
  test('a square image is untouched', () => {
    expect(centreSquare(512, 512)).toEqual({ sx: 0, sy: 0, side: 512 });
  });
});

describe('fileToProfilePhoto', () => {
  test('refuses a file that is not an image', async () => {
    const f = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    await expect(fileToProfilePhoto(f)).rejects.toBeInstanceOf(PhotoError);
  });
  test('refuses an oversized image before decoding it', async () => {
    const f = new File([new Uint8Array(16 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' });
    await expect(fileToProfilePhoto(f)).rejects.toThrow(/larger than 15 MB/);
  });
});
