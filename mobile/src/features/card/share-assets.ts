import * as FileSystem from 'expo-file-system/legacy';
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
  options?: { themeColor?: string },
) {
  const env = readEnv();
  if (!env) throw new Error('App configuration is missing.');

  const params = new URLSearchParams({ type });
  if (options?.themeColor?.trim()) {
    params.set('themeColor', options.themeColor.trim());
  }
  const url = `${env.publicCardBaseUrl}/api/mobile/share-assets/${encodeURIComponent(slug)}?${params.toString()}`;
  const filename = `ehllo-${type}-${slug}.${assetExtension(type)}`;
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

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(download.uri, {
      mimeType: assetMimeType(type),
      dialogTitle: type === 'virtual-background' ? 'Virtual background' : 'Smart watch QR',
      UTI: type === 'virtual-background' ? 'public.jpeg' : 'public.png',
    });
    return download.uri;
  }

  return download.uri;
}

export function watchSetupInstructions(platform: 'ios' | 'android') {
  if (platform === 'ios') {
    return 'Download the watch QR, then add it as a photo on your Apple Watch face (Photos or Modular Compact).';
  }
  return 'Download the watch QR, then set it as a custom watch face image in Wear OS or Samsung Galaxy Watch.';
}

export function virtualBackgroundInstructions() {
  return 'Downloads a 1920×1080 JPG for Zoom, Google Meet, and Teams. Uses your card color and is laid out for mirrored self-view in those apps.';
}
