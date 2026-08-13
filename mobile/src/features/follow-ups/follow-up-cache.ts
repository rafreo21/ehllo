import AsyncStorage from '@react-native-async-storage/async-storage';

import type { FollowUpItem } from '@/features/follow-ups/follow-up-api';

// v2: FollowUpItem gained eventId/eventTitle — bump so caches written before
// that schema change don't silently serve stale rows missing the fields.
export const FOLLOW_UPS_CACHE_KEY = 'aftermeet.mobile.follow-ups-cache.v2';
export const FOLLOW_UPS_QUEUE_KEY = 'aftermeet.mobile.follow-ups-queue.v1';

export type FollowUpQueueAction = 'complete' | 'reopen' | 'snooze' | 'dismiss';

export type FollowUpQueueEntry = {
  encounterId: string;
  actionId: string;
  action: FollowUpQueueAction;
  queuedAt: string;
  snoozedUntil?: string;
  expectedStatusUpdatedAt?: string;
};

function queueKey(encounterId: string, actionId: string) {
  return `${encounterId}:${actionId}`;
}

export async function readCachedFollowUps(): Promise<FollowUpItem[]> {
  try {
    const raw = await AsyncStorage.getItem(FOLLOW_UPS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as FollowUpItem[] : [];
  } catch {
    return [];
  }
}

export async function writeCachedFollowUps(items: FollowUpItem[]) {
  await AsyncStorage.setItem(FOLLOW_UPS_CACHE_KEY, JSON.stringify(items));
}

export async function readFollowUpQueue(): Promise<FollowUpQueueEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(FOLLOW_UPS_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as FollowUpQueueEntry[] : [];
  } catch {
    return [];
  }
}

async function writeFollowUpQueue(entries: FollowUpQueueEntry[]) {
  await AsyncStorage.setItem(FOLLOW_UPS_QUEUE_KEY, JSON.stringify(entries));
}

// A new enqueue replaces any existing entry for the same action, so an
// offline complete -> reopen collapses to just the final reopen instead of
// queueing both.
export async function enqueueFollowUpAction(entry: FollowUpQueueEntry) {
  const current = await readFollowUpQueue();
  const key = queueKey(entry.encounterId, entry.actionId);
  const next = current.filter((item) => queueKey(item.encounterId, item.actionId) !== key);
  next.push(entry);
  await writeFollowUpQueue(next);
}

export async function dequeueFollowUpAction(encounterId: string, actionId: string) {
  const current = await readFollowUpQueue();
  const key = queueKey(encounterId, actionId);
  await writeFollowUpQueue(current.filter((item) => queueKey(item.encounterId, item.actionId) !== key));
}

export async function setCachedFollowUpStatus(
  encounterId: string,
  actionId: string,
  status: FollowUpItem['status'],
  lifecycle: Partial<Pick<FollowUpItem,
    'completedAt' | 'snoozedUntil' | 'dismissedAt' | 'cancelledAt' | 'statusUpdatedAt'
  >> = {},
) {
  const cached = await readCachedFollowUps();
  const next = cached.map((item) => (
    item.encounterId === encounterId && item.actionId === actionId
      ? { ...item, status, ...lifecycle }
      : item
  ));
  await writeCachedFollowUps(next);
  return next;
}

// Forces queued items' status to reflect local intent even if a fresh
// server fetch hasn't caught up yet — prevents a completed-while-offline
// item from flickering back to open the moment a background poll returns
// stale server data before the queue has flushed.
export function applyFollowUpQueueToItems(items: FollowUpItem[], queue: FollowUpQueueEntry[]): FollowUpItem[] {
  if (!queue.length) return items;
  const byKey = new Map(queue.map((entry) => [queueKey(entry.encounterId, entry.actionId), entry]));
  return items.map((item) => {
    const entry = byKey.get(queueKey(item.encounterId, item.actionId));
    if (!entry) return item;
    if (entry.action === 'complete') {
      return {
        ...item,
        status: 'completed' as const,
        completedAt: item.completedAt || entry.queuedAt,
        snoozedUntil: undefined,
        statusUpdatedAt: entry.queuedAt,
      };
    }
    if (entry.action === 'snooze') {
      return {
        ...item,
        status: 'snoozed' as const,
        snoozedUntil: entry.snoozedUntil,
        statusUpdatedAt: entry.queuedAt,
      };
    }
    if (entry.action === 'dismiss') {
      return {
        ...item,
        status: 'dismissed' as const,
        dismissedAt: entry.queuedAt,
        snoozedUntil: undefined,
        statusUpdatedAt: entry.queuedAt,
      };
    }
    return {
      ...item,
      status: 'open' as const,
      completedAt: undefined,
      dismissedAt: undefined,
      cancelledAt: undefined,
      snoozedUntil: undefined,
      statusUpdatedAt: entry.queuedAt,
    };
  });
}
