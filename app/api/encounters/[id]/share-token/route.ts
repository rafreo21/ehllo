import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../../lib/auth/api-request";

/**
 * The share token for a meeting the caller is a participant in.
 *
 * This is the way into the guest view from inside the app. The emailed link and
 * the in-app view are the same thing behind a different door: once a participant
 * has the token, /api/encounters/share/[token] builds the payload and
 * .../recording streams the audio, already enforcing status = 'shared' and the
 * three day retention window. Building a parallel payload and a parallel expiry
 * check would be three chances for the two views to drift apart.
 *
 * Entitlement is decided in get_share_token_for_participant, not here.
 *
 * A 404 covers both "no such meeting" and "not shared with you", deliberately:
 * distinguishing them would let anyone enumerate which encounter ids exist.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });

  const { id } = await context.params;
  const encounterId = id?.trim();
  if (!encounterId) {
    return NextResponse.json({ error: "A meeting id is required." }, { status: 400 });
  }

  const supabase = await createApiSupabaseClient(request);
  const { data, error } = await supabase.rpc("get_share_token_for_participant", {
    p_encounter_id: encounterId,
  });

  if (error) {
    console.error("[encounter-share-token] could not resolve a share token", {
      encounterId,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: "We couldn’t open this meeting." }, { status: 500 });
  }

  const shareToken = typeof data === "string" ? data.trim() : "";
  if (!shareToken) {
    return NextResponse.json(
      { code: "not_shared", error: "This meeting hasn’t been shared with you." },
      { status: 404 },
    );
  }

  return NextResponse.json({ shareToken }, { headers: { "Cache-Control": "private, no-store" } });
}
