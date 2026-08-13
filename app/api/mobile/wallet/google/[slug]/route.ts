import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getAppUserFromRequest } from "../../../../../../lib/auth/mobile-api-auth";
import { prepareGoogleWalletSaveUrl } from "../../../../../../lib/google-wallet-pass";
import { WALLET_CARD_SELECT, walletCardFromRow } from "../../../../../../lib/wallet-card-loader";
import { readPublicSupabaseConfig } from "../../../../../../lib/supabase/env";
import { isGoogleWalletConfigured, readGoogleWalletConfig } from "../../../../../../lib/wallet-config";

async function loadWalletCard(slug: string, request: Request, workspaceId: string, accessToken: string) {
  const config = readPublicSupabaseConfig().config;
  if (!config) return null;
  const supabase = createSupabaseClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
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
  const authHeader = request.headers.get("Authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const user = await getAppUserFromRequest(request);
  if (!user || !accessToken) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { slug } = await context.params;
  const normalized = slug?.trim().toLowerCase();
  if (!normalized) {
    return NextResponse.json({ error: "A card slug is required." }, { status: 400 });
  }

  if (!isGoogleWalletConfigured()) {
    return NextResponse.json({
      configured: false,
      error: "Google Wallet is not configured for this environment. Add GOOGLE_WALLET_ISSUER_ID and GOOGLE_WALLET_SERVICE_ACCOUNT_JSON on the server.",
      setup: ["GOOGLE_WALLET_ISSUER_ID", "GOOGLE_WALLET_SERVICE_ACCOUNT_JSON"],
    }, { status: 503 });
  }

  const card = await loadWalletCard(normalized, request, user.workspaceId, accessToken);
  if (!card) {
    return NextResponse.json({ error: "Publish this card before creating a Wallet pass." }, { status: 404 });
  }

  try {
    const saveUrl = await prepareGoogleWalletSaveUrl(card, readGoogleWalletConfig()!);
    return NextResponse.json({ configured: true, saveUrl }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "We couldn’t create the Google Wallet save link.",
    }, { status: 500 });
  }
}
