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

function hasTooManyMethodsOfOneType(methods: LibraryCard["methods"]) {
  const counts = new Map<string, number>();
  for (const method of methods) {
    const count = (counts.get(method.type) ?? 0) + 1;
    if (count > 3) return true;
    counts.set(method.type, count);
  }
  return false;
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

/**
 * Archives a card.
 *
 * Mobile used to do this by calling supabase.from('cards').update({ status: 'archived' })
 * directly - the only card write on the phone that did not go through this route. That path
 * depends on the client's own auth state matching what row-level security expects, and when it
 * does not, the update matches nothing and returns no error: the card disappeared from the
 * phone, stayed on the web, and came back on the next load.
 *
 * Here the caller is resolved the same way every other card write resolves it, the workspace
 * is applied server-side rather than trusted from the body, and the archived row is returned so
 * "nothing changed" cannot be mistaken for success.
 */
export async function DELETE(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });

  const url = new URL(request.url);
  const cardId = url.searchParams.get("id")?.trim() || "";
  if (!cardId) return NextResponse.json({ error: "A card id is required." }, { status: 400 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ ok: true, id: cardId, preview: true });
  }

  const supabase = await createApiSupabaseClient(request);
  const { data, error } = await supabase
    .from("cards")
    .update({ status: "archived" })
    .eq("id", cardId)
    .eq("workspace_id", user.workspaceId)
    .neq("status", "archived")
    .select("id");

  if (error) {
    console.error("[cards] could not archive", { cardId, code: error.code, message: error.message });
    return NextResponse.json({ error: "We couldn’t delete this card." }, { status: 500 });
  }

  // Already archived, or not this workspace's card. The same answer either way, deliberately:
  // distinguishing them would say whether a card id exists in somebody else's workspace.
  if (!data?.length) {
    return NextResponse.json({ error: "This card is no longer available." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id: data[0].id }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!isLibraryCard(body)) {
    return NextResponse.json({ error: "A valid card is required." }, { status: 400 });
  }
  if (!slugPattern.test(body.slug.trim()) || body.name.trim().length < 2 || !themePattern.test(body.theme)) {
    return NextResponse.json({ error: "Complete the card name, slug, and theme before saving." }, { status: 400 });
  }
  if (!Array.isArray(body.methods) || hasTooManyMethodsOfOneType(body.methods)) {
    return NextResponse.json({ error: "You can add each contact method up to three times." }, { status: 400 });
  }
  if (user.id === "local-development-preview") {
    return NextResponse.json({ card: body, preview: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const supabase = await createApiSupabaseClient(request);
  const existing = await findExistingCard(supabase, user.workspaceId, body);

  // A deleted card stays deleted. This route upserts whatever status the client sends, so any
  // stale copy saved afterwards - a queued edit from before the delete, another device, or an
  // app that has not taken the update yet - wrote 'draft' straight over 'archived' and the
  // card reappeared. That is the whole of "I deleted it and it came back": deletion was
  // losing a race it should never have been in.
  //
  // 404 rather than a quiet success, so the client drops its copy instead of retrying forever.
  // Unconditional: a LibraryCard can only carry 'draft' or 'published', so nothing legitimate
  // arrives here meaning to archive - deleting goes through DELETE on this route.
  if (existing?.status === "archived") {
    return NextResponse.json(
      { error: "This card was deleted.", deleted: true },
      { status: 404 },
    );
  }

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

  // Replace-by-delete-then-insert, with the destructive half previously
  // unchecked. Two ways that went wrong, both quiet:
  //
  //   delete fails, insert runs   stale contact methods remain alongside the
  //                               replacement set, potentially exceeding the
  //                               per-type limit
  //   delete works, insert fails  the card is left with no contact methods at
  //                               all - published, and unreachable
  //
  // There is no transaction to hold the two halves together, so the least this
  // can do is check both and name which one broke.
  const { error: clearMethodsError } = await supabase
    .from("card_methods").delete().eq("card_id", saved.id);
  if (clearMethodsError) {
    console.error("[cards] could not clear contact methods before rewriting them", {
      cardId: saved.id, code: clearMethodsError.code, message: clearMethodsError.message,
    });
    return NextResponse.json({ error: "We couldn’t save this card’s contact methods." }, { status: 500 });
  }

  const methodRows = methodsForUpsert(saved.id, body.methods);
  if (methodRows.length) {
    const { error: methodError } = await supabase.from("card_methods").insert(methodRows);
    if (methodError) {
      // The delete already happened and cannot be undone from here, so the card
      // is now method-less. Log what they were, so it is recoverable from the
      // log rather than only from the user retyping them.
      console.error("[cards] methods were cleared but could not be rewritten", {
        cardId: saved.id,
        methodCount: methodRows.length,
        methodTypes: methodRows.map((row) => row.method_type),
        code: methodError.code,
        message: methodError.message,
      });
      return NextResponse.json({ error: "We couldn’t save this card’s contact methods." }, { status: 500 });
    }
  }

  const methods = await loadMethods(supabase, saved.id);
  return NextResponse.json({
    card: libraryCardFromRows(saved as CardRow, methods),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
