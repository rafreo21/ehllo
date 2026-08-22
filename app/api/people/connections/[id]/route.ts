import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../../lib/auth/api-request";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { name?: string } | null;
  const name = body?.name?.trim() || "";
  if (!id?.trim() || !name) return NextResponse.json({ error: "A name is required." }, { status: 400 });
  const supabase = await createApiSupabaseClient(request);
  const { error } = await supabase.from("people_connections").update({ person_name: name }).eq("id", id).eq("workspace_id", user.workspaceId);
  if (error) return NextResponse.json({ error: "We couldn’t update this connection." }, { status: 500 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await resolveApiUser(_request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });

  const { id } = await context.params;
  const connectionId = id?.trim();
  if (!connectionId) {
    return NextResponse.json({ error: "A connection id is required." }, { status: 400 });
  }

  const supabase = await createApiSupabaseClient(_request);
  const { error } = await supabase
    .from("people_connections")
    .delete()
    .eq("id", connectionId)
    .eq("workspace_id", user.workspaceId);

  if (error) {
    return NextResponse.json({ error: "We couldn’t remove this connection." }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
