import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../../lib/auth/api-request";
import { createNotification, notificationTypeEnabled } from "../../../../../lib/notifications-server";
import { dispatchPushForUser } from "../../../../../lib/push-dispatch-server";
import { createServiceSupabaseClient } from "../../../../../lib/supabase/service";

/**
 * Asking the host to share a meeting you were part of.
 *
 * A meeting the host has not shared answers "not available", correctly, and then offers
 * nothing at all - so a true answer reads as a broken feature and the only way forward is to
 * message the person outside ehllo. This is the way forward inside it.
 *
 * Entitlement is decided in request_encounter_access, which mirrors the rule that already
 * lets you see the meeting listed: a connection with the workspace that owns it. Not found
 * and not entitled deliberately return the same 404, so this cannot be used to discover
 * which meetings exist between other people.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });

  const { id } = await context.params;
  const encounterId = id?.trim();
  if (!encounterId) return NextResponse.json({ error: "A meeting id is required." }, { status: 400 });
  if (user.id === "local-development-preview") return NextResponse.json({ ok: true, preview: true });

  const supabase = await createApiSupabaseClient(request);
  const { data, error } = await supabase.rpc("request_encounter_access", {
    p_encounter_id: encounterId,
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("encounter_not_found")) {
      return NextResponse.json({ error: "This meeting is no longer available." }, { status: 404 });
    }
    if (message.includes("encounter_is_yours")) {
      return NextResponse.json({ error: "This meeting is already yours." }, { status: 400 });
    }
    console.error("[encounter-access-request] could not record the request", {
      encounterId, code: error.code, message: error.message,
    });
    return NextResponse.json({ error: "We couldn’t send that request." }, { status: 500 });
  }

  const result = (data ?? {}) as {
    alreadyShared?: boolean;
    alreadyRequested?: boolean;
    ownerUserId?: string;
    ownerWorkspaceId?: string;
    encounterTitle?: string;
    requesterName?: string;
  };

  // Already shared: nothing to ask for, and the client should just open it. Saying "request
  // sent" here would be a lie that leaves them waiting for an answer nobody owes them.
  if (result.alreadyShared) {
    return NextResponse.json({ ok: true, alreadyShared: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  // Telling the host is the entire point. Best effort, because the request is recorded
  // either way and failing the call would make the person ask again - but it says so in the
  // logs, because a request that reaches nobody is indistinguishable from one being ignored.
  try {
    const service = createServiceSupabaseClient();
    if (service && result.ownerUserId && result.ownerWorkspaceId) {
      const asker = result.requesterName?.trim() || "Someone";
      const title = `${asker} asked to see “${result.encounterTitle ?? "a meeting"}”`;
      const body = "Open it to share the recap with them, or leave it as it is.";

      if (notificationTypeEnabled(null, "access_request")) {
        const created = await createNotification(service, {
          userId: result.ownerUserId,
          workspaceId: result.ownerWorkspaceId,
          type: "access_request",
          title,
          body,
          encounterId,
          // One notification per person per meeting, matching the one standing request the
          // table allows. Asking twice is the same ask.
          dedupeKey: `access_request:${encounterId}:${user.id}`,
        });
        if (created) {
          await dispatchPushForUser(service, {
            userId: result.ownerUserId,
            type: "access_request",
            title,
            body,
            encounterId,
          });
        }
      }
    }
  } catch (caught) {
    console.error("[encounter-access-request] recorded, but telling the host threw", {
      encounterId,
      message: caught instanceof Error ? caught.message : String(caught),
    });
  }

  return NextResponse.json({
    ok: true,
    alreadyShared: false,
    alreadyRequested: result.alreadyRequested === true,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
