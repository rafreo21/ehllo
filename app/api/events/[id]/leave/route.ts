import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../../lib/auth/api-request";

/**
 * "I've left" - caps this going-event's effective end at now (or clears
 * that cap, if `left: false`) without touching the event's real scheduled
 * end time. See resolveCurrentEvent in lib/events.ts for how left_at is
 * applied to the passive-attach decision.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { left?: boolean } | null;
  const left = body?.left !== false;

  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ ok: true, preview: true });
  }

  const supabase = await createApiSupabaseClient(request);
  const { data, error } = await supabase
    .from("event_attendance")
    .update({ left_at: left ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("event_id", id)
    .eq("user_id", user.id)
    .eq("status", "going")
    .select("event_id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Could not update this event." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "You're not marked as going to this event." }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
