import { NextResponse } from "next/server";

import { hashEventInvitationToken } from "../../../../lib/event-invitations";
import { createServiceSupabaseClient } from "../../../../lib/supabase/service";

type InvitationRow = {
  id: string;
  invited_email: string;
  status: "invited" | "going" | "not_going" | "revoked";
  expires_at: string | null;
  events: { id: string; title: string; location: string; starts_at: string; ends_at: string | null } | null;
};

async function readInvitation(token: string) {
  const service = createServiceSupabaseClient();
  if (!service) return { service: null, invitation: null };
  const { data } = await service.from("event_invitations")
    .select("id, invited_email, status, expires_at, events!inner(id, title, location, starts_at, ends_at)")
    .eq("token_hash", hashEventInvitationToken(token))
    .maybeSingle();
  return { service, invitation: data as unknown as InvitationRow | null };
}

function available(invitation: InvitationRow | null) {
  return Boolean(invitation && invitation.status !== "revoked" && (!invitation.expires_at || Date.parse(invitation.expires_at) > Date.now()));
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const { invitation } = await readInvitation(token);
  if (!available(invitation) || !invitation?.events) return NextResponse.json({ error: "This event invitation is no longer available." }, { status: 404 });
  return NextResponse.json({
    invitation: {
      email: invitation.invited_email,
      status: invitation.status,
      event: {
        id: invitation.events.id,
        title: invitation.events.title,
        location: invitation.events.location,
        startsAt: invitation.events.starts_at,
        endsAt: invitation.events.ends_at,
      },
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const body = await request.json().catch(() => null) as { status?: string } | null;
  if (body?.status !== "going" && body?.status !== "not_going") {
    return NextResponse.json({ error: "Choose Going or Not going." }, { status: 400 });
  }
  const { service, invitation } = await readInvitation(token);
  if (!service || !available(invitation)) return NextResponse.json({ error: "This event invitation is no longer available." }, { status: 404 });
  const { error } = await service.from("event_invitations").update({
    status: body.status,
    responded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", invitation!.id);
  if (error) return NextResponse.json({ error: "We couldn’t save your response." }, { status: 500 });
  return NextResponse.json({ ok: true, status: body.status }, { headers: { "Cache-Control": "private, no-store" } });
}
