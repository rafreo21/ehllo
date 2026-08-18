import { scopedStorage as AsyncStorage } from '@/lib/scoped-storage';

import type { QrShareMode } from '@/components/branded-qr-code';

const QUICK_SHARE_QR_MODE_KEY = 'aftermeet.quick-share.qr-mode';

export async function readQuickShareQrMode(): Promise<QrShareMode> {
  const stored = await AsyncStorage.getItem(QUICK_SHARE_QR_MODE_KEY);
  return stored === 'offline' ? 'offline' : 'online';
}

export async function writeQuickShareQrMode(mode: QrShareMode) {
  await AsyncStorage.setItem(QUICK_SHARE_QR_MODE_KEY, mode);
}
