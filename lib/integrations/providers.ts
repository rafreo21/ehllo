import "server-only";

import { buildPlainEmailRaw } from "./email";
import type { IntegrationProvider } from "./types";

/** A 401/403 from the provider means the access token itself was rejected - distinct from a 5xx/network blip, since the former means the connection needs reconnecting, not just retrying. */
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
  cancelled: boolean;
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
 * createGoogleCalendarEvent - no new consent screen for an already-connected
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
    showDeleted: "true",
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

  // Annotated so the cancelled and active branches unify as RawCalendarEvent.
  // Left inferred, TypeScript widens each branch separately and then rejects the
  // callback against flatMap's signature.
  return (payload.items ?? []).flatMap((item): RawCalendarEvent[] => {
    if (!item.id) return [];
    if (item.status === "cancelled") return [{
      externalId: item.id, title: item.summary?.trim() ?? "", location: "", startsAt: "", endsAt: "",
      organizerEmail: item.organizer?.email?.trim() ?? "", attendeeEmails: [], isRecurring: Boolean(item.recurringEventId), cancelled: true,
    }];
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
      cancelled: false,
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
 * per-day instances within the window - so `type` tells us instance vs.
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

  return (payload.value ?? []).flatMap((item): RawCalendarEvent[] => {
    if (!item.id) return [];
    if (item.isCancelled) return [{
      externalId: item.id, title: item.subject?.trim() ?? "", location: "", startsAt: "", endsAt: "",
      organizerEmail: item.organizer?.emailAddress?.address?.trim() ?? "", attendeeEmails: [], isRecurring: item.type !== "singleInstance", cancelled: true,
    }];
    const startsAt = item.start?.dateTime;
    const endsAt = item.end?.dateTime;
    if (!startsAt || !endsAt) return [];
    return [{
      externalId: item.id,
      title: item.subject?.trim() ?? "",
      location: item.location?.displayName?.trim() ?? "",
      // Graph returns naive local-time strings for the requested timezone
      // (UTC, forced via the Prefer header above) rather than an offset -
      // appending "Z" makes them parse as the UTC instants they represent.
      startsAt: `${startsAt}Z`,
      endsAt: `${endsAt}Z`,
      organizerEmail: item.organizer?.emailAddress?.address?.trim() ?? "",
      attendeeEmails: (item.attendees ?? []).flatMap((attendee) => (
        attendee.emailAddress?.address?.trim() ? [attendee.emailAddress.address.trim()] : []
      )),
      isRecurring: item.type !== "singleInstance",
      cancelled: false,
    }];
  });
}

/**
 * A real event, as opposed to the follow-up meeting window that
 * createGoogleCalendarEvent builds from a due date. That one derives its own
 * start and end and throws the provider's id away, so it cannot be updated or
 * cancelled later; these carry explicit instants and hand the id back so ehllo
 * can keep the two sides pointing at each other.
 */
export type ProviderCalendarEventPayload = {
  title: string;
  details?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
};

/** The provider already forgot this event, so there is nothing left to do. */
export class CalendarProviderGoneError extends Error {}

function googleEventBody(payload: ProviderCalendarEventPayload) {
  return {
    summary: payload.title,
    ...(payload.details ? { description: payload.details } : {}),
    ...(payload.location ? { location: payload.location } : {}),
    start: { dateTime: new Date(payload.startsAt).toISOString() },
    end: { dateTime: new Date(payload.endsAt).toISOString() },
  };
}

function microsoftEventBody(payload: ProviderCalendarEventPayload) {
  return {
    subject: payload.title,
    ...(payload.details ? { body: { contentType: "Text", content: payload.details } } : {}),
    ...(payload.location ? { location: { displayName: payload.location } } : {}),
    start: { dateTime: new Date(payload.startsAt).toISOString(), timeZone: "UTC" },
    end: { dateTime: new Date(payload.endsAt).toISOString(), timeZone: "UTC" },
  };
}

function assertCalendarResponse(response: Response, provider: IntegrationProvider) {
  if (response.status === 401 || response.status === 403) {
    throw new CalendarProviderAuthError(
      provider === "google" ? "Google Calendar rejected this token." : "Outlook Calendar rejected this token.",
    );
  }
  // 404/410 on an update or cancel means the entry is already gone from the
  // provider. That is a settled outcome, not a failure to retry forever.
  if (response.status === 404 || response.status === 410) {
    throw new CalendarProviderGoneError("The calendar no longer has this event.");
  }
  if (!response.ok) {
    throw new Error(
      provider === "google" ? "Google Calendar rejected this request." : "Outlook Calendar rejected this request.",
    );
  }
}

const CALENDAR_ENDPOINTS = {
  google: {
    collection: "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    item: (externalId: string) =>
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(externalId)}`,
  },
  microsoft: {
    collection: "https://graph.microsoft.com/v1.0/me/events",
    item: (externalId: string) => `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(externalId)}`,
  },
} as const;

/** Creates the event and returns the provider's id for it. */
export async function createProviderCalendarEvent(
  provider: IntegrationProvider,
  accessToken: string,
  payload: ProviderCalendarEventPayload,
): Promise<string> {
  const response = await fetch(CALENDAR_ENDPOINTS[provider].collection, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(provider === "google" ? googleEventBody(payload) : microsoftEventBody(payload)),
  });
  assertCalendarResponse(response, provider);
  const created = await response.json() as { id?: string };
  if (!created.id) throw new Error("The calendar did not return an event id.");
  return created.id;
}

export async function updateProviderCalendarEvent(
  provider: IntegrationProvider,
  accessToken: string,
  externalId: string,
  payload: ProviderCalendarEventPayload,
): Promise<void> {
  const response = await fetch(CALENDAR_ENDPOINTS[provider].item(externalId), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(provider === "google" ? googleEventBody(payload) : microsoftEventBody(payload)),
  });
  assertCalendarResponse(response, provider);
}

export async function cancelProviderCalendarEvent(
  provider: IntegrationProvider,
  accessToken: string,
  externalId: string,
): Promise<void> {
  const response = await fetch(CALENDAR_ENDPOINTS[provider].item(externalId), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // A delete that finds nothing has still achieved what it was asked to.
  if (response.status === 404 || response.status === 410) return;
  assertCalendarResponse(response, provider);
}
