import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../lib/auth/api-request";
import { buildEventCancelledEmail, buildEventScheduleChangedEmail } from "../../../../lib/event-invitation-email";
import { deliverQueuedEventEmail, enqueueEventEmail } from "../../../../lib/event-email-outbox";
import { eventFromRow, type EventRow } from "../../../../lib/events-server";

type UpdateBody = {
  title?: string;
  location?: string;
  startsAt?: string;
  endsAt?: string | null;
  status?: "scheduled" | "cancelled";
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as UpdateBody | null;
  if (!body) return NextResponse.json({ error: "Event changes are required." }, { status: 400 });

  const supabase = await createApiSupabaseClient(request);
  const { data: current } = await supabase.from("events").select("*")
    .eq("id", id).eq("workspace_id", user.workspaceId).maybeSingle();
  if (!current) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  if (current.created_by_user_id !== user.id) {
    return NextResponse.json({ error: "Only the person who added this event can change it." }, { status: 403 });
  }

  const title = body.title?.trim().slice(0, 160) || current.title;
  const location = body.location === undefined ? current.location : body.location.trim().slice(0, 320);
  const startsAt = body.startsAt?.trim() || current.starts_at;
  const endsAt = body.endsAt === undefined ? current.ends_at : body.endsAt?.trim() || null;
  if (Number.isNaN(Date.parse(startsAt)) || (endsAt && (Number.isNaN(Date.parse(endsAt)) || Date.parse(endsAt) <= Date.parse(startsAt)))) {
    return NextResponse.json({ error: "Check the event start and end times." }, { status: 400 });
  }
  const nextStatus = body.status ?? current.status ?? "scheduled";
  const cancelled = nextStatus === "cancelled" && current.status !== "cancelled";
  const scheduleChanged = !cancelled && (
    title !== current.title || location !== current.location || startsAt !== current.starts_at || endsAt !== current.ends_at
  );

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase.from("events").update({
    title, location, starts_at: startsAt, ends_at: endsAt, status: nextStatus,
    cancelled_at: nextStatus === "cancelled" ? (current.cancelled_at || now) : null,
    updated_at: now,
  }).eq("id", id).select("*").single();
  if (error || !updated) return NextResponse.json({ error: "We couldn’t update this event." }, { status: 500 });

  let emailsSent = 0;
  let emailsFailed = 0;
  if (cancelled || scheduleChanged) {
    const { data: invitations } = await supabase.from("event_invitations")
      .select("id, invited_email")
      .eq("event_id", id)
      .neq("status", "revoked");
    const message = cancelled
      ? buildEventCancelledEmail(title)
      : buildEventScheduleChangedEmail({ eventTitle: title, startsAt, location });
    for (const invitation of invitations ?? []) {
      const kind = cancelled ? "cancelled" as const : "schedule_changed" as const;
      const queued = await enqueueEventEmail(supabase, {
        eventId: id,
        invitationId: invitation.id,
        to: invitation.invited_email,
        kind,
        subject: message.subject,
        html: message.html,
        dedupeKey: `${kind}:${invitation.id}:${now}`,
      });
      const delivery = await deliverQueuedEventEmail(supabase, queued.id);
      if (delivery.ok) {
        emailsSent += 1;
        await supabase.from("event_invitations").update({
          [cancelled ? "cancellation_notice_sent_at" : "schedule_notice_sent_at"]: now,
          ...(scheduleChanged ? { reminder_sent_at: null } : {}),
          updated_at: now,
        }).eq("id", invitation.id);
      } else emailsFailed += 1;
    }
  }

  return NextResponse.json({ ok: true, event: eventFromRow(updated as EventRow), emailsSent, emailsFailed }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
