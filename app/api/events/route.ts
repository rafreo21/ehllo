import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../lib/auth/api-request";
import { eventFromRow, type EventRow } from "../../../lib/events-server";

export async function GET(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ events: [], preview: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const supabase = await createApiSupabaseClient(request);

  // "My Events" only ever shows events this user is going to — candidates
  // awaiting a decision come from GET /api/events/candidates instead, so a
  // calendar entry never appears here until the user has actually said yes.
  const { data, error } = await supabase
    .from("event_attendance")
    .select("left_at, events!inner(*)")
    .eq("user_id", user.id)
    .eq("status", "going")
    .order("starts_at", { referencedTable: "events", ascending: true });

  if (error) {
    return NextResponse.json({ error: "We couldn’t load your events." }, { status: 500 });
  }

  const events = ((data ?? []) as unknown as Array<{ left_at: string | null; events: EventRow | null }>)
    .flatMap((row) => (row.events ? [{ ...eventFromRow(row.events), leftAt: row.left_at }] : []));

  return NextResponse.json({ events }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    title?: string;
    location?: string;
    startsAt?: string;
    endsAt?: string;
    sourceUrl?: string;
  } | null;

  const title = body?.title?.trim().slice(0, 160) ?? "";
  const startsAt = body?.startsAt?.trim() ?? "";
  if (!body || !title || !startsAt || Number.isNaN(Date.parse(startsAt))) {
    return NextResponse.json({ error: "An event needs at least a name and a start time." }, { status: 400 });
  }
  const endsAt = body.endsAt?.trim() && !Number.isNaN(Date.parse(body.endsAt.trim())) ? body.endsAt.trim() : null;
  const sourceUrl = body.sourceUrl?.trim().slice(0, 2000) ?? "";

  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ ok: true, preview: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const supabase = await createApiSupabaseClient(request);
  const { data, error } = await supabase.from("events").insert({
    workspace_id: user.workspaceId,
    created_by_user_id: user.id,
    title,
    location: body.location?.trim().slice(0, 320) ?? "",
    starts_at: startsAt,
    ends_at: endsAt,
    source: sourceUrl ? "link" : "manual",
    source_url: sourceUrl,
  }).select("*").single();

  if (error || !data) {
    return NextResponse.json({ error: "We couldn’t save this event." }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, event: eventFromRow(data as EventRow) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
