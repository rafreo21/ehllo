import AsyncStorage from '@react-native-async-storage/async-storage';

import type { EventAttendanceStatus } from '@/features/events/events-api';
import { mergeEventActionQueue, type EventActionStateEntry } from '@/features/events/event-action-queue-state';

export const EVENT_ACTION_QUEUE_KEY = 'aftermeet.mobile.event-actions-queue.v1';

export type EventActionQueueEntry = EventActionStateEntry & { attendanceStatus?: EventAttendanceStatus };

export async function readEventActionQueue(): Promise<EventActionQueueEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(EVENT_ACTION_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as EventActionQueueEntry[] : [];
  } catch {
    return [];
  }
}

async function writeEventActionQueue(entries: EventActionQueueEntry[]) {
  await AsyncStorage.setItem(EVENT_ACTION_QUEUE_KEY, JSON.stringify(entries));
}

export async function enqueueEventAction(entry: Omit<EventActionQueueEntry, 'queuedAt'>) {
  const current = await readEventActionQueue();
  await writeEventActionQueue(mergeEventActionQueue(current, entry));
}

export async function dequeueEventAction(eventId: string, action: EventActionQueueEntry['action']) {
  const current = await readEventActionQueue();
  await writeEventActionQueue(current.filter((item) => !(item.eventId === eventId && item.action === action)));
}
