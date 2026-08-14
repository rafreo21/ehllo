import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../lib/auth/api-request";

export async function GET(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ connections: [] }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const supabase = await createApiSupabaseClient(request);
  const { data, error } = await supabase.rpc("list_my_people_connections");
  if (error) {
    return NextResponse.json({ error: "We couldn’t load people you’ve met." }, { status: 500 });
  }

  return NextResponse.json({ connections: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const payload = await request.json().catch(() => null) as {
    slug?: string;
    eventSnapshot?: { eventId?: string; eventTitle?: string; eventLocation?: string; occurredAt?: string };
  } | null;
  const slug = payload?.slug?.trim().toLowerCase();
  if (!slug) {
    return NextResponse.json({ error: "A card slug is required." }, { status: 400 });
  }

  const supabase = await createApiSupabaseClient(request);
  const snapshot = payload?.eventSnapshot;
  const { data, error } = await supabase.rpc("link_people_connection_from_scan", {
    p_slug: slug,
    p_event_id: snapshot?.eventId || null,
    p_event_title: snapshot?.eventTitle?.trim().slice(0, 160) || null,
    p_event_location: snapshot?.eventLocation?.trim().slice(0, 320) || null,
    p_occurred_at: snapshot?.occurredAt || null,
  });
  if (error) {
    return NextResponse.json({ error: "We couldn’t link that card to your people list." }, { status: 500 });
  }

  const result = data as {
    connectionId?: string;
    mutual?: boolean;
    personName?: string;
    personRole?: string;
    personCompany?: string;
  } | null;
  return NextResponse.json({
    ok: true,
    connectionId: result?.connectionId,
    mutual: result?.mutual ?? false,
    personName: result?.personName,
    personRole: result?.personRole,
    personCompany: result?.personCompany,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
