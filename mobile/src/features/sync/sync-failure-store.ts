import { scopedStorage as AsyncStorage } from '@/lib/scoped-storage';

import { describeError } from '@/lib/friendly-error';

const SYNC_FAILURES_KEY = 'aftermeet.mobile.sync-failures.v1';

export type SyncFailure = {
  key: string;
  attempts: number;
  lastAttemptAt: string;
  message: string;
};

export function syncErrorMessage(error: unknown) {
  return describeError(error, 'ehllo could not sync this item. It remains saved on this device.');
}

export async function readSyncFailures(): Promise<SyncFailure[]> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_FAILURES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as SyncFailure[] : [];
  } catch {
    return [];
  }
}

export async function recordSyncFailure(key: string, error: unknown) {
  const current = await readSyncFailures();
  const previous = current.find((item) => item.key === key);
  const next = current.filter((item) => item.key !== key);
  next.push({
    key,
    attempts: (previous?.attempts ?? 0) + 1,
    lastAttemptAt: new Date().toISOString(),
    message: syncErrorMessage(error),
  });
  await AsyncStorage.setItem(SYNC_FAILURES_KEY, JSON.stringify(next));
}

export async function clearSyncFailure(key: string) {
  const current = await readSyncFailures();
  const next = current.filter((item) => item.key !== key);
  if (next.length !== current.length) await AsyncStorage.setItem(SYNC_FAILURES_KEY, JSON.stringify(next));
}

export async function retainSyncFailures(keys: Set<string>) {
  const current = await readSyncFailures();
  const next = current.filter((item) => keys.has(item.key));
  if (next.length !== current.length) await AsyncStorage.setItem(SYNC_FAILURES_KEY, JSON.stringify(next));
  return next;
}

export const syncFailureKey = {
  scan: (slug: string) => `scan:${slug}`,
  quickFollowUp: (id: string) => `quick-follow-up:${id}`,
  followUpAction: (encounterId: string, actionId: string) => `follow-up:${encounterId}:${actionId}`,
  transcription: (encounterId: string) => `transcription:${encounterId}`,
  eventAction: (eventId: string, action: string) => `event:${eventId}:${action}`,
  cardChange: (cardId: string) => `card-change:${cardId}`,
  cardDelete: (cardId: string) => `card-delete:${cardId}`,
};
