import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../../lib/auth/api-request";
import { EVENT_ATTENDANCE_STATUSES } from "../../../../../lib/events";

const allowedStatuses = new Set<string>(EVENT_ATTENDANCE_STATUSES);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { status?: string } | null;
  const status = body?.status?.trim() ?? "";
  if (!status || !allowedStatuses.has(status)) {
    return NextResponse.json({ error: "A valid attendance status is required." }, { status: 400 });
  }

  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ ok: true, preview: true });
  }

  const supabase = await createApiSupabaseClient(request);
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", user.workspaceId)
    .maybeSingle();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const { error } = await supabase.from("event_attendance").upsert({
    event_id: id,
    user_id: user.id,
    status,
    // A fresh RSVP always starts a fresh presence lifecycle. Without this,
    // Going → I've left → Not going → Going kept the old left_at timestamp
    // and immediately treated the user as having already left.
    left_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "event_id,user_id" });

  if (error) {
    return NextResponse.json({ error: "Could not update your attendance for this event." }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Drop this user's answer entirely, rather than recording a different one.
 *
 * Removing is deliberately not the same as answering "not going": a declined
 * event stays listed so the user can reverse it, and its record is what
 * suppresses the matching calendar candidate. Removing withdraws both. For a
 * calendar-sourced event that means it may legitimately reappear as a
 * candidate on the next sync, which is the correct outcome - an invisible,
 * permanent suppression applied by a single tap is the behaviour this whole
 * change exists to undo.
 *
 * The event itself is untouched; other attendees and any captures already
 * tagged to it are unaffected.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ ok: true, preview: true });
  }

  const supabase = await createApiSupabaseClient(request);
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", user.workspaceId)
    .maybeSingle();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const { error } = await supabase
    .from("event_attendance")
    .delete()
    .eq("event_id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "Could not remove this event from your list." }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
