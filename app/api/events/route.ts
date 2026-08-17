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

  // Every event this user has decided on, going or not, plus cancelled ones.
  // Filtering to status = "going" here meant declining an event erased it from
  // the product: the decision was still stored, and still used to suppress the
  // calendar candidate, but the user was left with no row to see or undo. The
  // client decides what to show where; attendanceStatus is what lets it.
  // Candidates awaiting a first decision still come from
  // GET /api/events/candidates, so a calendar entry never appears here until
  // the user has actually answered.
  const { data, error } = await supabase
    .from("event_attendance")
    .select("left_at, checked_in_at, status, events!inner(*)")
    .eq("user_id", user.id)
    .order("starts_at", { referencedTable: "events", ascending: true });

  if (error) {
    return NextResponse.json({ error: "We couldn’t load your events." }, { status: 500 });
  }

  const events = ((data ?? []) as unknown as Array<{ left_at: string | null; checked_in_at: string | null; status: string; events: EventRow | null }>)
    .flatMap((row) => (row.events
      ? [{
          ...eventFromRow(row.events),
          leftAt: row.left_at,
          checkedInAt: row.checked_in_at,
          attendanceStatus: row.status === "not_going" ? "not_going" : "going",
        }]
      : []));

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
  const suppliedEnd = body.endsAt?.trim() ?? "";
  if (suppliedEnd && (Number.isNaN(Date.parse(suppliedEnd)) || Date.parse(suppliedEnd) <= Date.parse(startsAt))) {
    return NextResponse.json({ error: "The event end time must be after its start time." }, { status: 400 });
  }
  const endsAt = suppliedEnd || null;
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
