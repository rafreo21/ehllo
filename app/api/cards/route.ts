import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../lib/auth/api-request";
import {
  libraryCardFromRows,
  libraryCardToRow,
  methodsForUpsert,
  type CardMethodRow,
  type CardRow,
} from "../../../lib/cards-server";
import type { LibraryCard } from "../../../lib/card-library";
import { resolveCardImagesForPublish } from "../../../lib/card-publish-images";
import { createServiceSupabaseClient } from "../../../lib/supabase/service";
import { detectEncounterConflict } from "../../../lib/encounter-conflict";

const slugPattern = /^card-[a-f0-9]{16}$|^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const themePattern = /^#[0-9A-Fa-f]{6}$/;

function isLibraryCard(value: unknown): value is LibraryCard {
  if (!value || typeof value !== "object") return false;
  const card = value as LibraryCard;
  return typeof card.id === "string" && typeof card.slug === "string" && typeof card.name === "string";
}

async function findExistingCard(
  supabase: Awaited<ReturnType<typeof createApiSupabaseClient>>,
  workspaceId: string,
  card: LibraryCard,
) {
  if (card.id) {
    const { data } = await supabase
      .from("cards")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", card.id)
      .maybeSingle();
    if (data) return data as CardRow;
  }

  const { data } = await supabase
    .from("cards")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("slug", card.slug.trim().toLowerCase())
    .maybeSingle();

  return (data as CardRow | null) ?? null;
}

async function loadMethods(
  supabase: Awaited<ReturnType<typeof createApiSupabaseClient>>,
  cardId: string,
) {
  const { data } = await supabase
    .from("card_methods")
    .select("*")
    .eq("card_id", cardId)
    .order("sort_order", { ascending: true });

  return (data ?? []) as CardMethodRow[];
}

export async function GET(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ cards: [], preview: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const supabase = await createApiSupabaseClient(request);
  let query = supabase
    .from("cards")
    .select("*")
    .eq("workspace_id", user.workspaceId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(5);

  if (user.workspaceType === "team") {
    query = query.eq("owner_user_id", user.id);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "We couldn’t load your cards." }, { status: 500 });
  }

  const cards = await Promise.all(((data ?? []) as CardRow[]).map(async (row) => {
    const methods = await loadMethods(supabase, row.id);
    return libraryCardFromRows(row, methods);
  }));

  return NextResponse.json({ cards }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    const body = await request.json().catch(() => null) as LibraryCard | null;
    return NextResponse.json({ card: body, preview: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const body = await request.json().catch(() => null);
  if (!isLibraryCard(body)) {
    return NextResponse.json({ error: "A valid card is required." }, { status: 400 });
  }
  if (!slugPattern.test(body.slug.trim()) || body.name.trim().length < 2 || !themePattern.test(body.theme)) {
    return NextResponse.json({ error: "Complete the card name, slug, and theme before saving." }, { status: 400 });
  }

  const supabase = await createApiSupabaseClient(request);
  const existing = await findExistingCard(supabase, user.workspaceId, body);
  const expectedUpdatedAt = typeof (body as LibraryCard & { expectedUpdatedAt?: unknown }).expectedUpdatedAt === "string"
    ? (body as LibraryCard & { expectedUpdatedAt: string }).expectedUpdatedAt
    : undefined;
  if (existing && detectEncounterConflict(existing.updated_at, expectedUpdatedAt)) {
    return NextResponse.json({
      error: "This card changed on another device. Reload the latest card before saving again.",
      conflict: true,
      serverUpdatedAt: existing.updated_at,
    }, { status: 409 });
  }
  const status = existing?.status === "published" ? "published" : "draft";

  let photo = body.photo || "";
  let coverPhoto = body.coverPhoto || "";
  let companyLogo = body.companyLogo || "";
  const cardId = existing?.id || body.id;
  const service = createServiceSupabaseClient();
  if (service && cardId) {
    try {
      const resolved = await resolveCardImagesForPublish(service, user.workspaceId, cardId, {
        photo,
        coverPhoto,
        companyLogo,
      });
      photo = resolved.photo;
      coverPhoto = resolved.coverPhoto;
      companyLogo = resolved.companyLogo;
    } catch {
      return NextResponse.json({ error: "We couldn’t upload your card images." }, { status: 500 });
    }
  }

  const row = {
    ...libraryCardToRow({ ...body, photo, coverPhoto, companyLogo }, user.workspaceId, status, existing?.id),
    owner_user_id: user.id,
  };

  const write = existing && expectedUpdatedAt
    ? supabase
        .from("cards")
        .update(row)
        .eq("id", existing.id)
        .eq("workspace_id", user.workspaceId)
        .eq("updated_at", expectedUpdatedAt)
        .select("*")
        .maybeSingle()
    : supabase
        .from("cards")
        .upsert(row, { onConflict: "id" })
        .select("*")
        .single();
  const { data: saved, error } = await write;

  if (!error && !saved && existing && expectedUpdatedAt) {
    return NextResponse.json({
      error: "This card changed on another device. Reload the latest card before saving again.",
      conflict: true,
    }, { status: 409 });
  }

  if (error || !saved) {
    const limitReached = error?.message.toLowerCase().includes("five active cards");
    return NextResponse.json(
      { error: limitReached ? "You can save a maximum of five cards." : "We couldn’t save this card." },
      { status: limitReached ? 409 : 500 },
    );
  }

  await supabase.from("card_methods").delete().eq("card_id", saved.id);
  const methodRows = methodsForUpsert(saved.id, body.methods);
  if (methodRows.length) {
    const { error: methodError } = await supabase.from("card_methods").insert(methodRows);
    if (methodError) {
      return NextResponse.json({ error: "We couldn’t save this card’s contact methods." }, { status: 500 });
    }
  }

  const methods = await loadMethods(supabase, saved.id);
  return NextResponse.json({
    card: libraryCardFromRows(saved as CardRow, methods),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
