import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../../lib/auth/api-request";
import { createEventInvitationToken, hashEventInvitationToken, normalizeInvitationEmail } from "../../../../../lib/event-invitations";
import { buildEventInvitationEmail } from "../../../../../lib/event-invitation-email";
import { sendEmail } from "../../../../../lib/send-email";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });

  const body = await request.json().catch(() => null) as { email?: string; expiresAt?: string } | null;
  const email = normalizeInvitationEmail(body?.email ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid guest email address." }, { status: 400 });
  }

  const { id } = await context.params;
  const supabase = await createApiSupabaseClient(request);
  const { data: event } = await supabase.from("events").select("id, title, starts_at, ends_at, location").eq("id", id).eq("workspace_id", user.workspaceId).maybeSingle();
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

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
