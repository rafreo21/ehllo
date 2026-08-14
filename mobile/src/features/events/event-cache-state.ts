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

export function applyCachedLeftAt(events: EventItem[], eventId: string, leftAt: string | null): EventItem[] {
  return events.map((event) => event.id === eventId ? { ...event, leftAt } : event);
}
