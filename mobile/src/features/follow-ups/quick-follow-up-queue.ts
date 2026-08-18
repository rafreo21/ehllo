import { scopedStorage as AsyncStorage } from '@/lib/scoped-storage';

import type { QuickFollowUpItem, QuickFollowUpTarget } from '@/features/follow-ups/quick-follow-up-types';
import type { EventSnapshot } from '@/features/events/event-cache';

export const QUICK_FOLLOW_UP_QUEUE_KEY = 'aftermeet.mobile.quick-follow-up-queue.v1';

export type QuickFollowUpQueueEntry = QuickFollowUpTarget & {
  id: string;
  followUps: QuickFollowUpItem[];
  queuedAt: string;
  eventSnapshot?: EventSnapshot;
};

export async function readQuickFollowUpQueue(): Promise<QuickFollowUpQueueEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(QUICK_FOLLOW_UP_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as QuickFollowUpQueueEntry[] : [];
  } catch {
    return [];
  }
}

async function writeQuickFollowUpQueue(entries: QuickFollowUpQueueEntry[]) {
  await AsyncStorage.setItem(QUICK_FOLLOW_UP_QUEUE_KEY, JSON.stringify(entries));
}

export async function enqueueQuickFollowUp(entry: Omit<QuickFollowUpQueueEntry, 'id' | 'queuedAt'>) {
  const current = await readQuickFollowUpQueue();
  const next = [...current, {
    ...entry,
    id: `qfu-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    queuedAt: new Date().toISOString(),
  }];
  await writeQuickFollowUpQueue(next);
}

export async function dequeueQuickFollowUp(id: string) {
  const current = await readQuickFollowUpQueue();
  const next = current.filter((item) => item.id !== id);
  if (next.length !== current.length) await writeQuickFollowUpQueue(next);
}
