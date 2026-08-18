import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';

import { FriendlyError } from '@/lib/friendly-error';
import { mobileFetch } from '@/lib/mobile-api';

type WalletJson = {
  configured?: boolean;
  saveUrl?: string;
  error?: string;
  apple?: { configured: boolean; message?: string };
  google?: { configured: boolean; message?: string };
};

async function readWalletError(response: Response, fallback: string) {
  try {
    const payload = await response.json() as WalletJson;
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

// A wallet failure is almost always a server-side configuration problem, and
// the server already says which one. Keep the HTTP status attached so a tester
// screenshot distinguishes "not configured" (503) from "signing failed" (500)
// from "publish your card first" (404) - previously every one of these
// collapsed into the same unactionable sentence on the device.
function walletFailure(status: number, message: string) {
  const trimmed = message.trim();
  const suffix = trimmed && !/\.$/.test(trimmed) ? "." : "";
  return new FriendlyError(`${trimmed}${suffix} (wallet ${status})`);
}

export async function fetchWalletAvailability(slug: string, accessToken: string) {
  const platform = Platform.OS === 'ios' ? 'apple' : Platform.OS === 'android' ? 'google' : null;
  if (!platform) {
    return { available: false, message: 'Wallet passes are only available on iPhone and Android.' };
  }

  const statusResponse = await mobileFetch('/api/mobile/wallet/status', accessToken);
  if (!statusResponse.ok) {
    return { available: false, message: 'Could not check Wallet availability right now.' };
  }

  const status = await statusResponse.json() as WalletJson;
  const platformStatus = status[platform];
  if (!platformStatus?.configured) {
    return {
      available: false,
      message: platformStatus?.message || `${platform === 'apple' ? 'Apple' : 'Google'} Wallet is not configured on the server yet.`,
    };
  }

  if (!slug) {
    return { available: false, message: 'Publish your card before creating a Wallet pass.' };
  }

  return { available: true, message: '' };
}

export async function addGoogleWalletPass(slug: string, accessToken: string) {
  const response = await mobileFetch(`/api/mobile/wallet/google/${encodeURIComponent(slug)}`, accessToken);
  const payload = await response.json().catch(() => ({}) as WalletJson) as WalletJson;
  if (!response.ok || !payload.saveUrl) {
    throw walletFailure(response.status, payload.error || 'Google Wallet is not available right now');
  }
  if (Platform.OS === 'android') {
    // The save URL is a web handoff into Google Wallet. A browser/custom-tab
    // launch is observable and reliable; Linking may resolve successfully on
    // some Android versions without actually presenting a handler.
    await WebBrowser.openBrowserAsync(payload.saveUrl);
    return;
  }

  const canOpen = await Linking.canOpenURL(payload.saveUrl).catch(() => false);
  if (canOpen) {
    await Linking.openURL(payload.saveUrl);
    return;
  }

  await WebBrowser.openBrowserAsync(payload.saveUrl);
}

export async function addAppleWalletPass(slug: string, accessToken: string) {
  if (Platform.OS !== 'ios') {
    throw new FriendlyError('Apple Wallet passes are available on iPhone.');
  }

  const { readEnv } = await import('@/lib/env');
  const base = readEnv()?.publicCardBaseUrl;
  if (!base) throw new FriendlyError('ehllo API URL is not configured.');

  // Ask the server for a short-lived pass URL and let iOS fetch it. iOS shows
  // its own "Add to Apple Wallet" sheet only for a pass it downloaded itself;
  // fetching the file here and handing it to the share sheet made Wallet one
  // option in a list of many, which is not what "add to Wallet" means.
  const linkResponse = await mobileFetch(
    `/api/mobile/wallet/apple/${encodeURIComponent(slug)}`,
    accessToken,
    { method: 'POST' },
  );
  const link = await linkResponse.json().catch(() => ({}) as { passUrl?: string; error?: string });

  if (linkResponse.ok && link.passUrl) {
    await Linking.openURL(link.passUrl);
    return;
  }

  // A server too old to mint links, or a configuration problem. Fall back to
  // the download-and-share path so the pass is still reachable rather than
  // failing outright.
  const downloadUrl = `${base}/api/mobile/wallet/apple/${encodeURIComponent(slug)}`;
  const path = `${FileSystem.cacheDirectory}${slug}.pkpass`;
  const result = await FileSystem.downloadAsync(downloadUrl, path, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (result.status !== 200) {
    let message = link.error ?? '';
    if (!message) {
      try {
        message = (JSON.parse(await FileSystem.readAsStringAsync(path)) as WalletJson).error ?? '';
      } catch {
        message = await readWalletError(
          await mobileFetch(`/api/mobile/wallet/apple/${encodeURIComponent(slug)}`, accessToken),
          '',
        );
      }
    }
    throw walletFailure(result.status, message || 'Apple Wallet is not available right now');
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new FriendlyError('Sharing is not available on this device.');
  }

  try {
    await Sharing.shareAsync(path, {
      UTI: 'com.apple.pkpass',
      mimeType: 'application/vnd.apple.pkpass',
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error ?? '');
    throw new FriendlyError(`The pass was created but iOS would not open it${detail ? `: ${detail}` : '.'}`);
  }
}
