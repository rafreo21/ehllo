import AsyncStorage from '@react-native-async-storage/async-storage';

import type { EventItem } from '@/features/events/events-api';
import { isEventCurrentlyHappening } from '@/features/events/event-home-state';

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

export function resolveEventSnapshot(events: EventItem[], occurredAt = new Date()): EventSnapshot | undefined {
  const active = events.filter((event) => isEventCurrentlyHappening(event, occurredAt));
  if (!active.length) return undefined;
  const event = active.reduce((latest, candidate) => (
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
