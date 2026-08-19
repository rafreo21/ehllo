import { NextResponse } from "next/server";

import { buildAppleWalletPass } from "@/lib/apple-wallet-pack.ts";
import { createServiceSupabaseClient } from "@/lib/supabase/service.ts";
import { WALLET_CARD_SELECT, walletCardFromRow } from "@/lib/wallet-card-loader.ts";
import { passTokenFromRequest, verifyPassAuthenticationToken } from "@/lib/wallet-pass-auth.ts";
import { readAppleWalletCerts } from "@/lib/wallet-config.ts";

/**
 * The current version of a pass, fetched by the device after an update push.
 *
 * Runs as the service role because the caller is a device, not a signed-in person.
 * That is safe only because of the status filter below: this returns exactly what a
 * published card already shows to anyone with its link, and nothing for a card that
 * is unpublished or gone.
 */
type Params = {
  params: Promise<{ passTypeIdentifier: string; serialNumber: string }>;
};

export async function GET(request: Request, context: Params) {
  const { passTypeIdentifier, serialNumber } = await context.params;
  const serial = serialNumber?.trim().toLowerCase() ?? "";
  const passType = passTypeIdentifier?.trim() ?? "";
  if (!serial || !passType) return new NextResponse(null, { status: 400 });

  if (!verifyPassAuthenticationToken(serial, passTokenFromRequest(request))) {
    return new NextResponse(null, { status: 401 });
  }

  const certs = readAppleWalletCerts();
  if (!certs || certs.passTypeId !== passType) return new NextResponse(null, { status: 401 });

  const supabase = createServiceSupabaseClient();
  // Without the service role these endpoints cannot function at all. 500 rather than
  // 401: the device's credential was fine, ours is not, and a 401 would make iOS drop
  // the registration over our own misconfiguration.
  if (!supabase) return new NextResponse(null, { status: 500 });
  const { data, error } = await supabase
    .from("cards")
    .select(`${WALLET_CARD_SELECT}, updated_at`)
    .eq("slug", serial)
    .eq("status", "published")
    .maybeSingle();

  // 410 Gone, not 404. Apple reads Gone as "delete this pass from the device", which
  // is the right outcome for a card that has been unpublished or removed - the
  // alternative is a pass that sits in someone's Wallet forever showing details its
  // owner has already taken down.
  if (error || !data) return new NextResponse(null, { status: 410 });

  const row = data as Record<string, unknown> & { updated_at: string | null };
  const updatedAt = row.updated_at ? new Date(row.updated_at) : new Date();

  // Apple sends back the Last-Modified we gave it. Answering 304 saves rebuilding
  // and re-signing a pass that has not changed, which is the expensive part here.
  const ifModifiedSince = request.headers.get("if-modified-since");
  if (ifModifiedSince) {
    const seen = Date.parse(ifModifiedSince);
    if (Number.isFinite(seen) && Math.floor(updatedAt.getTime() / 1000) <= Math.floor(seen / 1000)) {
      return new NextResponse(null, { status: 304 });
    }
  }

  try {
    const card = walletCardFromRow(row as never, request);
    const pass = await buildAppleWalletPass(card, certs);
    return new NextResponse(new Uint8Array(pass), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="${serial}.pkpass"`,
        "Last-Modified": updatedAt.toUTCString(),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    // A build failure is ours, not the device's. 500 makes it retry later; 410 would
    // make it throw the pass away over a transient problem.
    return new NextResponse(null, { status: 500 });
  }
}
