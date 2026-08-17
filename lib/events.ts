export const EVENT_SOURCES = ["manual", "link", "calendar"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export const EVENT_ATTENDANCE_STATUSES = ["going", "not_going"] as const;
export type EventAttendanceStatus = (typeof EVENT_ATTENDANCE_STATUSES)[number];

const VIRTUAL_LOCATION_PATTERN = /zoom\.us|meet\.google\.com|teams\.microsoft\.com|webex\.com/i;

export function isVirtualLocation(location: string): boolean {
  return VIRTUAL_LOCATION_PATTERN.test(location.trim());
}

function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

/**
 * Counts attendees whose email domain differs from the user's own — the
 * "external, not just an internal sync" signal a calendar candidate needs
 * to be worth surfacing. Case/whitespace-insensitive, dedupes repeats, and
 * excludes the user's own address if it's listed among the attendees.
 */
export function externalAttendeeCount(attendeeEmails: string[], userEmail: string): number {
  const ownDomain = emailDomain(userEmail);
  const ownEmail = userEmail.trim().toLowerCase();
  if (!ownDomain) return 0;
  const external = new Set<string>();
  for (const raw of attendeeEmails) {
    const email = raw.trim().toLowerCase();
    if (!email || email === ownEmail) continue;
    if (emailDomain(email) !== ownDomain) external.add(email);
  }
  return external.size;
}

export type CalendarCandidateInput = {
  startsAt: string;
  endsAt: string;
  location: string;
  attendeeEmails: string[];
  userEmail: string;
  isRecurring: boolean;
};

const MIN_CANDIDATE_DURATION_MINUTES = 45;

/**
 * Decides whether a calendar entry is worth surfacing as an event
 * candidate, using only structural signals (recurrence, duration) rather
 * than matching event-sounding words in the title — title keyword matching
 * has no reliable stopping point across languages/styles and produces
 * exactly the false positives ("are you attending your dentist?") that make
 * an inference feature feel dumb. Virtual and physical locations are
 * treated the same — an RSVP is an RSVP regardless of venue, and a bare
 * self-added block (no formal invite, no attendees) is just as often a real
 * event as a calendar invite is — many physical events get added to a
 * calendar by hand, not sent as an invite, so attendee presence isn't
 * required.
 */
export function isEventCandidateWorthy(input: CalendarCandidateInput): boolean {
  if (input.isRecurring) return false;

  const start = Date.parse(input.startsAt);
  const end = Date.parse(input.endsAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return false;
  if ((end - start) / 60_000 < MIN_CANDIDATE_DURATION_MINUTES) return false;

  return true;
}

export type GoingEventWindow = {
  id: string;
  startsAt: string;
  endsAt?: string | null;
  // Set when the user tapped "I've left" — caps this event's effective end
  // for presence purposes without touching its real scheduled end time.
  leftAt?: string | null;
  /** When the user confirmed they are physically here. Outranks the time window. */
  checkedInAt?: string | null;
};

// Events synced without an explicit end (some calendar entries, and every
// manually-added event that left "end" blank) are assumed to run this long
// for the purpose of deciding whether "now" falls inside their window.
const DEFAULT_EVENT_WINDOW_MS = 4 * 60 * 60 * 1000;

/**
 * The passive-presence decision: given the events a user is "going" to,
 * which one (if any) is the current context right now. An event whose
 * window contains `now` is a match; "I've left" (leftAt) caps that window
 * early.
 *
 * Among matches, an explicit check-in wins. Only when nobody has said where
 * they are does this fall back to the old heuristic — the most recently
 * started event — on the theory that the one you arrived at last is the one
 * you are most likely still at. That heuristic is fine for a single event and
 * a coin toss for two overlapping ones, which is exactly why check-in exists.
 * A wrong guess costs one tap to correct on the encounter (the event chip is
 * editable); asking the user to disambiguate on every capture would cost more
 * than it saves.
 */
export function resolveCurrentEvent(goingEvents: GoingEventWindow[], now: Date = new Date()): string | null {
  const nowMs = now.getTime();
  const matches = goingEvents.filter((event) => {
    const start = Date.parse(event.startsAt);
    if (Number.isNaN(start)) return false;
    let end = event.endsAt ? Date.parse(event.endsAt) : start + DEFAULT_EVENT_WINDOW_MS;
    if (Number.isNaN(end) || end < start) end = start + DEFAULT_EVENT_WINDOW_MS;
    if (event.leftAt) {
      const leftAt = Date.parse(event.leftAt);
      if (!Number.isNaN(leftAt)) end = Math.min(end, leftAt);
    }
    return start <= nowMs && nowMs <= end;
  });
  if (!matches.length) return null;

  // An explicit check-in outranks the clock. Two events overlapping on the same
  // afternoon are otherwise decided by whichever started most recently — a
  // guess that silently attributes scanned cards, exchanges, encounters and
  // their follow-ups to the wrong event. If the user has said where they are,
  // that answer wins, and the most recent check-in wins among several.
  //
  // A check-in still has to fall inside the matched window above, so one the
  // user forgets to close expires with the event instead of capturing every
  // scan they make for the rest of the week.
  const checkedIn = matches
    .filter((event) => {
      if (!event.checkedInAt) return false;
      const at = Date.parse(event.checkedInAt);
      return !Number.isNaN(at) && at <= nowMs;
    })
    .sort((left, right) => Date.parse(right.checkedInAt!) - Date.parse(left.checkedInAt!));
  if (checkedIn.length) return checkedIn[0].id;

  return matches.reduce((latest, event) => (
    Date.parse(event.startsAt) > Date.parse(latest.startsAt) ? event : latest
  )).id;
}

/**
 * Buckets a timestamp to the nearest 30 minutes of its time-of-day (UTC),
 * ignoring the date entirely — a standing weekly block repeats at the same
 * clock time even though its calendar date moves every week.
 */
function suppressionTimeSlot(startsAt: string): string {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return "unknown";
  const rounded = Math.round(date.getUTCMinutes() / 30) * 30;
  const hour = (date.getUTCHours() + (rounded === 60 ? 1 : 0)) % 24;
  const minute = rounded === 60 ? 0 : rounded;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Identifies a calendar entry for the dismiss-and-suppress list: once a
 * user says "not going" to a candidate, this key (organizer + title + time
 * of day) is remembered so the same recurring-in-spirit entry (e.g. a
 * standing "Dentist" block with no formal recurrence rule) doesn't get
 * re-suggested. Time-of-day is part of the key — without it, declining one
 * meeting permanently hides every future meeting anyone ever reuses that
 * exact title for, even an unrelated one at a completely different time.
 */
export function candidateSuppressionKey(organizerEmail: string, title: string, startsAt: string): string {
  return `${organizerEmail.trim().toLowerCase()}::${title.trim().toLowerCase()}::${suppressionTimeSlot(startsAt)}`;
}
