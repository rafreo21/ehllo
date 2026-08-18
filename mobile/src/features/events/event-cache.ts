import { scopedStorage as AsyncStorage } from '@/lib/scoped-storage';

import type { EventItem } from '@/features/events/events-api';
import { isEventCurrentlyHappening } from '@/features/events/event-home-state';
import { applyCachedAttendance, applyCachedCheckIn, applyCachedLeftAt } from '@/features/events/event-cache-state';

const EVENTS_CACHE_KEY = 'aftermeet.mobile.events-cache.v1';

export type EventSnapshot = {
  eventId: string;
  eventTitle: string;
  eventLocation: string;
  occurredAt: string;
};

export async function readCachedEvents(): Promise<EventItem[]> {
  try {
    const raw = await AsyncStorage.getItem(EVENTS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as EventItem[] : [];
  } catch {
    return [];
  }
}

export async function writeCachedEvents(events: EventItem[]) {
  await AsyncStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(events));
}

export async function cacheEventAttendance(event: EventItem, status: 'going' | 'not_going') {
  await writeCachedEvents(applyCachedAttendance(await readCachedEvents(), event, status));
}

export async function cacheEventLeftAt(eventId: string, leftAt: string | null) {
  await writeCachedEvents(applyCachedLeftAt(await readCachedEvents(), eventId, leftAt));
}

export async function cacheEventCheckIn(eventId: string, checkedInAt: string | null) {
  await writeCachedEvents(applyCachedCheckIn(await readCachedEvents(), eventId, checkedInAt));
}

/**
 * The offline counterpart of resolveCurrentEvent. It must apply the same
 * precedence - an explicit check-in beats the most-recently-started guess -
 * or a capture made in a venue with no signal attributes to a different event
 * than the identical capture made with a bar of reception.
 */
export function resolveEventSnapshot(events: EventItem[], occurredAt = new Date()): EventSnapshot | undefined {
  const active = events.filter((event) => isEventCurrentlyHappening(event, occurredAt));
  if (!active.length) return undefined;
  const checkedIn = active
    .filter((candidate) => {
      if (!candidate.checkedInAt) return false;
      const at = Date.parse(candidate.checkedInAt);
      return !Number.isNaN(at) && at <= occurredAt.getTime();
    })
    .sort((left, right) => Date.parse(right.checkedInAt!) - Date.parse(left.checkedInAt!));
  const event = checkedIn[0] ?? active.reduce((latest, candidate) => (
    Date.parse(candidate.startsAt) > Date.parse(latest.startsAt) ? candidate : latest
  ));
  return {
    eventId: event.id,
    eventTitle: event.title,
    eventLocation: event.location,
    occurredAt: occurredAt.toISOString(),
  };
}

export async function resolveCachedEventSnapshot(occurredAt = new Date()) {
  return resolveEventSnapshot(await readCachedEvents(), occurredAt);
}
