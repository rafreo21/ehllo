import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';

import { readEnv } from '@/lib/env';

export type ShareAssetType = 'virtual-background' | 'watch-face';

function assetExtension(type: ShareAssetType) {
  return type === 'virtual-background' ? 'jpg' : 'png';
}

function assetMimeType(type: ShareAssetType) {
  return type === 'virtual-background' ? 'image/jpeg' : 'image/png';
}

export async function downloadShareAsset(
  slug: string,
  type: ShareAssetType,
  accessToken: string,
  options?: { themeColor?: string; mirrored?: boolean },
) {
  const env = readEnv();
  if (!env) throw new Error('App configuration is missing.');

  const params = new URLSearchParams({ type });
  if (options?.themeColor?.trim()) {
    params.set('themeColor', options.themeColor.trim());
  }
  // Virtual backgrounds only. Pre-mirrors the frame so it reads correctly in your own
  // self-view in Meet, Zoom and Teams - at the cost of participants seeing it reversed and
  // being unable to scan the QR.
  const mirrored = type === 'virtual-background' && Boolean(options?.mirrored);
  if (mirrored) params.set('mirrored', '1');
  const url = `${env.publicCardBaseUrl}/api/mobile/share-assets/${encodeURIComponent(slug)}?${params.toString()}`;
  const filename = `ehllo-${type}-${slug}${mirrored ? '-mirrored' : ''}.${assetExtension(type)}`;
  const path = `${FileSystem.cacheDirectory}${filename}`;

  const download = await FileSystem.downloadAsync(url, path, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: type === 'virtual-background' ? 'image/jpeg' : 'image/png',
    },
  });

  if (download.status < 200 || download.status >= 300) {
    const payload = await FileSystem.readAsStringAsync(download.uri).catch(() => '');
    let apiError = 'We couldn’t download this asset.';
    if (payload) {
      try {
        const parsed = JSON.parse(payload) as { error?: string };
        if (parsed.error?.trim()) apiError = parsed.error.trim();
      } catch {
        // keep default message
      }
    }
    throw new Error(apiError);
  }

  const info = await FileSystem.getInfoAsync(download.uri);
  if (!info.exists || (info.size ?? 0) < 1024) {
    throw new Error('The downloaded image looks incomplete. Try again after publishing your card.');
  }

  // Flipped here rather than server-side. The app fetches from the DEPLOYED api
  // (publicCardBaseUrl), so a ?mirrored=1 the server does not yet understand is silently
  // ignored and you get the normal image back with no error - which is why the mirrored button
  // appeared to do nothing. Doing it on the device removes that dependency entirely: it works
  // against any deploy, old or new.
  let shareUri = download.uri;
  if (mirrored) {
    const context = ImageManipulator.manipulate(download.uri);
    context.flip('horizontal');
    const rendered = await context.renderAsync();
    const flipped = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
    if (!flipped?.uri) throw new Error('The background could not be mirrored.');
    shareUri = flipped.uri;
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(shareUri, {
      mimeType: assetMimeType(type),
      dialogTitle: type === 'virtual-background'
        ? (mirrored ? 'Virtual background (mirrored)' : 'Virtual background')
        : 'Smart watch QR',
      UTI: type === 'virtual-background' ? 'public.jpeg' : 'public.png',
    });
    return shareUri;
  }

  return shareUri;
}

export function watchSetupInstructions(platform: 'ios' | 'android') {
  if (platform === 'ios') {
    return 'Download the watch QR, then add it as a photo on your Apple Watch face (Photos or Modular Compact).';
  }
  return 'Download the watch QR, then set it as a custom watch face image in Wear OS or Samsung Galaxy Watch.';
}

export function virtualBackgroundInstructions() {
  return 'A mirrored 1920×1080 JPG for Zoom, Google Meet, and Teams, in your card colour. Those apps mirror your self-view, so this reads correctly on your own screen — participants see it reversed, and the QR will not scan for them.';
}
