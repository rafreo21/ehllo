import { NextResponse } from "next/server";

import { parseVisitorIntent } from "../../../../lib/auth/visitor-intent";
import { createClient } from "../../../../lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
  if (displayName.length < 2 || displayName.length > 100) {
    return NextResponse.json({ error: "Enter the name you want ehllo to use." }, { status: 400 });
  }

  const intent = parseVisitorIntent(new URLSearchParams(
    typeof body?.slug === "string" || typeof body?.exchangeId === "string" || typeof body?.shareToken === "string" || typeof body?.eventInviteToken === "string"
      ? {
          intent: "visitor",
          ...(typeof body?.slug === "string" ? { slug: body.slug } : {}),
          ...(typeof body?.exchangeId === "string" ? { exchangeId: body.exchangeId } : {}),
          ...(typeof body?.shareToken === "string" ? { shareToken: body.shareToken } : {}),
          ...(typeof body?.eventInviteToken === "string" ? { eventInviteToken: body.eventInviteToken } : {}),
        }
      : { intent: "visitor" },
  ));

  const { error: onboardingError } = await supabase.rpc("complete_visitor_onboarding", {
    p_display_name: displayName,
  });
  if (onboardingError) {
    return NextResponse.json({ error: "We couldn’t finish setting up your account." }, { status: 500 });
  }

  // Linking is the entire reason this visitor followed a card, an exchange, or
  // a shared meeting here, and every one of these calls used to fail in total
  // silence: the result was awaited and then discarded. A visitor whose link
  // raised ("card not found", "exchange email mismatch") got the same cheerful
  // {ok:true} as one whose link worked, and the first symptom was an empty
  // People list with no way to tell a missing card from a database fault.
  //
  // Onboarding itself has already succeeded by the time we get here, so a
  // failed link must not fail the request - the account is real either way.
  // But it must say why, for the same reason the scan route does.
  const logLinkFailure = (name: string, error: { code?: string; message: string } | null) => {
    if (!error) return;
    console.error(`[visitor-onboarding] ${name} failed`, { code: error.code, message: error.message });
  };

  if (intent?.exchangeId) {
    const { error } = await supabase.rpc("link_people_connection_from_exchange", { p_exchange_id: intent.exchangeId });
    logLinkFailure("link_people_connection_from_exchange", error);
  } else if (intent?.slug) {
    const { error } = await supabase.rpc("link_people_connection_from_scan", { p_slug: intent.slug });
    logLinkFailure("link_people_connection_from_scan", error);
  } else if (intent?.shareToken) {
    const { error: linkError } = await supabase.rpc("link_people_connection_from_share_token", { p_share_token: intent.shareToken });
    logLinkFailure("link_people_connection_from_share_token", linkError);
    const { error: claimError } = await supabase.rpc("claim_guest_encounter_participants", { p_share_token: intent.shareToken });
    logLinkFailure("claim_guest_encounter_participants", claimError);
  }
  if (intent?.eventInviteToken) {
    const { error: claimError } = await supabase.rpc("claim_event_invitation", { p_token: intent.eventInviteToken });
    if (claimError) return NextResponse.json({ error: "This event invitation belongs to a different email or is no longer available." }, { status: 409 });
  }

  const { error: backfillError } = await supabase.rpc("link_people_connections_for_email");
  logLinkFailure("link_people_connections_for_email", backfillError);

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
