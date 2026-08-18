import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../lib/auth/api-request";
import { eventFromRow, syncCalendarCandidates, type EventRow } from "../../../../lib/events-server";

export async function GET(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({
      candidates: [],
      preview: true,
      providerStatus: { google: "not_connected", microsoft: "not_connected" },
      syncedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const supabase = await createApiSupabaseClient(request);
  const { candidates: synced, providerStatus, syncedAt } = await syncCalendarCandidates(supabase, user);

  // Links and manually entered events use the same undecided attendance flow
  // as calendar suggestions. Absence of an attendance row means the user has
  // not chosen Going or Not going yet.
  const { data: selfAdded, error: selfAddedError } = await supabase
    .from("events")
    .select("*")
    .eq("created_by_user_id", user.id)
    .in("source", ["manual", "link"])
    .eq("status", "scheduled")
    .order("starts_at", { ascending: true })
    .limit(250);

  if (selfAddedError) {
    return NextResponse.json({ error: "We couldn’t load your added events." }, { status: 500 });
  }

  // Events somebody invited this user to.
  //
  // This was the missing third source. A calendar suggestion and a self-added
  // event both surface here purely by having no attendance row - the schema is
  // explicit that absence means undecided - but an invitation created only an
  // event_invitations row, which nothing on this path read. So inviting an
  // existing ehllo user put nothing in their app at all: their only way in was
  // finding the email and tapping the token link, and until they did,
  // claim_event_invitation never ran and no attendance row existed.
  //
  // An invitation is the same kind of thing as the other two - a decision
  // waiting to be made - so it belongs in the same place rather than in a new
  // "invited" status. Going and Not going then flow through the attendance path
  // that already exists, and the email link keeps working for anyone who uses it.
  const { data: invited, error: invitedError } = await supabase
    .from("event_invitations")
    .select("invited_email, status, events!inner(*)")
    .ilike("invited_email", user.email)
    .neq("status", "revoked")
    .limit(250);

  if (invitedError) {
    // Say why rather than quietly returning a shorter list: an invitation that
    // silently fails to appear is indistinguishable from never being invited.
    console.error("[event-candidates] could not read invitations for this user", {
      code: invitedError.code,
      message: invitedError.message,
    });
  }

  const invitedEvents = ((invited ?? []) as unknown as Array<{ events: EventRow | null }>)
    .flatMap((row) => (row.events && row.events.status === "scheduled" ? [eventFromRow(row.events)] : []));

  const possibleCandidates = [
    ...synced,
    ...((selfAdded ?? []) as EventRow[]).map(eventFromRow),
    ...invitedEvents,
  ];

  if (!possibleCandidates.length) {
    return NextResponse.json({ candidates: [], providerStatus, syncedAt }, { headers: { "Cache-Control": "private, no-store" } });
  }

  // syncCalendarCandidates upserts every structurally-worthy calendar entry
  // it finds, including ones the user already decided on a previous fetch -
  // exclude those here so "candidates" only ever means "awaiting a decision".
  const { data: decided } = await supabase
    .from("event_attendance")
    .select("event_id")
    .eq("user_id", user.id)
    .in("event_id", possibleCandidates.map((event) => event.id));

  const decidedIds = new Set((decided ?? []).map((row) => row.event_id as string));
  const candidates = possibleCandidates.filter((event, index) => (
    !decidedIds.has(event.id)
    && possibleCandidates.findIndex((candidate) => candidate.id === event.id) === index
  ));

  return NextResponse.json({ candidates, providerStatus, syncedAt }, { headers: { "Cache-Control": "private, no-store" } });
}
