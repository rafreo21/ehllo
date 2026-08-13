import "server-only";

import { buildPlainEmailRaw } from "./email";

/** A 401/403 from the provider means the access token itself was rejected — distinct from a 5xx/network blip, since the former means the connection needs reconnecting, not just retrying. */
export class CalendarProviderAuthError extends Error {}

export async function sendGoogleEmail(accessToken: string, input: { to: string; subject: string; body: string }) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: buildPlainEmailRaw(input.to, input.subject, input.body) }),
  });
  if (!response.ok) throw new Error("Gmail rejected this message.");
  return response.json();
}

export async function sendMicrosoftEmail(accessToken: string, input: { to: string; subject: string; body: string }) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType: "Text", content: input.body },
        toRecipients: [{ emailAddress: { address: input.to } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!response.ok) throw new Error("Outlook rejected this message.");
}

function defaultMeetingWindow(dueAt: string) {
  const start = dueAt ? new Date(`${dueAt}T10:00:00`) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return { start, end };
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  input: { title: string; details: string; dueAt: string; attendeeEmail?: string },
) {
  const { start, end } = defaultMeetingWindow(input.dueAt);
  const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: input.title,
      description: input.details,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      ...(input.attendeeEmail ? { attendees: [{ email: input.attendeeEmail }] } : {}),
    }),
  });
  if (!response.ok) throw new Error("Google Calendar rejected this event.");
  return response.json();
}

export async function createMicrosoftCalendarEvent(
  accessToken: string,
  input: { title: string; details: string; dueAt: string; attendeeEmail?: string },
) {
  const { start, end } = defaultMeetingWindow(input.dueAt);
  const response = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subject: input.title,
      body: { contentType: "Text", content: input.details },
      start: { dateTime: start.toISOString(), timeZone: "UTC" },
      end: { dateTime: end.toISOString(), timeZone: "UTC" },
      ...(input.attendeeEmail
        ? { attendees: [{ emailAddress: { address: input.attendeeEmail }, type: "required" }] }
        : {}),
    }),
  });
  if (!response.ok) throw new Error("Outlook Calendar rejected this event.");
  return response.json();
}

export type RawCalendarEvent = {
  externalId: string;
  title: string;
  location: string;
  startsAt: string;
  endsAt: string;
  organizerEmail: string;
  attendeeEmails: string[];
  isRecurring: boolean;
};

type GoogleCalendarListResponse = {
  items?: Array<{
    id?: string;
    summary?: string;
    location?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    organizer?: { email?: string };
    attendees?: Array<{ email?: string }>;
    recurringEventId?: string;
    status?: string;
  }>;
};

/**
 * Lists events in a rolling window from the user's primary Google Calendar.
 * Reuses the same `calendar.events` scope already granted for
 * createGoogleCalendarEvent — no new consent screen for an already-connected
 * account. Cancelled events and all-day entries (date, not dateTime) are
 * dropped: an all-day block rarely represents a single attendable gathering
 * and has no meaningful duration for the candidate filter.
 */
export async function listGoogleCalendarEvents(
  accessToken: string,
  input: { timeMinIso: string; timeMaxIso: string },
): Promise<RawCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: input.timeMinIso,
    timeMax: input.timeMaxIso,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (response.status === 401 || response.status === 403) {
    throw new CalendarProviderAuthError("Google Calendar rejected this token.");
  }
  if (!response.ok) throw new Error("Google Calendar rejected this request.");
  const payload = await response.json() as GoogleCalendarListResponse;

  return (payload.items ?? []).flatMap((item) => {
    if (item.status === "cancelled" || !item.id) return [];
    const startsAt = item.start?.dateTime;
    const endsAt = item.end?.dateTime;
    if (!startsAt || !endsAt) return [];
    return [{
      externalId: item.id,
      title: item.summary?.trim() ?? "",
      location: item.location?.trim() ?? "",
      startsAt,
      endsAt,
      organizerEmail: item.organizer?.email?.trim() ?? "",
      attendeeEmails: (item.attendees ?? []).flatMap((attendee) => attendee.email?.trim() ? [attendee.email.trim()] : []),
      isRecurring: Boolean(item.recurringEventId),
    }];
  });
}

type MicrosoftCalendarViewResponse = {
  value?: Array<{
    id?: string;
    subject?: string;
    location?: { displayName?: string };
    start?: { dateTime?: string };
    end?: { dateTime?: string };
    organizer?: { emailAddress?: { address?: string } };
    attendees?: Array<{ emailAddress?: { address?: string } }>;
    type?: string;
    isCancelled?: boolean;
  }>;
};

/**
 * Lists events in a rolling window via Microsoft Graph's calendarView,
 * which (unlike a raw /events list) already expands recurring series into
 * per-day instances within the window — so `type` tells us instance vs.
 * series membership directly. Reuses the existing Calendars.ReadWrite scope.
 */
export async function listMicrosoftCalendarEvents(
  accessToken: string,
  input: { timeMinIso: string; timeMaxIso: string },
): Promise<RawCalendarEvent[]> {
  const params = new URLSearchParams({
    startDateTime: input.timeMinIso,
    endDateTime: input.timeMaxIso,
    $top: "250",
  });
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarView?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
    },
  );
  if (response.status === 401 || response.status === 403) {
    throw new CalendarProviderAuthError("Outlook Calendar rejected this token.");
  }
  if (!response.ok) throw new Error("Outlook Calendar rejected this request.");
  const payload = await response.json() as MicrosoftCalendarViewResponse;

  return (payload.value ?? []).flatMap((item) => {
    if (item.isCancelled || !item.id) return [];
    const startsAt = item.start?.dateTime;
    const endsAt = item.end?.dateTime;
    if (!startsAt || !endsAt) return [];
    return [{
      externalId: item.id,
      title: item.subject?.trim() ?? "",
      location: item.location?.displayName?.trim() ?? "",
      // Graph returns naive local-time strings for the requested timezone
      // (UTC, forced via the Prefer header above) rather than an offset —
      // appending "Z" makes them parse as the UTC instants they represent.
      startsAt: `${startsAt}Z`,
      endsAt: `${endsAt}Z`,
      organizerEmail: item.organizer?.emailAddress?.address?.trim() ?? "",
      attendeeEmails: (item.attendees ?? []).flatMap((attendee) => (
        attendee.emailAddress?.address?.trim() ? [attendee.emailAddress.address.trim()] : []
      )),
      isRecurring: item.type !== "singleInstance",
    }];
  });
}
