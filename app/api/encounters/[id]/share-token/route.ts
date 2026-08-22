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

  let shareToken = typeof data === "string" ? data.trim() : "";

  // Nothing back can mean the meeting really is not yours to read - or that it was shared
  // with your address and never attached to your account. A participant row is only tied to
  // an account by a claim, and until now the only claim ran during visitor onboarding: the
  // path a brand new signup takes. So a meeting shared between two people who both already
  // used ehllo was permanently invisible to the recipient, and this route truthfully said it
  // had not been shared with them.
  //
  // Claimed here rather than only on sign-in, so somebody already signed in when the share
  // arrived does not have to sign out and back in to see it. It can only ever claim rows
  // matching their own verified address on meetings whose owner has actually shared them.
  if (!shareToken) {
    const { data: claimed, error: claimError } = await supabase.rpc("claim_my_encounter_participants");

    // Said out loud rather than swallowed. The first version of this discarded the error, so
    // when a share still would not open there was no way to tell "nothing to claim" from
    // "the claim never ran" - and that is exactly the ambiguity that cost an afternoon.
    if (claimError) {
      console.error("[encounter-share-token] claiming shared participants failed", {
        encounterId,
        code: claimError.code,
        message: claimError.message,
      });
    }

    // Retried whatever the claim reported. The previous version only retried when the count
    // came back as a number greater than zero, which made a successful claim depend on the
    // shape of a value we do not control: anything else - a string, a null, a transport
    // quirk - skipped the retry and reported the meeting as unshared even though the row had
    // just been attached. One extra read is cheaper than that class of bug.
    const retry = await supabase.rpc("get_share_token_for_participant", {
      p_encounter_id: encounterId,
    });
    shareToken = typeof retry.data === "string" ? retry.data.trim() : "";

    if (!shareToken) {
      // Logged as a fact rather than an error: plenty of meetings genuinely are not shared
      // with the caller, and that is a normal answer. It is here so the two cases can be
      // told apart from the outside.
      console.info("[encounter-share-token] no share token after claiming", {
        encounterId,
        claimed,
      });
    }
  }

  if (!shareToken) {
    return NextResponse.json(
      { code: "not_shared", error: "This meeting hasn’t been shared with you." },
      { status: 404 },
    );
  }

  return NextResponse.json({ shareToken }, { headers: { "Cache-Control": "private, no-store" } });
}
