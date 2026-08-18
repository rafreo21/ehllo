import { File, Paths } from 'expo-file-system';

import type { VcardEmbeddedImage } from '@/lib/vcard-images';

/** Largest-first: the full vCard (all contact methods + note) leaves little room
 * alongside a logo-safe 'Q'/'H' budget, so shrink the thumbnail until something fits. */
const THUMBNAIL_ATTEMPTS = [
  { size: 48, compress: 0.4 },
  { size: 32, compress: 0.35 },
  { size: 24, compress: 0.3 },
];

/**
 * Downloads and downscales a remote profile photo into a tiny embeddable vCard image,
 * so the offline QR can carry a real thumbnail instead of just a URL when there's
 * capacity left over after fitting every contact method (see offline-qr-payload.ts).
 * Tries each size in THUMBNAIL_ATTEMPTS (largest first) and returns the first one
 * `accepts` approves of - callers use this to check the resulting vCard still fits
 * a scannable QR. Returns null if every size fails or the download/resize itself fails.
 *
 * expo-image-manipulator is required lazily, inside the try/catch: a native module,
 * statically imported, executes its native-lookup at module-load time - before any
 * try/catch here could run - and crashes every screen that imports this file if the
 * installed native build doesn't have it yet (e.g. dev client not rebuilt). Requiring
 * it lazily keeps that failure contained to this best-effort enhancement.
 */
export async function buildVcardPhotoThumbnail(
  url: string,
  accepts: (image: VcardEmbeddedImage) => boolean,
): Promise<VcardEmbeddedImage | null> {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;

  try {
    const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
    const downloaded = await File.downloadFileAsync(trimmed, Paths.cache, { idempotent: true });

    for (const attempt of THUMBNAIL_ATTEMPTS) {
      const rendered = await ImageManipulator.manipulate(downloaded.uri)
        .resize({ width: attempt.size, height: attempt.size })
        .renderAsync();
      const result = await rendered.saveAsync({
        compress: attempt.compress,
        format: SaveFormat.JPEG,
        base64: true,
      });
      if (!result.base64) continue;
      const image: VcardEmbeddedImage = { base64: result.base64, mimeType: 'image/jpeg' };
      if (accepts(image)) return image;
    }
    return null;
  } catch (error) {
    if (__DEV__) {
      console.warn('[vcard-photo-thumbnail] embed failed, falling back to photo URL:', error);
    }
    return null;
  }
}
