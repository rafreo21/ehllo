import { NextResponse } from "next/server";

import { buildEventReminderEmail } from "../../../../lib/event-invitation-email";
import { deliverQueuedEventEmail, enqueueEventEmail, retryDueEventEmails } from "../../../../lib/event-email-outbox";
import { createServiceSupabaseClient } from "../../../../lib/supabase/service";

type DueInvitation = {
  id: string;
  invited_email: string;
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
    .select("id, invited_email, events!inner(id, title, location, starts_at, status)")
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
  for (const invitation of (data ?? []) as unknown as DueInvitation[]) {
    if (!invitation.events) continue;
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

  return NextResponse.json({ ok: true, scanned: data?.length ?? 0, sent, failed, retries });
}
