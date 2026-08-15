import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../lib/auth/api-request";

export async function GET(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  }

  const supabase = await createApiSupabaseClient(request);
  const { data, error } = await supabase
    .from("card_exchanges")
    .select("id, visitor_name, visitor_email, visitor_phone, visitor_company, visitor_role, note, status, created_at, event_id, events(title), cards(full_name, slug)")
    .in("status", ["new", "imported"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "We couldn’t load inbound captures." }, { status: 500 });
  }

  return NextResponse.json({ exchanges: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  }

  const supabase = await createApiSupabaseClient(request);

  const body = await request.json().catch(() => null) as { id?: string; status?: string } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const status = body?.status;
  if (!id || (status !== "imported" && status !== "dismissed")) {
    return NextResponse.json({ error: "Invalid update." }, { status: 400 });
  }

  const { error } = await supabase.from("card_exchanges").update({ status }).eq("id", id);
  if (error) {
    return NextResponse.json({ error: "We couldn’t update that capture." }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
