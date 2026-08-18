import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../lib/auth/api-request";
import { buildEventCancelledEmail, buildEventScheduleChangedEmail } from "../../../../lib/event-invitation-email";
import { deliverQueuedEventEmail, enqueueEventEmail } from "../../../../lib/event-email-outbox";
import { calendarPushAvailability, queueEventCalendarPush } from "../../../../lib/events-calendar-push";
import { eventFromRow, type EventRow } from "../../../../lib/events-server";

type UpdateBody = {
  title?: string;
  location?: string;
  startsAt?: string;
  endsAt?: string | null;
  status?: "scheduled" | "cancelled";
  expectedUpdatedAt?: string;
  addToCalendar?: boolean;
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
  if (body.expectedUpdatedAt && current.updated_at !== body.expectedUpdatedAt) {
    return NextResponse.json({
      error: "This event changed on another device. We loaded the latest version so you can review it before trying again.",
      conflict: true,
      event: eventFromRow(current as EventRow),
    }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
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

  // Turning the calendar on has to clear the same health gate as create; turning
  // it off never needs one. A push already made is withdrawn by the push path
  // itself rather than left orphaned on the calendar.
  let calendarToggle: boolean | undefined;
  let calendarReason: string | null = null;
  if (body.addToCalendar !== undefined) {
    if (body.addToCalendar) {
      const availability = await calendarPushAvailability(user, supabase);
      calendarToggle = availability.available;
      calendarReason = availability.reason;
    } else {
      calendarToggle = false;
    }
  }

  const now = new Date().toISOString();
  let updateQuery = supabase.from("events").update({
    title, location, starts_at: startsAt, ends_at: endsAt, status: nextStatus,
    cancelled_at: nextStatus === "cancelled" ? (current.cancelled_at || now) : null,
    ...(calendarToggle === undefined ? {} : { calendar_push_enabled: calendarToggle }),
    updated_at: now,
  }).eq("id", id).eq("workspace_id", user.workspaceId);
  if (body.expectedUpdatedAt) updateQuery = updateQuery.eq("updated_at", body.expectedUpdatedAt);
  const { data: updated, error } = await updateQuery.select("*").maybeSingle();
  if (error) return NextResponse.json({ error: "We couldn’t update this event." }, { status: 500 });
  if (!updated) {
    const { data: latest } = await supabase.from("events").select("*")
      .eq("id", id).eq("workspace_id", user.workspaceId).maybeSingle();
    return NextResponse.json({
      error: "This event changed on another device. We loaded the latest version so you can review it before trying again.",
      conflict: true,
      event: latest ? eventFromRow(latest as EventRow) : undefined,
    }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  }

  // Only after the conditional update succeeded, so a write rejected for being
  // stale never queues a push built on the version it lost with. The cron drains
  // it; this request does not wait on somebody else's API.
  const calendarRelevant = cancelled
    || scheduleChanged
    || calendarToggle !== undefined
    || Boolean((updated as { external_id?: string | null }).external_id);
  if (calendarRelevant) {
    await queueEventCalendarPush(supabase, id);
  }

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

  return NextResponse.json({
    ok: true,
    event: eventFromRow(updated as EventRow),
    emailsSent,
    emailsFailed,
    // Asking to add this to a calendar and not getting it should be visible in
    // the answer, not discovered later by the event's absence there.
    ...(calendarToggle === undefined
      ? {}
      : { calendar: { requested: body.addToCalendar === true, enabled: calendarToggle, reason: calendarReason } }),
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
