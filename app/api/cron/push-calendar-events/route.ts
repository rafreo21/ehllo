import { NextResponse } from "next/server";

import type { AppUser } from "../../../../lib/auth/context";
import { pushEventToCalendar } from "../../../../lib/events-calendar-push";
import { CALENDAR_SYNC_MAX_ATTEMPTS } from "../../../../lib/events";
import { createServiceSupabaseClient } from "../../../../lib/supabase/service";

const BATCH_LIMIT = 100;

type DueRow = {
  id: string;
  workspace_id: string;
  created_by_user_id: string;
};

/**
 * Drains the ehllo -> calendar push queue.
 *
 * The write paths only mark an event pending; nobody's request waits on
 * Google or Microsoft. Same division as event_email_outbox, and the same
 * selection: pending or failed, still under the attempt ceiling, and actually
 * due. A row whose next attempt is null has been given a permanent answer and
 * is deliberately not picked up again - retrying something that cannot succeed
 * is how the old scan queue ended up hammering a card that did not exist.
 *
 * The push resolves credentials per event owner, because connected_accounts is
 * keyed by (workspace_id, user_id): one workspace member's calendar grant is not
 * another's, and pushing an event under whoever the cron happened to look up
 * first is the same ownership mistake the importer was making.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Service credentials are unavailable." }, { status: 503 });
  }

  const { data, error } = await service
    .from("events")
    .select("id, workspace_id, created_by_user_id")
    .in("sync_state", ["pending", "failed"])
    .lt("sync_attempt_count", CALENDAR_SYNC_MAX_ATTEMPTS)
    .not("sync_next_attempt_at", "is", null)
    .lte("sync_next_attempt_at", new Date().toISOString())
    .order("sync_next_attempt_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    // Say why. A cron that reports zero work is indistinguishable from a cron
    // whose query failed, and that ambiguity is what hid the calendar upsert
    // failing for a week.
    console.error("[push-calendar-events] could not read the due queue", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: "We couldn’t read the calendar push queue." }, { status: 500 });
  }

  const due = (data ?? []) as DueRow[];
  let pushed = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of due) {
    // Only the two fields the push path reads are real; the rest exist to satisfy
    // AppUser and are never used for calendar work.
    const owner: AppUser = {
      id: row.created_by_user_id,
      email: "",
      displayName: null,
      avatarUrl: null,
      onboardingStatus: "completed",
      workspaceId: row.workspace_id,
      workspaceName: "",
      workspaceType: "personal",
      workspaceRole: "owner",
    };

    const result = await pushEventToCalendar(service, owner, row.id);
    if (!result.ok) {
      failed += 1;
      console.error("[push-calendar-events] push failed", {
        eventId: row.id,
        retryable: result.retryable,
        reason: result.reason,
      });
      continue;
    }
    if (result.action === "skipped") skipped += 1;
    else pushed += 1;
  }

  return NextResponse.json(
    { ok: true, due: due.length, pushed, skipped, failed, batchLimit: BATCH_LIMIT },
    { headers: { "Cache-Control": "no-store" } },
  );
}
