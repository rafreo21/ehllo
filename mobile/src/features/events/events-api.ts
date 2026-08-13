import { isNetworkError, mobileFetch, readMobileApiJson } from '@/lib/mobile-api';
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
  status: 'scheduled' | 'cancelled';
  updatedAt: string;
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
    status: row.status === 'cancelled' ? 'cancelled' : 'scheduled',
    updatedAt: String(row.updatedAt ?? ''),
  };
}

export class EventUpdateConflictError extends Error {
  latestEvent?: EventItem;

  constructor(message: string, latestEvent?: EventItem) {
    super(message);
    this.name = 'EventUpdateConflictError';
    this.latestEvent = latestEvent;
  }
}

export async function updateEvent(
  accessToken: string,
  eventId: string,
  input: { title?: string; location?: string; startsAt?: string; endsAt?: string | null; status?: 'scheduled' | 'cancelled'; expectedUpdatedAt?: string },
): Promise<{ event: EventItem; emailsSent: number; emailsFailed: number }> {
  const response = await mobileFetch(`/api/events/${encodeURIComponent(eventId)}`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await readMobileApiJson<{ event?: Record<string, unknown>; emailsSent?: number; emailsFailed?: number; error?: string; conflict?: boolean }>(
    response,
    'Could not read the event update response.',
  );
  if (response.status === 409 && payload.conflict) {
    throw new EventUpdateConflictError(
      payload.error || 'This event changed on another device.',
      payload.event ? mapEvent(payload.event) : undefined,
    );
  }
  if (!response.ok || !payload.event) throw new Error(payload.error || 'Could not update this event.');
  return { event: mapEvent(payload.event), emailsSent: payload.emailsSent ?? 0, emailsFailed: payload.emailsFailed ?? 0 };
}

/** Events the user is going to — see GET /api/events. Candidates awaiting a decision are separate, see fetchEventCandidates. */
export async function fetchMyEvents(
  accessToken: string,
  options: { allowCacheFallback?: boolean } = {},
): Promise<EventItem[]> {
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
    if (options.allowCacheFallback !== false) {
      const cached = await readCachedEvents();
      if (cached.length) return cached;
    }
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

export async function inviteEventGuest(accessToken: string, eventId: string, email: string) {
  const response = await mobileFetch(`/api/events/${encodeURIComponent(eventId)}/invitations`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const payload = await readMobileApiJson<{ ok?: boolean; guestUrl?: string; emailSent?: boolean; warning?: string; error?: string }>(
    response,
    'Could not read the event invitation response.',
  );
  if (!response.ok || !payload.ok || !payload.guestUrl) throw new Error(payload.error || 'Could not invite this guest.');
  return { guestUrl: payload.guestUrl, emailSent: Boolean(payload.emailSent), warning: payload.warning || '' };
}

export type EventInvitation = {
  id: string;
  email: string;
  status: 'invited' | 'going' | 'not_going' | 'revoked';
  respondedAt: string | null;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deliveryStatus: 'pending' | 'processing' | 'sent' | 'failed' | null;
  deliveryError: string;
};

export async function fetchEventInvitations(accessToken: string, eventId: string): Promise<EventInvitation[]> {
  const response = await mobileFetch(`/api/events/${encodeURIComponent(eventId)}/invitations`, accessToken);
  const payload = await readMobileApiJson<{ invitations?: EventInvitation[]; error?: string }>(
    response,
    'Could not read this event’s invitations.',
  );
  if (!response.ok) throw new Error(payload.error || 'Could not load this event’s invitations.');
  return payload.invitations ?? [];
}

export async function revokeEventInvitation(accessToken: string, eventId: string, invitationId: string) {
  const response = await mobileFetch(`/api/events/${encodeURIComponent(eventId)}/invitations`, accessToken, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invitationId }),
  });
  const payload = await readMobileApiJson<{ ok?: boolean; error?: string }>(
    response,
    'Could not read the invitation update response.',
  );
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not revoke this invitation.');
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
  try {
    await sendEventAttendance(accessToken, eventId, status);
  } catch (error) {
    // NetInfo can briefly retain the previous online state after iOS loses
    // connectivity. A failed request is the authoritative offline signal:
    // keep the user's choice locally and let foreground sync retry it.
    if (!isNetworkError(error)) throw error;
    await enqueueEventAction({ eventId, action: 'attendance', attendanceStatus: status });
  }
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
  try {
    await sendEventLeft(accessToken, eventId, left);
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    await enqueueEventAction({ eventId, action: 'leave', left });
  }
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
