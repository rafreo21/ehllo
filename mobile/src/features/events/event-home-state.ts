import type { EventItem } from '@/features/events/events-api';

const DEFAULT_EVENT_WINDOW_MS = 4 * 60 * 60 * 1000;

function eventEndsAtMs(event: EventItem): number {
  const start = Date.parse(event.startsAt);
  let end = event.endsAt ? Date.parse(event.endsAt) : Number.NaN;
  if (Number.isNaN(end)) {
    end = Number.isNaN(start) ? Number.NaN : start + DEFAULT_EVENT_WINDOW_MS;
  }
  if (event.leftAt) {
    const leftAt = Date.parse(event.leftAt);
    if (!Number.isNaN(leftAt)) end = Number.isNaN(end) ? leftAt : Math.min(end, leftAt);
  }
  return end;
}

function eventStartsAtMs(event: EventItem): number {
  const start = Date.parse(event.startsAt);
  return Number.isNaN(start) ? Number.POSITIVE_INFINITY : start;
}

/** Orders events by their scheduled date and time, never by when they were added or synced. */
export function compareEventsByStart(left: EventItem, right: EventItem): number {
  const leftStart = eventStartsAtMs(left);
  const rightStart = eventStartsAtMs(right);
  if (leftStart < rightStart) return -1;
  if (leftStart > rightStart) return 1;
  return left.id.localeCompare(right.id);
}

export function isEventCurrentlyHappening(event: EventItem, now = new Date()): boolean {
  const start = Date.parse(event.startsAt);
  const end = eventEndsAtMs(event);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return start <= now.getTime() && now.getTime() <= end;
}

export function isUpcomingEvent(event: EventItem, now = new Date()): boolean {
  const end = eventEndsAtMs(event);
  return !Number.isNaN(end) && end > now.getTime();
}

/** Splits a user's "going" events into Upcoming (not yet over) and Past (already ended), each sorted soonest/most-recent first. */
export function bucketEvents(events: EventItem[], now = new Date()): { upcoming: EventItem[]; past: EventItem[] } {
  const upcoming: EventItem[] = [];
  const past: EventItem[] = [];
  for (const event of events) {
    (isUpcomingEvent(event, now) ? upcoming : past).push(event);
  }
  upcoming.sort(compareEventsByStart);
  past.sort((left, right) => compareEventsByStart(right, left));
  return { upcoming, past };
}

export type HomeEventCardState =
  | { type: 'none' }
  | { type: 'current'; event: EventItem }
  | { type: 'upcoming'; event: EventItem }
  | { type: 'candidate'; event: EventItem };

/**
 * Picks the single most relevant thing for Home to show — never more than
 * one card, per the "Home stays quiet unless something's actually
 * relevant" design. Priority: an event happening right now beats an
 * upcoming going-event beats an undecided calendar candidate. When more
 * than one going-event is happening right now (an overlap), the one that
 * started most recently wins — same tie-break as the server's
 * resolveCurrentEvent, so Home always agrees with what a captured
 * encounter actually gets tagged to.
 */
export function resolveHomeEventCardState(
  goingEvents: EventItem[],
  candidates: EventItem[],
  now = new Date(),
): HomeEventCardState {
  const happeningNow = goingEvents.filter((event) => isEventCurrentlyHappening(event, now));
  if (happeningNow.length) {
    const current = happeningNow.reduce((latest, event) => (
      Date.parse(event.startsAt) > Date.parse(latest.startsAt) ? event : latest
    ));
    return { type: 'current', event: current };
  }

  const { upcoming } = bucketEvents(goingEvents, now);
  if (upcoming.length) return { type: 'upcoming', event: upcoming[0] };

  const sortedCandidates = candidates
    .filter((event) => isUpcomingEvent(event, now))
    .sort(compareEventsByStart);
  if (sortedCandidates.length) return { type: 'candidate', event: sortedCandidates[0] };

  return { type: 'none' };
}
