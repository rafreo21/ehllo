import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'aftermeet.mobile.device-id.v1';
let cached: string | null = null;

function createId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

// A stable, random per-install identifier — not tied to hardware, just
// enough to tell "this device" apart from "some other device" for the
// cross-device pending-sync status ping.
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  const existing = await SecureStore.getItemAsync(STORAGE_KEY);
  if (existing) {
    cached = existing;
    return existing;
  }
  const id = createId();
  await SecureStore.setItemAsync(STORAGE_KEY, id);
  cached = id;
  return id;
}
