import { NextResponse } from "next/server";

import { getAppUser } from "../../../../../../lib/auth/context";
import { buildGoogleWalletSaveUrl } from "../../../../../../lib/google-wallet-pass";
import { createClient } from "../../../../../../lib/supabase/server";
import { cardUrlForSlug, WALLET_CARD_SELECT, walletCardFromRow } from "../../../../../../lib/wallet-card-loader";
import { isGoogleWalletConfigured, readGoogleWalletConfig, type WalletCardPayload } from "../../../../../../lib/wallet-config";

async function loadWalletCard(slug: string, request: Request, workspaceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cards")
    .select(WALLET_CARD_SELECT)
    .eq("slug", slug.toLowerCase())
    .eq("workspace_id", workspaceId)
    .eq("status", "published")
    .maybeSingle();

  if (error || !data) return null;
  return walletCardFromRow(data, request);
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });

  const { slug } = await context.params;
  const normalized = slug?.trim().toLowerCase();
  if (!normalized) {
    return NextResponse.json({ error: "A card slug is required." }, { status: 400 });
  }

  if (!isGoogleWalletConfigured()) {
    return NextResponse.json({
      configured: false,
      error: "Google Wallet is not configured for this environment.",
      setup: ["GOOGLE_WALLET_ISSUER_ID", "GOOGLE_WALLET_SERVICE_ACCOUNT_JSON"],
    }, { status: 503 });
  }

  let card: WalletCardPayload | null = null;
  if (user.id === "local-development-preview") {
    card = {
      slug: normalized,
      fullName: "Preview User",
      role: "Consultant",
      company: "ehllo",
      bio: "Preview pass for local development.",
      themeColor: "#9fe870",
      cardUrl: cardUrlForSlug(normalized, request),
    };
  } else {
    card = await loadWalletCard(normalized, request, user.workspaceId);
  }

  if (!card) {
    return NextResponse.json({ error: "Publish this card before creating a Wallet pass." }, { status: 404 });
  }

  try {
    const saveUrl = buildGoogleWalletSaveUrl(card, readGoogleWalletConfig()!);
    return NextResponse.json({ configured: true, saveUrl }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "We couldn’t create the Google Wallet save link.",
    }, { status: 500 });
  }
}
