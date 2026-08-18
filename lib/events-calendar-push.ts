import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "./auth/context";
import {
  CALENDAR_SYNC_MAX_ATTEMPTS,
  calendarSyncRetryDelayMinutes,
  decideCalendarPush,
  type CalendarPushTarget,
} from "./events";
import { getConnectedAccountAccessTokenStatus } from "./integrations/connected-accounts";
import {
  CalendarProviderAuthError,
  CalendarProviderGoneError,
  cancelProviderCalendarEvent,
  createProviderCalendarEvent,
  updateProviderCalendarEvent,
} from "./integrations/providers";
import type { IntegrationProvider } from "./integrations/types";

/**
 * ehllo -> provider. The pull side is syncCalendarCandidates; this is the half
 * doc 13 asked for, plus the state that lets the interface say whether a push
 * actually landed instead of assuming it did.
 *
 * Loop prevention rests on external_id, which the importer already dedupes on.
 * What doc 13 missed is that deduping only stopped duplicate rows - the update
 * path still let the provider's copy win. That guard is decideCalendarImport,
 * and it had to land before any of this could be safe.
 */

type PushRow = CalendarPushTarget & {
  id: string;
  workspace_id: string;
  title: string;
  location: string;
  starts_at: string;
  ends_at: string | null;
  sync_attempt_count: number;
  sync_provider: IntegrationProvider | null;
};

const PUSH_COLUMNS =
  "id, workspace_id, title, location, starts_at, ends_at, source, status, external_id, " +
  "calendar_push_enabled, sync_state, sync_attempt_count, sync_provider";

export type CalendarPushResult =
  | { ok: true; action: "created" | "updated" | "cancelled" | "skipped"; reason?: string }
  | { ok: false; retryable: boolean; reason: string };

/**
 * Marks an event as wanting a push. Called from the write paths so the request
 * that changed the event does not also wait on somebody else's API - the cron
 * drains it, exactly as the email outbox works.
 */
export async function queueEventCalendarPush(supabase: SupabaseClient, eventId: string) {
  await supabase
    .from("events")
    .update({
      sync_state: "pending",
      sync_attempt_count: 0,
      sync_next_attempt_at: new Date().toISOString(),
      sync_last_error: "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    // An unresolved conflict is not something a local edit gets to clear.
    .neq("sync_state", "conflict");
}

/** The first connected calendar that is actually healthy, or why there isn't one. */
async function resolvePushProvider(
  supabase: SupabaseClient,
  user: AppUser,
  preferred: IntegrationProvider | null,
): Promise<{ provider: IntegrationProvider; token: string } | { provider: null; reason: string; retryable: boolean }> {
  // Once an event lives on one provider, it stays there. Pushing it to a second
  // would leave two entries and only one external_id to track them with.
  const order: IntegrationProvider[] = preferred ? [preferred] : ["google", "microsoft"];
  let lastReason = "no calendar connected";
  let retryable = false;

  for (const provider of order) {
    const result = await getConnectedAccountAccessTokenStatus(user, provider, supabase);
    if (result.status === "ok") return { provider, token: result.token };
    lastReason = `${provider}: ${result.status}`;
    // getConnectedAccountAccessTokenStatus never returns "error", despite
    // CalendarProviderStatus defining it: its catch collapses a rejected
    // refresh token and a network blip during refresh into "needs_reconnect",
    // so from here the two are indistinguishable. Retrying that one on the
    // bounded backoff lets a transient failure recover by itself while a
    // genuinely dead grant simply exhausts its eight attempts and stops.
    // "not_connected" has no account to retry against at all.
    if (result.status === "needs_reconnect") retryable = true;
  }
  return { provider: null, reason: lastReason, retryable };
}

async function recordFailure(
  supabase: SupabaseClient,
  row: PushRow,
  reason: string,
  retryable: boolean,
) {
  const attempts = Number(row.sync_attempt_count) + 1;
  const exhausted = !retryable || attempts >= CALENDAR_SYNC_MAX_ATTEMPTS;
  const now = new Date();
  await supabase
    .from("events")
    .update({
      sync_state: "failed",
      sync_attempt_count: Math.min(attempts, 10),
      sync_last_attempt_at: now.toISOString(),
      sync_last_error: reason.slice(0, 500),
      // A permanent answer stops asking. Leaving next_attempt_at null keeps the
      // row out of the due index rather than retrying something that cannot
      // succeed, which is what made the old scan queue hammer a missing card.
      sync_next_attempt_at: exhausted
        ? null
        : new Date(now.getTime() + calendarSyncRetryDelayMinutes(attempts) * 60 * 1000).toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", row.id);
}

/** Pushes one event, and records honestly what happened to it. */
export async function pushEventToCalendar(
  supabase: SupabaseClient,
  user: AppUser,
  eventId: string,
): Promise<CalendarPushResult> {
  const { data } = await supabase
    .from("events")
    .select(PUSH_COLUMNS)
    .eq("id", eventId)
    .eq("workspace_id", user.workspaceId)
    .maybeSingle();
  const row = data as PushRow | null;
  if (!row) return { ok: false, retryable: false, reason: "event not found" };

  const { action, reason } = decideCalendarPush(row);
  if (action === "skip") {
    // Nothing to send is a settled state, not a failure. Say which, and stop
    // holding the row in the queue.
    await supabase
      .from("events")
      .update({ sync_state: row.external_id ? "synced" : "none", sync_next_attempt_at: null, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .neq("sync_state", "conflict");
    return { ok: true, action: "skipped", reason };
  }

  const resolved = await resolvePushProvider(supabase, user, row.sync_provider);
  if (resolved.provider === null) {
    await recordFailure(supabase, row, resolved.reason, resolved.retryable);
    return { ok: false, retryable: resolved.retryable, reason: resolved.reason };
  }

  const payload = {
    title: row.title,
    location: row.location,
    startsAt: row.starts_at,
    // An event with no end has no duration the provider can represent; give it
    // the same one-hour default the rest of the app assumes.
    endsAt: row.ends_at ?? new Date(new Date(row.starts_at).getTime() + 60 * 60 * 1000).toISOString(),
  };

  try {
    const now = new Date().toISOString();
    if (action === "cancel") {
      await cancelProviderCalendarEvent(resolved.provider, resolved.token, row.external_id as string);
      await supabase
        .from("events")
        .update({
          // The entry is gone from the calendar, so the id no longer points at
          // anything. Clearing it stops a later edit trying to patch a ghost.
          external_id: null,
          sync_state: "none",
          sync_provider: null,
          synced_at: now,
          sync_next_attempt_at: null,
          sync_last_error: "",
          updated_at: now,
        })
        .eq("id", row.id);
      return { ok: true, action: "cancelled" };
    }

    if (action === "update") {
      await updateProviderCalendarEvent(resolved.provider, resolved.token, row.external_id as string, payload);
    }

    const externalId = action === "create"
      ? await createProviderCalendarEvent(resolved.provider, resolved.token, payload)
      : (row.external_id as string);

    await supabase
      .from("events")
      .update({
        external_id: externalId,
        sync_provider: resolved.provider,
        sync_state: "synced",
        synced_at: now,
        sync_attempt_count: 0,
        sync_last_attempt_at: now,
        sync_next_attempt_at: null,
        sync_last_error: "",
        updated_at: now,
        // Explicitly NOT touching source. An ehllo-authored event stays
        // manual/link once it carries an external_id; reclassifying it as
        // 'calendar' is how ownership is lost on the next pull.
      })
      .eq("id", row.id);

    return { ok: true, action: action === "create" ? "created" : "updated" };
  } catch (caught) {
    if (caught instanceof CalendarProviderGoneError) {
      // The provider forgot the event. Forget its id and re-create next pass
      // rather than patching something that is not there.
      const now = new Date().toISOString();
      await supabase
        .from("events")
        .update({
          external_id: null,
          sync_state: "pending",
          sync_next_attempt_at: now,
          sync_last_error: "the calendar no longer had this event",
          updated_at: now,
        })
        .eq("id", row.id);
      return { ok: false, retryable: true, reason: "provider no longer has this event" };
    }

    const authFailure = caught instanceof CalendarProviderAuthError;
    const message = caught instanceof Error ? caught.message : String(caught);
    // A rejected token needs a reconnect, not another attempt in five minutes.
    await recordFailure(supabase, row, message, !authFailure);
    return { ok: false, retryable: !authFailure, reason: message };
  }
}

/** Drains the queue. Mirrors the email outbox's due-row selection. */
export async function pushDueCalendarEvents(
  supabase: SupabaseClient,
  user: AppUser,
  limit = 25,
): Promise<{ processed: number; failed: number }> {
  const { data } = await supabase
    .from("events")
    .select("id")
    .eq("workspace_id", user.workspaceId)
    .in("sync_state", ["pending", "failed"])
    .lt("sync_attempt_count", CALENDAR_SYNC_MAX_ATTEMPTS)
    .not("sync_next_attempt_at", "is", null)
    .lte("sync_next_attempt_at", new Date().toISOString())
    .order("sync_next_attempt_at", { ascending: true })
    .limit(limit);

  let processed = 0;
  let failed = 0;
  for (const candidate of (data ?? []) as Array<{ id: string }>) {
    const result = await pushEventToCalendar(supabase, user, candidate.id);
    processed += 1;
    if (!result.ok) failed += 1;
  }
  return { processed, failed };
}

/**
 * Whether a push could actually be delivered right now, and if not, why.
 *
 * Used by the create flow to gate the opt-in. Queuing toward a connection that
 * cannot accept the event would only manufacture failed pushes for someone who
 * never saw a problem, so the toggle only takes effect when a calendar is
 * connected and healthy - and the reason travels back so the answer can be
 * shown rather than inferred from an event that never appeared.
 */
export async function calendarPushAvailability(
  user: AppUser,
  supabase: SupabaseClient,
): Promise<{ available: boolean; provider: IntegrationProvider | null; reason: string | null }> {
  const resolved = await resolvePushProvider(supabase, user, null);
  if (resolved.provider === null) {
    return { available: false, provider: null, reason: resolved.reason };
  }
  return { available: true, provider: resolved.provider, reason: null };
}
