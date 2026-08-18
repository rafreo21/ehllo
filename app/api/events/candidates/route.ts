import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../lib/auth/api-request";
import { pushDueCalendarEvents } from "../../../../lib/events-calendar-push";
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

  // Drain any calendar pushes this user has waiting, before anything else.
  //
  // The cron is the safety net, not the mechanism: Vercel's Hobby plan allows
  // only one cron run per day, so relying on it alone would leave a new event
  // up to twenty four hours from reaching the calendar. Opening the events
  // screen is the natural moment to flush it - the user is already waiting on a
  // network round trip here, and their own due rows are almost always zero, so
  // the query costs nothing in the common case.
  //
  // Bounded deliberately. This is somebody's screen load, not a worker, so a
  // backlog drains a few at a time across visits rather than holding the
  // response open. Failures keep their backoff and the cron still catches
  // anything that never gets a visit.
  const drained = await pushDueCalendarEvents(supabase, user, 3).catch((caught) => {
    console.error("[event-candidates] calendar push drain failed", {
      message: caught instanceof Error ? caught.message : String(caught),
    });
    return { processed: 0, failed: 0 };
  });

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

  const invitedRows = ((invited ?? []) as unknown as Array<{ events: EventRow | null }>)
    .flatMap((row) => (row.events && row.events.status === "scheduled" ? [row.events] : []));
  const invitedEvents = invitedRows.map(eventFromRow);

  // Who invited them, so the card can say so. Without this an invitee sees
  // "Added by you" on an event they did not add, which is a small lie in the one
  // place they are deciding whether to go.
  const inviterIds = [...new Set(invitedRows.map((row) => row.created_by_user_id))];
  const inviterNames = new Map<string, string>();
  if (inviterIds.length) {
    const { data: inviters } = await supabase
      .from("users")
      .select("id, display_name")
      .in("id", inviterIds);
    for (const row of (inviters ?? []) as Array<{ id: string; display_name: string | null }>) {
      if (row.display_name?.trim()) inviterNames.set(row.id, row.display_name.trim());
    }
  }
  const invitedById = new Map(invitedRows.map((row) => [row.id, inviterNames.get(row.created_by_user_id) ?? ""]));

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

  const decorated = candidates.map((event) => (invitedById.has(event.id)
    ? { ...event, invited: true, invitedByName: invitedById.get(event.id) || "" }
    : event));

  return NextResponse.json(
    { candidates: decorated, providerStatus, syncedAt, calendarPushed: drained.processed, calendarPushFailed: drained.failed },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
