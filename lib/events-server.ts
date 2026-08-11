import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "./auth/context";
import { candidateSuppressionKey, isEventCandidateWorthy, resolveCurrentEvent, type EventSource } from "./events";
import { getConnectedAccountAccessToken } from "./integrations/connected-accounts";
import { listGoogleCalendarEvents, listMicrosoftCalendarEvents, type RawCalendarEvent } from "./integrations/providers";

export type EventRow = {
  id: string;
  workspace_id: string;
  created_by_user_id: string;
  title: string;
  location: string;
  starts_at: string;
  ends_at: string | null;
  source: EventSource;
  source_url: string;
  organizer_email: string;
  external_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EventRecord = {
  id: string;
  title: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  source: EventSource;
  sourceUrl: string;
  organizerEmail: string;
};

export function eventFromRow(row: EventRow): EventRecord {
  return {
    id: row.id,
    title: row.title,
    location: row.location,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    source: row.source,
    sourceUrl: row.source_url,
    organizerEmail: row.organizer_email,
  };
}

const CANDIDATE_WINDOW_DAYS_AHEAD = 14;

/**
 * Organizer+title keys the user has already dismissed ("not going") on a
 * past calendar-sourced candidate — see candidateSuppressionKey in
 * lib/events.ts for why this catches near-duplicate future invites that
 * aren't flagged as a formal recurring series.
 */
async function fetchSuppressedCandidateKeys(supabase: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("event_attendance")
    .select("events!inner(title, organizer_email, source)")
    .eq("user_id", userId)
    .eq("status", "not_going");

  const keys = new Set<string>();
  for (const row of (data ?? []) as unknown as Array<{ events: { title: string; organizer_email: string; source: string } | null }>) {
    if (!row.events || row.events.source !== "calendar") continue;
    keys.add(candidateSuppressionKey(row.events.organizer_email, row.events.title));
  }
  return keys;
}

/**
 * Pulls, filters, and upserts calendar-derived event candidates across
 * every connected provider with calendar access. Upserting on
 * (workspace_id, external_id) makes repeated calls idempotent instead of
 * creating duplicate rows per fetch — see the migration's unique index.
 * Best-effort per provider: one provider failing (expired grant, outage)
 * does not block candidates from the other.
 */
export async function syncCalendarCandidates(
  supabase: SupabaseClient,
  user: AppUser,
): Promise<EventRecord[]> {
  const now = new Date();
  const timeMinIso = now.toISOString();
  const timeMaxIso = new Date(now.getTime() + CANDIDATE_WINDOW_DAYS_AHEAD * 24 * 60 * 60 * 1000).toISOString();

  const raw: RawCalendarEvent[] = [];
  const googleToken = await getConnectedAccountAccessToken(user, "google", supabase).catch(() => null);
  if (googleToken) {
    try {
      raw.push(...await listGoogleCalendarEvents(googleToken, { timeMinIso, timeMaxIso }));
    } catch {
      // Best-effort — a provider outage should not block the other provider.
    }
  }
  const microsoftToken = await getConnectedAccountAccessToken(user, "microsoft", supabase).catch(() => null);
  if (microsoftToken) {
    try {
      raw.push(...await listMicrosoftCalendarEvents(microsoftToken, { timeMinIso, timeMaxIso }));
    } catch {
      // Best-effort.
    }
  }
  if (!raw.length) return [];

  const worthy = raw.filter((item) => isEventCandidateWorthy({
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    location: item.location,
    attendeeEmails: item.attendeeEmails,
    userEmail: user.email,
    isRecurring: item.isRecurring,
  }));
  if (!worthy.length) return [];

  const suppressed = await fetchSuppressedCandidateKeys(supabase, user.id);
  const surviving = worthy.filter((item) => !suppressed.has(candidateSuppressionKey(item.organizerEmail, item.title)));
  if (!surviving.length) return [];

  const { data, error } = await supabase
    .from("events")
    .upsert(surviving.map((item) => ({
      workspace_id: user.workspaceId,
      created_by_user_id: user.id,
      title: item.title.trim().slice(0, 160) || "Untitled event",
      location: item.location.trim().slice(0, 320),
      starts_at: item.startsAt,
      ends_at: item.endsAt,
      source: "calendar" as const,
      organizer_email: item.organizerEmail.trim().slice(0, 320),
      external_id: item.externalId,
    })), { onConflict: "workspace_id,external_id" })
    .select("*");

  if (error || !data) return [];
  return (data as EventRow[]).map(eventFromRow);
}

export type GoingEventWindow = { id: string; startsAt: string; endsAt: string | null; leftAt: string | null };

export async function fetchGoingEventWindows(supabase: SupabaseClient, userId: string): Promise<GoingEventWindow[]> {
  const { data } = await supabase
    .from("event_attendance")
    .select("left_at, events!inner(id, starts_at, ends_at)")
    .eq("user_id", userId)
    .eq("status", "going");

  return ((data ?? []) as unknown as Array<{ left_at: string | null; events: { id: string; starts_at: string; ends_at: string | null } | null }>)
    .flatMap((row) => (row.events
      ? [{ id: row.events.id, startsAt: row.events.starts_at, endsAt: row.events.ends_at, leftAt: row.left_at }]
      : []));
}

/**
 * The server-side entry point for passive presence (see resolveCurrentEvent
 * in lib/events.ts). Called from the encounter save route so Capture and
 * Quick Follow-up — the only two flows that create an Encounter — both
 * inherit it automatically through one choke point, without either mobile
 * screen needing its own copy of this decision.
 */
export async function resolveCurrentEventIdForUser(
  supabase: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<string | null> {
  const windows = await fetchGoingEventWindows(supabase, userId);
  return resolveCurrentEvent(windows, now);
}
