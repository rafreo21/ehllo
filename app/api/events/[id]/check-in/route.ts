import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../../lib/auth/api-request";

/**
 * "I'm here" - the user confirming which event they are physically at.
 *
 * Presence was previously inferred from the clock alone, and when two RSVPs
 * overlapped the event that started most recently won. That decision drives
 * which event a scanned card, a reciprocal exchange, a captured encounter and
 * its follow-ups get attributed to, so guessing wrong quietly files real
 * relationships under the wrong event. A check-in outranks the window (see
 * resolveCurrentEvent in lib/events.ts).
 *
 * You can only be in one place, so checking in anywhere clears every other
 * open check-in for this user. `checkedIn: false` withdraws it without
 * claiming you have left the event entirely - that is what left_at is for,
 * and it stays independent.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { checkedIn?: boolean } | null;
  const checkingIn = body?.checkedIn !== false;

  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ ok: true, preview: true });
  }

  const supabase = await createApiSupabaseClient(request);
  const now = new Date().toISOString();

  if (checkingIn) {
    // Close any other open check-in first. Doing this before the write means a
    // failure here cannot leave the user checked into two places at once, which
    // would make attribution ambiguous in exactly the situation check-in exists
    // to disambiguate.
    //
    // Arriving somewhere else is also leaving where you were, so record the
    // departure rather than only forgetting the arrival. Clearing checked_in_at
    // alone held "one place at a time" at this instant but not afterwards: walk
    // from an all-day conference to an evening meetup, and once the meetup ends
    // the conference is still running and un-left, so the time-window fallback
    // hands you straight back to it hours after you walked out. left_at closes
    // that window for good, and checking back in clears it again.
    const { error: clearError } = await supabase
      .from("event_attendance")
      .update({ checked_in_at: null, left_at: now, updated_at: now })
      .eq("user_id", user.id)
      .neq("event_id", id)
      .not("checked_in_at", "is", null);

    if (clearError) {
      return NextResponse.json({ error: "Could not update where you are." }, { status: 500 });
    }
  }

  const { data, error } = await supabase
    .from("event_attendance")
    .update({
      checked_in_at: checkingIn ? now : null,
      // Arriving supersedes a previous "I've left" for the same event - coming
      // back should not require undoing that separately.
      ...(checkingIn ? { left_at: null } : {}),
      updated_at: now,
    })
    .eq("event_id", id)
    .eq("user_id", user.id)
    .eq("status", "going")
    .select("event_id, checked_in_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Could not update where you are." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "You're not marked as going to this event." }, { status: 404 });
  }

  return NextResponse.json(
    { ok: true, checkedInAt: data.checked_in_at ?? null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
