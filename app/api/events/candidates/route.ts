import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../lib/auth/api-request";
import { syncCalendarCandidates } from "../../../../lib/events-server";

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
  if (!synced.length) {
    return NextResponse.json({ candidates: [], providerStatus, syncedAt }, { headers: { "Cache-Control": "private, no-store" } });
  }

  // syncCalendarCandidates upserts every structurally-worthy calendar entry
  // it finds, including ones the user already decided on a previous fetch —
  // exclude those here so "candidates" only ever means "awaiting a decision".
  const { data: decided } = await supabase
    .from("event_attendance")
    .select("event_id")
    .eq("user_id", user.id)
    .in("event_id", synced.map((event) => event.id));

  const decidedIds = new Set((decided ?? []).map((row) => row.event_id as string));
  const candidates = synced.filter((event) => !decidedIds.has(event.id));

  return NextResponse.json({ candidates, providerStatus, syncedAt }, { headers: { "Cache-Control": "private, no-store" } });
}
