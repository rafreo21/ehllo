import type { EventItem } from '@/features/events/events-api';

const DEFAULT_EVENT_WINDOW_MS = 4 * 60 * 60 * 1000;

function eventEndsAtMs(event: EventItem): number {
  const start = Date.parse(event.startsAt);
  let end = event.endsAt ? Date.parse(event.endsAt) : Number.NaN;
  // Link metadata is not always trustworthy: some pages expose an end time
  // with the wrong date or timezone. An end before the start is equivalent
  // to no usable end, not evidence that a future event belongs in Past.
  if (Number.isNaN(end) || (!Number.isNaN(start) && end < start)) {
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

export type PastEventGroupKey = 'notGoing' | 'attended' | 'didNotAttend' | 'cancelled';

export type EventListGroups = {
  upcoming: EventItem[];
  past: Record<PastEventGroupKey, EventItem[]>;
};

/**
 * Whether this row's action sheet can still offer "I'm going after all".
 * Reversal is a statement about time, not about which group the row is
 * filed under: an event that has not finished can still be attended, and one
 * that has finished can only be recreated. Deriving it here keeps the sheet
 * and the list from ever disagreeing.
 */
export function canRejoinEvent(event: EventItem, now = new Date()): boolean {
  return event.status !== 'cancelled'
    && event.attendanceStatus === 'not_going'
    && isUpcomingEvent(event, now);
}

/**
 * Splits every decided event into the list's sections.
 *
 * Upcoming stays strictly "going, not finished". Past holds the rest, but as
 * named groups rather than one undifferentiated pile, because a declined
 * event next Thursday has not happened — filing it under a flat "Past" would
 * make the product state something untrue, and it is exactly the row a user
 * needs to find when they change their mind.
 *
 * Cancelled events leave Upcoming whatever the user answered; an event that
 * is not happening should never sit in the list of things they are going to.
 */
export function groupEventsForList(events: EventItem[], now = new Date()): EventListGroups {
  const upcoming: EventItem[] = [];
  const past: Record<PastEventGroupKey, EventItem[]> = {
    notGoing: [],
    attended: [],
    didNotAttend: [],
    cancelled: [],
  };

  for (const event of events) {
    if (event.status === 'cancelled') {
      past.cancelled.push(event);
      continue;
    }
    const stillToCome = isUpcomingEvent(event, now);
    if (event.attendanceStatus === 'going') {
      (stillToCome ? upcoming : past.attended).push(event);
      continue;
    }
    (stillToCome ? past.notGoing : past.didNotAttend).push(event);
  }

  upcoming.sort(compareEventsByStart);
  // "Not going" holds events that are still ahead, so soonest-first matches
  // how a user reads them. Everything else has already happened and reads
  // most-recent-first.
  past.notGoing.sort(compareEventsByStart);
  for (const key of ['attended', 'didNotAttend', 'cancelled'] as const) {
    past[key].sort((left, right) => compareEventsByStart(right, left));
  }

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
