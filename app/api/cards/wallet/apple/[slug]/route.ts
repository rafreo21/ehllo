import { NextResponse } from "next/server";

import { buildAppleWalletPass } from "../../../../../../lib/apple-wallet-pack";
import { getAppUser } from "../../../../../../lib/auth/context";
import { createClient } from "../../../../../../lib/supabase/server";
import { cardUrlForSlug, WALLET_CARD_SELECT, walletCardFromRow } from "../../../../../../lib/wallet-card-loader";
import { isAppleWalletConfigured, readAppleWalletCerts, type WalletCardPayload } from "../../../../../../lib/wallet-config";

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

  if (user.id === "local-development-preview") {
    if (!isAppleWalletConfigured()) {
      return NextResponse.json({
        configured: false,
        error: "Apple Wallet signing is not configured for this environment.",
        setup: [
          "APPLE_WALLET_PASS_TYPE_ID",
          "APPLE_WALLET_TEAM_ID",
          "APPLE_WALLET_WWDR_CERT",
          "APPLE_WALLET_SIGNER_CERT",
          "APPLE_WALLET_SIGNER_KEY",
        ],
      }, { status: 503 });
    }
    const certs = readAppleWalletCerts()!;
    const previewCard: WalletCardPayload = {
      slug: normalized,
      fullName: "Preview User",
      role: "Consultant",
      company: "Ehllo",
      bio: "Preview pass for local development.",
      themeColor: "#9fe870",
      cardUrl: cardUrlForSlug(normalized, request),
    };
    const pass = await buildAppleWalletPass(previewCard, certs);
    return new NextResponse(pass, {
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="${normalized}.pkpass"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const card = await loadWalletCard(normalized, request, user.workspaceId);
  if (!card) {
    return NextResponse.json({ error: "Publish this card before creating a Wallet pass." }, { status: 404 });
  }

  if (!isAppleWalletConfigured()) {
    return NextResponse.json({
      configured: false,
      error: "Apple Wallet signing is not configured for this environment.",
      setup: [
        "APPLE_WALLET_PASS_TYPE_ID",
        "APPLE_WALLET_TEAM_ID",
        "APPLE_WALLET_WWDR_CERT",
        "APPLE_WALLET_SIGNER_CERT",
        "APPLE_WALLET_SIGNER_KEY",
      ],
    }, { status: 503 });
  }

  try {
    const pass = await buildAppleWalletPass(card, readAppleWalletCerts()!);
    return new NextResponse(pass, {
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="${normalized}.pkpass"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "We couldn’t sign this Wallet pass.",
    }, { status: 500 });
  }
}
