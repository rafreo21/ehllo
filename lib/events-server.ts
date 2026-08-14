import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "./auth/context";
import { deliverQueuedEventEmail, enqueueEventEmail, type EventEmailKind } from "./event-email-outbox";
import { buildEventCancelledEmail, buildEventScheduleChangedEmail } from "./event-invitation-email";
import { candidateSuppressionKey, isEventCandidateWorthy, resolveCurrentEvent, type EventSource } from "./events";
import { getConnectedAccountAccessTokenStatus } from "./integrations/connected-accounts";
import {
  CalendarProviderAuthError,
  listGoogleCalendarEvents,
  listMicrosoftCalendarEvents,
  type RawCalendarEvent,
} from "./integrations/providers";

/**
 * "ok" — synced fine. "not_connected" — user never linked this provider (or
 * unlinked it), a normal state, not an error. "needs_reconnect" — a
 * connection exists but its token is dead (revoked grant, refresh
 * rejected, or the provider itself returned 401/403) and nothing will
 * sync again until the user reconnects. "error" — a transient failure
 * (network, 5xx); worth retrying, not worth alarming the user about.
 */
export type CalendarProviderStatus = "ok" | "not_connected" | "needs_reconnect" | "error";

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
  status: "scheduled" | "cancelled";
  cancelled_at: string | null;
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
  status: "scheduled" | "cancelled";
  updatedAt: string;
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
    status: row.status ?? "scheduled",
    updatedAt: row.updated_at,
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
    .select("events!inner(title, organizer_email, source, starts_at)")
    .eq("user_id", userId)
    .eq("status", "not_going");

  const keys = new Set<string>();
  for (const row of (data ?? []) as unknown as Array<{ events: { title: string; organizer_email: string; source: string; starts_at: string } | null }>) {
    if (!row.events || row.events.source !== "calendar") continue;
    keys.add(candidateSuppressionKey(row.events.organizer_email, row.events.title, row.events.starts_at));
  }
  return keys;
}

export type SyncCalendarCandidatesResult = {
  candidates: EventRecord[];
  providerStatus: { google: CalendarProviderStatus; microsoft: CalendarProviderStatus };
  syncedAt: string;
};

async function fetchProviderEvents(
  provider: "google" | "microsoft",
  user: AppUser,
  supabase: SupabaseClient,
  window: { timeMinIso: string; timeMaxIso: string },
): Promise<{ events: RawCalendarEvent[]; status: CalendarProviderStatus }> {
  const tokenResult = await getConnectedAccountAccessTokenStatus(user, provider, supabase);
  if (tokenResult.status !== "ok") return { events: [], status: tokenResult.status };

  try {
    const events = provider === "google"
      ? await listGoogleCalendarEvents(tokenResult.token, window)
      : await listMicrosoftCalendarEvents(tokenResult.token, window);
    return { events, status: "ok" };
  } catch (caught) {
    return { events: [], status: caught instanceof CalendarProviderAuthError ? "needs_reconnect" : "error" };
  }
}

/**
 * Pulls, filters, and upserts calendar-derived event candidates across
 * every connected provider with calendar access. Upserting on
 * (workspace_id, external_id) makes repeated calls idempotent instead of
 * creating duplicate rows per fetch — see the migration's unique index.
 * Best-effort per provider: one provider failing (expired grant, outage)
 * does not block candidates from the other, but each provider's own status
 * is still reported back so the UI can tell "nothing new" apart from
 * "this is actually broken."
 */
export async function syncCalendarCandidates(
  supabase: SupabaseClient,
  user: AppUser,
): Promise<SyncCalendarCandidatesResult> {
  const now = new Date();
  const timeMinIso = now.toISOString();
  const timeMaxIso = new Date(now.getTime() + CANDIDATE_WINDOW_DAYS_AHEAD * 24 * 60 * 60 * 1000).toISOString();
  const syncedAt = now.toISOString();
  const window = { timeMinIso, timeMaxIso };

  const [google, microsoft] = await Promise.all([
    fetchProviderEvents("google", user, supabase, window),
    fetchProviderEvents("microsoft", user, supabase, window),
  ]);
  const providerStatus = { google: google.status, microsoft: microsoft.status };
  const raw = [...google.events, ...microsoft.events];
  if (!raw.length) return { candidates: [], providerStatus, syncedAt };

  const externalIds = raw.map((item) => item.externalId);
  const { data: beforeRows } = await supabase.from("events").select("*")
    .eq("workspace_id", user.workspaceId).in("external_id", externalIds);
  const beforeByExternalId = new Map(((beforeRows ?? []) as EventRow[]).map((row) => [row.external_id, row]));
  const cancelledItems = raw.filter((item) => item.cancelled);
  for (const item of cancelledItems) {
    const existing = beforeByExternalId.get(item.externalId);
    if (!existing || existing.status === "cancelled") continue;
    const nowIso = new Date().toISOString();
    await supabase.from("events").update({ status: "cancelled", cancelled_at: nowIso, updated_at: nowIso }).eq("id", existing.id);
    await notifyCalendarEventGuests(supabase, existing.id, buildEventCancelledEmail(existing.title), "cancellation_notice_sent_at", "cancelled", nowIso, false);
  }

  const worthy = raw.filter((item) => !item.cancelled && isEventCandidateWorthy({
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    location: item.location,
    attendeeEmails: item.attendeeEmails,
    userEmail: user.email,
    isRecurring: item.isRecurring,
  }));
  if (!worthy.length) return { candidates: [], providerStatus, syncedAt };

  const suppressed = await fetchSuppressedCandidateKeys(supabase, user.id);
  const surviving = worthy.filter((item) => !suppressed.has(candidateSuppressionKey(item.organizerEmail, item.title, item.startsAt)));
  if (!surviving.length) return { candidates: [], providerStatus, syncedAt };

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
      status: "scheduled",
      cancelled_at: null,
    })), { onConflict: "workspace_id,external_id" })
    .select("*");

  if (error || !data) return { candidates: [], providerStatus, syncedAt };
  for (const item of surviving) {
    const existing = beforeByExternalId.get(item.externalId);
    if (!existing) continue;
    const changed = existing.title !== item.title.trim().slice(0, 160)
      || existing.location !== item.location.trim().slice(0, 320)
      || !sameInstant(existing.starts_at, item.startsAt)
      || !sameInstant(existing.ends_at, item.endsAt)
      || existing.status === "cancelled";
    if (!changed) continue;
    await notifyCalendarEventGuests(supabase, existing.id, buildEventScheduleChangedEmail({
      eventTitle: item.title,
      startsAt: item.startsAt,
      location: item.location,
    }), "schedule_notice_sent_at", "schedule_changed", syncedAt, true);
  }
  return { candidates: (data as EventRow[]).map(eventFromRow), providerStatus, syncedAt };
}

function sameInstant(left: string | null, right: string | null) {
  if (!left || !right) return left === right;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return !Number.isNaN(leftTime) && !Number.isNaN(rightTime) && leftTime === rightTime;
}

async function notifyCalendarEventGuests(
  supabase: SupabaseClient,
  eventId: string,
  message: { subject: string; html: string },
  noticeColumn: "schedule_notice_sent_at" | "cancellation_notice_sent_at",
  kind: EventEmailKind,
  changeKey: string,
  resetReminder: boolean,
) {
  const { data: invitations } = await supabase.from("event_invitations")
    .select("id, invited_email").eq("event_id", eventId).neq("status", "revoked");
  for (const invitation of invitations ?? []) {
    const queued = await enqueueEventEmail(supabase, {
      eventId,
      invitationId: invitation.id,
      to: invitation.invited_email,
      kind,
      subject: message.subject,
      html: message.html,
      dedupeKey: `${kind}:${invitation.id}:${changeKey}`,
    });
    const delivery = await deliverQueuedEventEmail(supabase, queued.id);
    if (!delivery.ok) continue;
    await supabase.from("event_invitations").update({
      [noticeColumn]: new Date().toISOString(),
      ...(resetReminder ? { reminder_sent_at: null } : {}),
      updated_at: new Date().toISOString(),
    }).eq("id", invitation.id);
  }
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
