import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EventSnapshot } from '@/features/events/event-cache';

export const OFFLINE_SCAN_QUEUE_KEY = 'aftermeet.mobile.offline-scan-queue.v1';

export type OfflineScanEntry = {
  slug: string;
  queuedAt: string;
  eventSnapshot?: EventSnapshot;
};

export async function readOfflineScanQueue(): Promise<OfflineScanEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_SCAN_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as OfflineScanEntry[] : [];
  } catch {
    return [];
  }
}

async function writeOfflineScanQueue(entries: OfflineScanEntry[]) {
  await AsyncStorage.setItem(OFFLINE_SCAN_QUEUE_KEY, JSON.stringify(entries));
}

// A rescan of the same card while still offline collapses to one queued
// entry instead of piling up duplicates.
export async function enqueueOfflineScan(slug: string, eventSnapshot?: EventSnapshot) {
  const normalized = slug.trim().toLowerCase();
  const current = await readOfflineScanQueue();
  const next = current.filter((item) => item.slug !== normalized);
  next.push({ slug: normalized, queuedAt: new Date().toISOString(), eventSnapshot });
  await writeOfflineScanQueue(next);
}

export async function dequeueOfflineScan(slug: string) {
  const current = await readOfflineScanQueue();
  const next = current.filter((item) => item.slug !== slug);
  if (next.length !== current.length) await writeOfflineScanQueue(next);
}
