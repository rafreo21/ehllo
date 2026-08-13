import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../../lib/auth/api-request";
import { createEventInvitationToken, hashEventInvitationToken, normalizeInvitationEmail } from "../../../../../lib/event-invitations";
import { buildEventInvitationEmail } from "../../../../../lib/event-invitation-email";
import { sendEmail } from "../../../../../lib/send-email";

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
  return { supabase, event };
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

  return NextResponse.json({ invitations: (data ?? []).map((invitation) => ({
    id: invitation.id,
    email: invitation.invited_email,
    status: invitation.status,
    respondedAt: invitation.responded_at,
    claimedAt: invitation.claimed_at,
    createdAt: invitation.created_at,
    updatedAt: invitation.updated_at,
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
  const { supabase, event } = owned;

  const token = createEventInvitationToken();
  const expiresAt = body?.expiresAt && !Number.isNaN(Date.parse(body.expiresAt)) ? body.expiresAt : null;
  const { error } = await supabase.from("event_invitations").upsert({
    event_id: id,
    invited_email: email,
    token_hash: hashEventInvitationToken(token),
    status: "invited",
    claimed_by_user_id: null,
    responded_at: null,
    claimed_at: null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: "event_id,invited_email" });
  if (error) return NextResponse.json({ error: "We couldn’t create this invitation." }, { status: 500 });

  const origin = new URL(request.url).origin;
  const guestUrl = `${origin}/event/${encodeURIComponent(token)}`;
  const message = buildEventInvitationEmail({
    eventTitle: String(event.title ?? ""),
    startsAt: String(event.starts_at ?? ""),
    endsAt: typeof event.ends_at === "string" ? event.ends_at : null,
    location: String(event.location ?? ""),
    guestUrl,
  });
  const delivery = await sendEmail({ to: email, subject: message.subject, html: message.html });
  return NextResponse.json({
    ok: true,
    guestUrl,
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

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
