import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../../lib/auth/api-request";
import { createEventInvitationToken, hashEventInvitationToken, normalizeInvitationEmail } from "../../../../../lib/event-invitations";
import { buildEventInvitationEmail } from "../../../../../lib/event-invitation-email";
import { deliverQueuedEventEmail, enqueueEventEmail } from "../../../../../lib/event-email-outbox";
import { createNotification } from "../../../../../lib/notifications-server";
import { createServiceSupabaseClient } from "../../../../../lib/supabase/service";

async function resolveOwnedEvent(request: Request, id: string) {
  const user = await resolveApiUser(request);
  if (!user) return { error: NextResponse.json({ error: "Your session has expired." }, { status: 401 }) };

  const supabase = await createApiSupabaseClient(request);
  const { data: event } = await supabase.from("events")
    .select("id, title, starts_at, ends_at, location")
    .eq("id", id)
    .eq("workspace_id", user.workspaceId)
    .maybeSingle();
  if (!event) return { error: NextResponse.json({ error: "Event not found." }, { status: 404 }) };
  return { supabase, event, user };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const owned = await resolveOwnedEvent(request, id);
  if (owned.error) return owned.error;

  const { data, error } = await owned.supabase.from("event_invitations")
    .select("id, invited_email, status, responded_at, claimed_at, created_at, updated_at")
    .eq("event_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "We couldn’t load this event’s invitations." }, { status: 500 });
  const { data: deliveries } = await owned.supabase.from("event_email_outbox")
    .select("invitation_id, status, last_error, updated_at")
    .eq("event_id", id)
    .order("updated_at", { ascending: false });
  const latestDelivery = new Map<string, { status: string; last_error: string }>();
  for (const delivery of deliveries ?? []) {
    if (delivery.invitation_id && !latestDelivery.has(delivery.invitation_id)) latestDelivery.set(delivery.invitation_id, delivery);
  }

  return NextResponse.json({ invitations: (data ?? []).map((invitation) => ({
    id: invitation.id,
    email: invitation.invited_email,
    status: invitation.status,
    respondedAt: invitation.responded_at,
    claimedAt: invitation.claimed_at,
    createdAt: invitation.created_at,
    updatedAt: invitation.updated_at,
    deliveryStatus: latestDelivery.get(invitation.id)?.status ?? null,
    deliveryError: latestDelivery.get(invitation.id)?.last_error ?? "",
  })) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null) as { email?: string; expiresAt?: string } | null;
  const email = normalizeInvitationEmail(body?.email ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid guest email address." }, { status: 400 });
  }

  const { id } = await context.params;
  const owned = await resolveOwnedEvent(request, id);
  if (owned.error) return owned.error;
  const { supabase, event, user } = owned;

  const token = createEventInvitationToken();
  const expiresAt = body?.expiresAt && !Number.isNaN(Date.parse(body.expiresAt)) ? body.expiresAt : null;
  const { data: invitation, error } = await supabase.from("event_invitations").upsert({
    event_id: id,
    invited_email: email,
    token_hash: hashEventInvitationToken(token),
    status: "invited",
    claimed_by_user_id: null,
    responded_at: null,
    claimed_at: null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: "event_id,invited_email" }).select("id, token_hash").single();
  if (error || !invitation) return NextResponse.json({ error: "We couldn’t create this invitation." }, { status: 500 });

  const origin = new URL(request.url).origin;
  const guestUrl = `${origin}/event/${encodeURIComponent(token)}`;
  const message = buildEventInvitationEmail({
    eventTitle: String(event.title ?? ""),
    startsAt: String(event.starts_at ?? ""),
    endsAt: typeof event.ends_at === "string" ? event.ends_at : null,
    location: String(event.location ?? ""),
    guestUrl,
  });
  const queued = await enqueueEventEmail(supabase, {
    eventId: id,
    invitationId: invitation.id,
    to: email,
    kind: "invitation",
    subject: message.subject,
    html: message.html,
    dedupeKey: `invitation:${invitation.id}:${invitation.token_hash}`,
  });
  const delivery = await deliverQueuedEventEmail(supabase, queued.id);

  // Tell them in the app too, if they are already an ehllo user.
  //
  // Until now an invitation existed only as an email. Someone with the app
  // installed got no notification and nothing in their events list, so the only
  // route in was noticing the email and tapping the token link. The event now
  // appears as an undecided candidate for them; this is what makes them aware of
  // it without having to go looking.
  //
  // Service client because the notification belongs to the invitee's workspace,
  // not the inviter's, and RLS on the caller's client cannot reach it. Best
  // effort: the invitation and the email have already succeeded, so a failure
  // here must not fail the request - but it must say why.
  let notifiedInApp = false;
  try {
    const service = createServiceSupabaseClient();
    if (service) {
      const { data: invitee } = await service
        .from("users")
        .select("id, status, primary_email")
        .ilike("primary_email", email)
        .eq("status", "active")
        .maybeSingle();
      const inviteeId = (invitee as { id?: string } | null)?.id;
      if (inviteeId) {
        const { data: membership } = await service
          .from("workspace_memberships")
          .select("workspace_id")
          .eq("user_id", inviteeId)
          .eq("status", "active")
          .maybeSingle();
        const inviteeWorkspaceId = (membership as { workspace_id?: string } | null)?.workspace_id;
        if (inviteeWorkspaceId) {
          const created = await createNotification(service, {
            userId: inviteeId,
            workspaceId: inviteeWorkspaceId,
            type: "shared_meeting_update",
            title: `${user.displayName || "Someone"} invited you to ${String(event.title ?? "an event")}`,
            body: "Open Events to answer.",
            actionId: `event:${id}`,
            dedupeKey: `event_invitation:${invitation.id}`,
          });
          notifiedInApp = Boolean(created);
        }
      }
    }
  } catch (caught) {
    console.error("[event-invitations] could not notify the invitee in app", {
      eventId: id,
      code: caught instanceof Error ? caught.name : "unknown",
      message: caught instanceof Error ? caught.message : String(caught),
    });
  }

  return NextResponse.json({
    ok: true,
    guestUrl,
    notifiedInApp,
    emailSent: delivery.ok,
    warning: delivery.ok ? undefined : "Invitation saved, but email delivery is unavailable. Share the link instead.",
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null) as { invitationId?: string } | null;
  if (!body?.invitationId) return NextResponse.json({ error: "Invitation ID is required." }, { status: 400 });

  const { id } = await context.params;
  const owned = await resolveOwnedEvent(request, id);
  if (owned.error) return owned.error;

  const { data, error } = await owned.supabase.from("event_invitations")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", body.invitationId)
    .eq("event_id", id)
    .is("claimed_at", null)
    .neq("status", "revoked")
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "We couldn’t revoke this invitation." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "This invitation is no longer active." }, { status: 404 });

  // Take the notification back too.
  //
  // Revoking already removes the event from their Invited list, because the
  // candidates query excludes revoked rows. The notification it created did not
  // go anywhere though, so they were left holding "someone invited you to X"
  // pointing at an invitation that no longer exists - which is worse than never
  // being told, because it sends them looking for something that is not there.
  //
  // Service client: the notification belongs to their workspace, not the
  // inviter's. Best effort, since the revoke itself has already succeeded.
  try {
    const service = createServiceSupabaseClient();
    if (service) {
      const { error: noticeError } = await service
        .from("notifications")
        .delete()
        .eq("dedupe_key", `event_invitation:${body.invitationId}`);
      if (noticeError) {
        console.error("[event-invitations] revoked, but could not withdraw the notification", {
          invitationId: body.invitationId, code: noticeError.code, message: noticeError.message,
        });
      }
    }
  } catch (caught) {
    console.error("[event-invitations] revoked, but withdrawing the notification threw", {
      invitationId: body.invitationId,
      message: caught instanceof Error ? caught.message : String(caught),
    });
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
