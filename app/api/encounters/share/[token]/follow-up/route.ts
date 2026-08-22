import { NextResponse } from "next/server";

import { createClient } from "../../../../../../lib/supabase/server";
import { createServiceSupabaseClient } from "../../../../../../lib/supabase/service";
import { createNotification, notificationTypeEnabled } from "../../../../../../lib/notifications-server";
import { dispatchPushForUser } from "../../../../../../lib/push-dispatch-server";
import { defaultFollowUpTitle, type FollowUpChannel } from "../../../../../../lib/follow-up-channels";
import type { SupabaseClient } from "@supabase/supabase-js";

async function notifyHostOfGuestFollowUp(
  service: SupabaseClient,
  encounter: { id: string; workspace_id: string },
  committedAt: string,
) {
  try {
    const { data: workspace } = await service
      .from("workspaces")
      .select("owner_user_id")
      .eq("id", encounter.workspace_id)
      .maybeSingle();
    const ownerId = workspace?.owner_user_id;
    if (!ownerId) return;

    const { data: owner } = await service
      .from("users")
      .select("notification_preferences")
      .eq("id", ownerId)
      .maybeSingle();
    if (!notificationTypeEnabled(owner?.notification_preferences, "shared_meeting_update")) return;

    const title = "A guest committed to a follow-up";
    const body = "They said they'll follow up too. See the details on the meeting.";
    const created = await createNotification(service, {
      userId: ownerId,
      workspaceId: encounter.workspace_id,
      type: "shared_meeting_update",
      title,
      body,
      encounterId: encounter.id,
      dedupeKey: `shared_meeting_update:${encounter.id}:${committedAt}`,
    });
    if (created) {
      await dispatchPushForUser(service, {
        userId: ownerId,
        type: "shared_meeting_update",
        title,
        body,
        encounterId: encounter.id,
      });
    }
  } catch {
    // Best-effort: never let a missed notification block the guest's commitment.
  }
}

function success(guestFollowUp: { committedAt: string; note: string }) {
  return NextResponse.json({ guestFollowUp }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "A share token is required." }, { status: 400 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const allowedChannels: FollowUpChannel[] = ["email", "linkedin", "call", "meeting", "send", "whatsapp", "instagram", "x", "tiktok", "other"];
  const channel: FollowUpChannel = typeof body?.channel === "string" && (allowedChannels as string[]).includes(body.channel)
    ? body.channel as FollowUpChannel
    : "other";
  const rawNote = typeof body?.note === "string" ? body.note.trim() : "";
  const note = rawNote ? rawNote.slice(0, 280) : defaultFollowUpTitle(channel);
  const dueAt = typeof body?.dueAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dueAt) ? body.dueAt : "";
  const shareToken = token.trim();

  // Prefer the service client for this narrowly-scoped public write. This
  // keeps the guest action working even when the request has no auth cookie,
  // while still requiring a valid, currently shared encounter token.
  const service = createServiceSupabaseClient();
  if (service) {
    const { data: encounter } = await service
      .from("encounters")
      .select("id, workspace_id")
      .eq("share_token", shareToken)
      .eq("status", "shared")
      .maybeSingle();

    if (!encounter) {
      return NextResponse.json({ error: "This meeting record is no longer available." }, { status: 404 });
    }

    const committedAt = new Date().toISOString();
    const { data: inserted, error: insertError } = await service.from("encounter_guest_follow_ups").insert({
      encounter_id: encounter.id,
      note,
      channel,
      due_at: dueAt || null,
      committed_at: committedAt,
    }).select("committed_at, note, channel, due_at").single();

    if (!insertError && inserted) {
      await notifyHostOfGuestFollowUp(service, encounter, committedAt);
      return NextResponse.json({ guestFollowUp: { committedAt: inserted.committed_at, note: inserted.note, channel: inserted.channel, dueAt: inserted.due_at || undefined } });
    }

    // Compatibility for projects that still have the earlier single-value
    // guest follow-up migration but not the multi-guest table migration.
    const guestFollowUp = { committedAt, note };
    const { error: legacyError } = await service
      .from("encounters")
      .update({ guest_follow_up: guestFollowUp })
      .eq("id", encounter.id);
    if (!legacyError) return success(guestFollowUp);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("commit_guest_follow_up", {
    p_share_token: shareToken,
    p_note: note || null,
  });

  if (error || !data) {
    return NextResponse.json({ error: "Could not record your follow-up. Try again." }, { status: 404 });
  }

  return NextResponse.json({ guestFollowUp: data }, { headers: { "Cache-Control": "private, no-store" } });
}
