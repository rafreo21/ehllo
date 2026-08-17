import type { EventItem } from '@/features/events/events-api';

export function applyCachedAttendance(
  events: EventItem[],
  event: EventItem,
  status: 'going' | 'not_going',
): EventItem[] {
  if (status === 'not_going') return events.filter((item) => item.id !== event.id);
  const fresh = { ...event, leftAt: null };
  return events.some((item) => item.id === event.id)
    ? events.map((item) => item.id === event.id ? fresh : item)
    : [...events, fresh];
}

/**
 * Mirrors the server's one-place-at-a-time rule: checking in anywhere clears
 * every other open check-in, so the offline snapshot can never be ambiguous
 * either.
 */
export function applyCachedCheckIn(events: EventItem[], eventId: string, checkedInAt: string | null): EventItem[] {
  return events.map((event) => {
    if (event.id === eventId) {
      return { ...event, checkedInAt, ...(checkedInAt ? { leftAt: null } : {}) };
    }
    return checkedInAt && event.checkedInAt ? { ...event, checkedInAt: null } : event;
  });
}

export function applyCachedLeftAt(events: EventItem[], eventId: string, leftAt: string | null): EventItem[] {
  return events.map((event) => event.id === eventId ? { ...event, leftAt } : event);
}
