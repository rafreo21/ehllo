import { scopedStorage as AsyncStorage } from '@/lib/scoped-storage';

const GOOGLE_WALLET_SAVED_PREFIX = 'aftermeet.google-wallet.saved.';

export async function readGoogleWalletSaved(slug: string) {
  return (await AsyncStorage.getItem(`${GOOGLE_WALLET_SAVED_PREFIX}${slug}`)) === 'true';
}

export async function writeGoogleWalletSaved(slug: string, saved: boolean) {
  const key = `${GOOGLE_WALLET_SAVED_PREFIX}${slug}`;
  if (saved) await AsyncStorage.setItem(key, 'true');
  else await AsyncStorage.removeItem(key);
}
