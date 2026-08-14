import { NextResponse } from "next/server";

import { contactFromRow, contactToRow, isContactUuid, type ContactRow } from "../../../lib/contacts-server";
import type { Contact } from "../../../lib/contacts";
import { createApiSupabaseClient, resolveApiUser } from "../../../lib/auth/api-request";
import { detectEncounterConflict } from "../../../lib/encounter-conflict";

function isContact(value: unknown): value is Contact {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Contact;
  return typeof candidate.id === "string" && typeof candidate.firstName === "string";
}

async function findExistingContact(
  supabase: Awaited<ReturnType<typeof createApiSupabaseClient>>,
  workspaceId: string,
  contact: Contact,
) {
  if (isContactUuid(contact.id)) {
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", contact.id)
      .maybeSingle();
    if (data) return data as ContactRow;
  }

  if (contact.exchangeId) {
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("exchange_id", contact.exchangeId)
      .maybeSingle();
    if (data) return data as ContactRow;
  }

  const { data } = await supabase
    .from("contacts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("legacy_id", contact.id)
    .maybeSingle();

  return (data as ContactRow | null) ?? null;
}

export async function GET(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ contacts: [], preview: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const supabase = await createApiSupabaseClient(request);
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("workspace_id", user.workspaceId)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "We couldn’t load your contacts." }, { status: 500 });
  }

  return NextResponse.json({
    contacts: ((data ?? []) as ContactRow[]).map(contactFromRow),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    const body = await request.json().catch(() => null) as Contact | null;
    return NextResponse.json({ contact: body, preview: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const body = await request.json().catch(() => null);
  if (!isContact(body)) {
    return NextResponse.json({ error: "A valid contact is required." }, { status: 400 });
  }

  const supabase = await createApiSupabaseClient(request);
  const existing = await findExistingContact(supabase, user.workspaceId, body);
  if (existing && detectEncounterConflict(existing.updated_at, body.updatedAt)) {
    return NextResponse.json({
      error: "This contact changed on another device. Reload the latest details before saving again.",
      conflict: true,
      serverUpdatedAt: existing.updated_at,
    }, { status: 409 });
  }
  const row = contactToRow(body, user.workspaceId, user.id, existing?.id);

  const write = existing && body.updatedAt
    ? supabase
        .from("contacts")
        .update(row)
        .eq("id", existing.id)
        .eq("workspace_id", user.workspaceId)
        .eq("updated_at", body.updatedAt)
        .select("*")
        .maybeSingle()
    : supabase
        .from("contacts")
        .upsert(row, { onConflict: "id" })
        .select("*")
        .single();
  const { data, error } = await write;

  if (!error && !data && existing && body.updatedAt) {
    return NextResponse.json({
      error: "This contact changed on another device. Reload the latest details before saving again.",
      conflict: true,
    }, { status: 409 });
  }

  if (error || !data) {
    return NextResponse.json({ error: "We couldn’t save this contact." }, { status: 500 });
  }

  return NextResponse.json({
    contact: contactFromRow(data as ContactRow),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
