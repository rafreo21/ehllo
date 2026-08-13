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
    return NextResponse.json({ error: "Enter the name you want Ehllo to use." }, { status: 400 });
  }

  const intent = parseVisitorIntent(new URLSearchParams(
    typeof body?.slug === "string" || typeof body?.exchangeId === "string" || typeof body?.shareToken === "string"
      ? {
          intent: "visitor",
          ...(typeof body?.slug === "string" ? { slug: body.slug } : {}),
          ...(typeof body?.exchangeId === "string" ? { exchangeId: body.exchangeId } : {}),
          ...(typeof body?.shareToken === "string" ? { shareToken: body.shareToken } : {}),
        }
      : { intent: "visitor" },
  ));

  const { error: onboardingError } = await supabase.rpc("complete_visitor_onboarding", {
    p_display_name: displayName,
  });
  if (onboardingError) {
    return NextResponse.json({ error: "We couldn’t finish setting up your account." }, { status: 500 });
  }

  if (intent?.exchangeId) {
    await supabase.rpc("link_people_connection_from_exchange", { p_exchange_id: intent.exchangeId });
  } else if (intent?.slug) {
    await supabase.rpc("link_people_connection_from_scan", { p_slug: intent.slug });
  } else if (intent?.shareToken) {
    await supabase.rpc("link_people_connection_from_share_token", { p_share_token: intent.shareToken });
    await supabase.rpc("claim_guest_encounter_participants", { p_share_token: intent.shareToken });
  }

  await supabase.rpc("link_people_connections_for_email");

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
