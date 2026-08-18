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
    // Returning only the friendly sentence made every cause identical from the
    // outside: a card that does not exist in this environment looked exactly
    // like a database fault, so the offline queue retried a request that could
    // never succeed and blamed the user's people list for it. Log the real
    // reason; the slug is not sensitive and is what makes this diagnosable.
    console.error("[people-connections] link_people_connection_from_scan failed", {
      slug,
      code: error.code,
      message: error.message,
    });

    // A missing card is a permanent answer, not a transient one. Say so with a
    // 404 so the client can stop retrying and explain what actually happened.
    const { data: card } = await supabase
      .from("cards")
      .select("slug")
      .eq("slug", slug)
      .maybeSingle();
    if (!card) {
      return NextResponse.json(
        {
          // A code, not just prose. The client has to decide whether to keep
          // retrying, and matching on the sentence broke the moment the copy
          // used a typographic apostrophe the client did not.
          code: "card_not_found",
          error: "That card isn’t available here. It may belong to a different ehllo environment, or have been unpublished.",
        },
        { status: 404 },
      );
    }

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
