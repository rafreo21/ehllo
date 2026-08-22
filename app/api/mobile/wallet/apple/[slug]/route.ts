import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { buildAppleWalletPass } from "../../../../../../lib/apple-wallet-pack";
import { getAppUserFromRequest } from "../../../../../../lib/auth/mobile-api-auth";
import { WALLET_CARD_SELECT, walletCardFromRow } from "../../../../../../lib/wallet-card-loader";
import { readPublicSupabaseConfig } from "../../../../../../lib/supabase/env";
import { createServiceSupabaseClient } from "../../../../../../lib/supabase/service";
import { isAppleWalletConfigured, readAppleWalletCerts } from "../../../../../../lib/wallet-config";
import { createWalletPassToken, verifyWalletPassToken } from "../../../../../../lib/wallet-pass-token";

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

/**
 * A token authorises exactly one published card's pass, so the lookup is
 * scoped to published cards rather than to a workspace the request no longer
 * carries.
 */
async function loadPublishedWalletCard(slug: string, request: Request) {
  const service = createServiceSupabaseClient();
  if (!service) return null;
  const { data, error } = await service
    .from("cards")
    .select(WALLET_CARD_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error || !data) return null;
  return walletCardFromRow(data, request);
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const normalized = slug?.trim().toLowerCase();
  if (!normalized) {
    return NextResponse.json({ error: "A card slug is required." }, { status: 400 });
  }

  // Safari cannot send an Authorization header, and iOS only offers its native
  // "Add to Apple Wallet" sheet for a pass it fetched itself. A short-lived
  // signed token in the URL lets the same endpoint serve both callers.
  const passToken = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  const tokenValid = passToken ? verifyWalletPassToken(normalized, passToken) : false;

  const authHeader = request.headers.get("Authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const user = tokenValid ? null : await getAppUserFromRequest(request);
  if (!tokenValid && (!user || !accessToken)) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  if (!isAppleWalletConfigured()) {
    return NextResponse.json({
      configured: false,
      error: "Apple Wallet signing is not configured for this environment.",
    }, { status: 503 });
  }

  const card = tokenValid
    ? await loadPublishedWalletCard(normalized, request)
    : await loadWalletCard(normalized, request, user!.workspaceId, accessToken);
  if (!card) {
    return NextResponse.json({ error: "Publish this card before creating a Wallet pass." }, { status: 404 });
  }

  try {
    const pass = await buildAppleWalletPass(card, readAppleWalletCerts()!);
    // A Node Buffer is not a BodyInit. Handing over its bytes is, and copying
    // into a fresh Uint8Array avoids shipping the whole pooled ArrayBuffer
    // that Buffer may be a view into.
    //
    // The comment sits above the `return`, not after it. Below it, JavaScript's
    // automatic semicolon insertion turned this into a bare `return;` and left
    // the response unreachable, so every Apple Wallet pass answered 500 with an
    // empty body - a blank page instead of the Add to Wallet sheet.
    return new NextResponse(new Uint8Array(pass), {
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="${normalized}.pkpass"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    // Returning the reason only in the response body kept every pass-signing
    // failure out of Vercel's runtime errors, so a broken deployment looked
    // identical to a healthy one until someone tapped the button on a phone.
    console.error("[apple-wallet] pass build failed", {
      slug: normalized,
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({
      error: error instanceof Error ? error.message : "We couldn’t sign this Wallet pass.",
    }, { status: 500 });
  }
}

/**
 * Mints the short-lived URL the app hands to iOS.
 *
 * The app cannot ask iOS to present the Add to Wallet sheet directly without
 * native code, but Safari can: opening a URL that returns
 * application/vnd.apple.pkpass makes iOS show its own sheet. This returns that
 * URL, so the behaviour ships in an OTA update instead of a new build.
 */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const user = await getAppUserFromRequest(request);
  const authHeader = request.headers.get("Authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!user || !accessToken) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { slug } = await context.params;
  const normalized = slug?.trim().toLowerCase();
  if (!normalized) return NextResponse.json({ error: "A card slug is required." }, { status: 400 });

  if (!isAppleWalletConfigured()) {
    return NextResponse.json({
      configured: false,
      error: "Apple Wallet signing is not configured for this environment.",
    }, { status: 503 });
  }

  // Only mint a link for a card this user actually owns and has published.
  const card = await loadWalletCard(normalized, request, user.workspaceId, accessToken);
  if (!card) {
    return NextResponse.json({ error: "Publish this card before creating a Wallet pass." }, { status: 404 });
  }

  const minted = createWalletPassToken(normalized);
  if (!minted) {
    return NextResponse.json({ error: "Wallet links are not configured for this environment." }, { status: 503 });
  }

  const base = new URL(request.url);
  const passUrl = `${base.origin}/api/mobile/wallet/apple/${encodeURIComponent(normalized)}?token=${encodeURIComponent(minted.token)}`;
  return NextResponse.json(
    { passUrl, expiresAt: minted.expiresAt },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
