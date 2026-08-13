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

  const possibleCandidates = [
    ...synced,
    ...((selfAdded ?? []) as EventRow[]).map(eventFromRow),
  ];

  if (!possibleCandidates.length) {
    return NextResponse.json({ candidates: [], providerStatus, syncedAt }, { headers: { "Cache-Control": "private, no-store" } });
  }

  // syncCalendarCandidates upserts every structurally-worthy calendar entry
  // it finds, including ones the user already decided on a previous fetch —
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
