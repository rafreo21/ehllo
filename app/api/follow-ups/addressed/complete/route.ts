import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../../lib/auth/api-request";
import { createNotification, notificationTypeEnabled } from "../../../../../lib/notifications-server";
import { dispatchPushForUser } from "../../../../../lib/push-dispatch-server";
import { createServiceSupabaseClient } from "../../../../../lib/supabase/service";

/**
 * Marks a follow-up somebody recorded about you as done, and tells them.
 *
 * The row lives in their workspace, so this goes through a security-definer
 * function that matches on the caller's own verified address - it can only ever
 * complete a commitment actually addressed to them.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { id?: string } | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "A follow-up id is required." }, { status: 400 });

  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") return NextResponse.json({ ok: true, preview: true });

  const supabase = await createApiSupabaseClient(request);
  const { data, error } = await supabase.rpc("complete_follow_up_addressed_to_me", { p_id: id });

  if (error) {
    // The function answers the same way for "missing" and "not yours", so this
    // cannot leak whether a follow-up exists.
    const notFound = error.message.toLowerCase().includes("follow_up_not_found");
    console.error("[follow-up-addressed] could not complete", { code: error.code, message: error.message });
    return NextResponse.json(
      { error: notFound ? "This follow-up is no longer available." : "We couldn’t update this follow-up." },
      { status: notFound ? 404 : 500 },
    );
  }

  // Telling the author is the point: they are the one waiting on it, and nothing in
  // their own workspace changed that they could notice. Best effort - the completion
  // is already written and must stand either way - but it says why on failure.
  const result = (data ?? {}) as {
    note?: string;
    encounterId?: string;
    ownerUserId?: string;
    ownerWorkspaceId?: string;
    completedByName?: string;
  };
  try {
    const service = createServiceSupabaseClient();
    if (service && result.ownerUserId && result.ownerWorkspaceId) {
      const { data: owner } = await service
        .from("users")
        .select("notification_preferences")
        .eq("id", result.ownerUserId)
        .maybeSingle();

      if (notificationTypeEnabled(owner?.notification_preferences, "follow_up_completed")) {
        const title = `${result.completedByName || "Someone"} completed a follow-up`;
        const noticeBody = result.note?.trim() || "Open ehllo to see it.";
        const created = await createNotification(service, {
          userId: result.ownerUserId,
          workspaceId: result.ownerWorkspaceId,
          type: "follow_up_completed",
          title,
          body: noticeBody,
          encounterId: result.encounterId,
          actionId: id,
          dedupeKey: `follow_up_completed:${id}`,
        });
        if (created) {
          await dispatchPushForUser(service, {
            userId: result.ownerUserId,
            type: "follow_up_completed",
            title,
            body: noticeBody,
            encounterId: result.encounterId,
            actionId: id,
          });
        }
      }
    }
  } catch (caught) {
    console.error("[follow-up-addressed] completed, but notifying the author threw", {
      id,
      message: caught instanceof Error ? caught.message : String(caught),
    });
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
