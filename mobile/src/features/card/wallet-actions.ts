import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';

import { mobileFetch } from '@/lib/mobile-api';
import { openUrlCandidates } from '@/lib/open-url-candidates';

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
  const payload = await response.json() as WalletJson;
  if (!response.ok || !payload.saveUrl) {
    throw new Error(payload.error || 'Google Wallet is not available right now.');
  }
  if (Platform.OS === 'android') {
    const opened = await openUrlCandidates([
      payload.saveUrl,
      payload.saveUrl.replace(/^https:\/\//, 'intent://') + '#Intent;scheme=https;package=com.google.android.apps.walletnfcrel;end',
    ]);
    if (opened) return;
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
    throw new Error('Apple Wallet passes are available on iPhone.');
  }

  const { readEnv } = await import('@/lib/env');
  const env = readEnv();
  const base = env?.publicCardBaseUrl;
  if (!base) throw new Error('ehllo API URL is not configured.');

  const downloadUrl = `${base}/api/mobile/wallet/apple/${encodeURIComponent(slug)}`;
  const path = `${FileSystem.cacheDirectory}${slug}.pkpass`;
  const result = await FileSystem.downloadAsync(downloadUrl, path, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (result.status !== 200) {
    const response = await mobileFetch(`/api/mobile/wallet/apple/${encodeURIComponent(slug)}`, accessToken);
    throw new Error(await readWalletError(response, 'Apple Wallet is not available right now. Publish your card first.'));
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(path, {
    UTI: 'com.apple.pkpass',
    mimeType: 'application/vnd.apple.pkpass',
  });
}
