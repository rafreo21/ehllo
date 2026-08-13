import { mobileFetch, readMobileApiJson } from '@/lib/mobile-api';
import { readCachedEvents, writeCachedEvents } from '@/features/events/event-cache';
import { enqueueEventAction } from '@/features/events/event-action-queue';
import { isOnline } from '@/lib/connectivity';

export type EventSource = 'manual' | 'link' | 'calendar';
export type EventAttendanceStatus = 'going' | 'not_going';

/**
 * "ok" — synced fine. "not_connected" — provider was never linked, a normal
 * state. "needs_reconnect" — a connection exists but its token is dead
 * (revoked grant, provider rejected the refresh) and nothing will sync
 * again until the user reconnects. "error" — a transient failure, worth
 * retrying, not worth alarming the user about.
 */
export type CalendarProviderStatus = 'ok' | 'not_connected' | 'needs_reconnect' | 'error';

export type EventCandidatesResult = {
  candidates: EventItem[];
  providerStatus: { google: CalendarProviderStatus; microsoft: CalendarProviderStatus };
  syncedAt: string;
};

export type EventItem = {
  id: string;
  title: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  leftAt?: string | null;
  source: EventSource;
  sourceUrl: string;
  organizerEmail: string;
};

function mapEvent(row: Record<string, unknown>): EventItem {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    location: String(row.location ?? ''),
    startsAt: String(row.startsAt ?? ''),
    endsAt: typeof row.endsAt === 'string' ? row.endsAt : null,
    leftAt: typeof row.leftAt === 'string' ? row.leftAt : null,
    source: (row.source as EventSource) ?? 'manual',
    sourceUrl: String(row.sourceUrl ?? ''),
    organizerEmail: String(row.organizerEmail ?? ''),
  };
}

/** Events the user is going to — see GET /api/events. Candidates awaiting a decision are separate, see fetchEventCandidates. */
export async function fetchMyEvents(accessToken: string): Promise<EventItem[]> {
  try {
    const response = await mobileFetch('/api/events', accessToken);
    const payload = await readMobileApiJson<{ events?: Record<string, unknown>[]; error?: string }>(
      response,
      'Could not read your events from AfterMeet.',
    );
    if (!response.ok) throw new Error(payload.error || 'Could not load your events.');
    const events = (payload.events ?? []).map(mapEvent);
    await writeCachedEvents(events);
    return events;
  } catch (error) {
    const cached = await readCachedEvents();
    if (cached.length) return cached;
    throw error;
  }
}

export async function fetchEventCandidates(accessToken: string): Promise<EventCandidatesResult> {
  const response = await mobileFetch('/api/events/candidates', accessToken);
  const payload = await readMobileApiJson<{
    candidates?: Record<string, unknown>[];
    providerStatus?: { google?: CalendarProviderStatus; microsoft?: CalendarProviderStatus };
    syncedAt?: string;
    error?: string;
  }>(response, 'Could not read suggested events from your calendar.');
  if (!response.ok) throw new Error(payload.error || 'Could not load suggested events.');
  return {
    candidates: (payload.candidates ?? []).map(mapEvent),
    providerStatus: {
      google: payload.providerStatus?.google ?? 'not_connected',
      microsoft: payload.providerStatus?.microsoft ?? 'not_connected',
    },
    syncedAt: payload.syncedAt ?? new Date().toISOString(),
  };
}

/** Manually-added and pasted-link events are returned undecided so the same Going/Not going flow applies to every source. */
export async function createEvent(
  accessToken: string,
  input: { title: string; location?: string; startsAt: string; endsAt?: string; sourceUrl?: string },
): Promise<EventItem> {
  const response = await mobileFetch('/api/events', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await readMobileApiJson<{ ok?: boolean; event?: Record<string, unknown>; error?: string }>(
    response,
    'Could not read the event save response.',
  );
  if (!response.ok || !payload.ok || !payload.event) throw new Error(payload.error || 'Could not save this event.');
  return mapEvent(payload.event);
}

export async function sendEventAttendance(accessToken: string, eventId: string, status: EventAttendanceStatus) {
  const response = await mobileFetch(`/api/events/${encodeURIComponent(eventId)}/attendance`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const payload = await readMobileApiJson<{ ok?: boolean; error?: string }>(
    response,
    'Could not read the attendance response.',
  );
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not update your attendance.');
}

export async function setEventAttendance(accessToken: string, eventId: string, status: EventAttendanceStatus) {
  if (!isOnline()) {
    await enqueueEventAction({ eventId, action: 'attendance', attendanceStatus: status });
    return;
  }
  await sendEventAttendance(accessToken, eventId, status);
}

/** "I've left" — caps this event's effective end at now for passive-attach, without changing its real end time. Pass left: false to undo. */
export async function sendEventLeft(accessToken: string, eventId: string, left = true) {
  const response = await mobileFetch(`/api/events/${encodeURIComponent(eventId)}/leave`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ left }),
  });
  const payload = await readMobileApiJson<{ ok?: boolean; error?: string }>(
    response,
    'Could not read the response.',
  );
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not update this event.');
}


export async function markEventLeft(accessToken: string, eventId: string, left = true) {
  if (!isOnline()) {
    await enqueueEventAction({ eventId, action: 'leave', left });
    return;
  }
  await sendEventLeft(accessToken, eventId, left);
}

export type ExtractedEventInfo = {
  title: string;
  location: string;
  startsAt: string | null;
  endsAt: string | null;
};

export async function extractEventFromLink(accessToken: string, url: string): Promise<ExtractedEventInfo> {
  const response = await mobileFetch('/api/events/extract', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const payload = await readMobileApiJson<{ ok?: boolean; event?: ExtractedEventInfo; error?: string }>(
    response,
    'Could not read that link.',
  );
  if (!response.ok || !payload.event) throw new Error(payload.error || 'Could not read that link.');
  return payload.event;
}
