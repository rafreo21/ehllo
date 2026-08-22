import { NextResponse } from "next/server";

import { buildEventReminderEmail } from "../../../../lib/event-invitation-email";
import { deliverQueuedEventEmail, enqueueEventEmail, retryDueEventEmails } from "../../../../lib/event-email-outbox";
import { createNotification, notificationTypeEnabled } from "../../../../lib/notifications-server";
import { dispatchPushForUser } from "../../../../lib/push-dispatch-server";
import { createServiceSupabaseClient } from "../../../../lib/supabase/service";

type DueInvitation = {
  id: string;
  invited_email: string;
  status: string;
  events: { id: string; title: string; location: string; starts_at: string; status: string } | null;
};

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const service = createServiceSupabaseClient();
  if (!service) return NextResponse.json({ error: "Service client is not configured." }, { status: 503 });

  const now = Date.now();
  // The free Vercel tier runs cron jobs at most daily and may start within
  // the scheduled hour. A full 24-hour window ensures every event crosses
  // exactly one daily scan; reminder_sent_at makes retries at-most-once.
  const earliest = new Date(now + 12 * 60 * 60 * 1000).toISOString();
  const latest = new Date(now + 36 * 60 * 60 * 1000).toISOString();
  const { data, error } = await service.from("event_invitations")
    .select("id, invited_email, status, events!inner(id, title, location, starts_at, status)")
    .in("status", ["invited", "going"])
    .is("reminder_sent_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date(now).toISOString()}`)
    .eq("events.status", "scheduled")
    .gte("events.starts_at", earliest)
    .lte("events.starts_at", latest)
    .limit(500);
  if (error) return NextResponse.json({ error: "Could not load due event reminders." }, { status: 500 });

  const retries = await retryDueEventEmails(service);
  let sent = 0;
  let failed = 0;
  let notified = 0;
  for (const invitation of (data ?? []) as unknown as DueInvitation[]) {
    if (!invitation.events) continue;

    // Remind them in the app as well, and only while the invitation is still
    // unanswered.
    //
    // The email alone was the whole reminder, which is the same problem the
    // invitation itself had: it sits in an inbox and the person never sees it in
    // the product. Someone who has already said Going does not need chasing, so
    // this is scoped to 'invited'.
    //
    // Folded into this cron rather than given its own, because the plan allows
    // one run per day per job and a second daily job buys nothing the first
    // cannot do at the same moment.
    if (invitation.status === "invited") {
      try {
        const { data: invitee } = await service
          .from("users")
          .select("id, status, notification_preferences")
          .ilike("primary_email", invitation.invited_email)
          .eq("status", "active")
          .maybeSingle();
        const inviteeRow = invitee as { id?: string; notification_preferences?: unknown } | null;
        const inviteeId = inviteeRow?.id;
        if (inviteeId) {
          const { data: membership } = await service
            .from("workspace_memberships")
            .select("workspace_id")
            .eq("user_id", inviteeId)
            .eq("status", "active")
            .maybeSingle();
          const workspaceId = (membership as { workspace_id?: string } | null)?.workspace_id;
          // Respects their own notification settings, like every other cron.
          const allowed = notificationTypeEnabled(inviteeRow?.notification_preferences, "shared_meeting_update");
          if (workspaceId && allowed) {
            const title = `${invitation.events.title} is coming up`;
            const body = "You have not answered this invitation yet.";
            const created = await createNotification(service, {
              userId: inviteeId,
              workspaceId,
              type: "shared_meeting_update",
              title,
              body,
              actionId: `event:${invitation.events.id}`,
              // Once per event occurrence, so a rescheduled event reminds again
              // and an unchanged one never nags twice.
              dedupeKey: `event_invitation_reminder:${invitation.id}:${invitation.events.starts_at}`,
            });
            if (created) {
              notified += 1;
              await dispatchPushForUser(service, {
                userId: inviteeId,
                type: "shared_meeting_update",
                title,
                body,
                actionId: `event:${invitation.events.id}`,
              });
            }
          }
        }
      } catch (caught) {
        // The email below is the reminder that matters most; never lose it
        // because the in-app copy failed.
        console.error("[event-reminders] could not notify an invitee in app", {
          invitationId: invitation.id,
          message: caught instanceof Error ? caught.message : String(caught),
        });
      }
    }
    const message = buildEventReminderEmail({
      eventTitle: invitation.events.title,
      startsAt: invitation.events.starts_at,
      location: invitation.events.location,
    });
    const queued = await enqueueEventEmail(service, {
      eventId: invitation.events.id,
      invitationId: invitation.id,
      to: invitation.invited_email,
      kind: "reminder",
      subject: message.subject,
      html: message.html,
      dedupeKey: `reminder:${invitation.id}:${invitation.events.starts_at}`,
    });
    const delivery = await deliverQueuedEventEmail(service, queued.id);
    if (!delivery.ok) {
      failed += 1;
      continue;
    }
    sent += 1;
    await service.from("event_invitations").update({
      reminder_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", invitation.id).is("reminder_sent_at", null);
  }

  return NextResponse.json({ ok: true, scanned: data?.length ?? 0, sent, failed, notified, retries });
}
