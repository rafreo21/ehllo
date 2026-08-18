import { scopedStorage as AsyncStorage } from '@/lib/scoped-storage';

const APPLE_WALLET_SAVED_PREFIX = 'aftermeet.apple-wallet.saved.';

export async function readAppleWalletSaved(slug: string) {
  return (await AsyncStorage.getItem(`${APPLE_WALLET_SAVED_PREFIX}${slug}`)) === 'true';
}

export async function writeAppleWalletSaved(slug: string, saved: boolean) {
  const key = `${APPLE_WALLET_SAVED_PREFIX}${slug}`;
  if (saved) await AsyncStorage.setItem(key, 'true');
  else await AsyncStorage.removeItem(key);
}
