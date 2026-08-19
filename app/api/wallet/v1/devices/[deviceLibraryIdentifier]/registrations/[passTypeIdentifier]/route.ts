import { NextResponse } from "next/server";

import { createServiceSupabaseClient } from "@/lib/supabase/service.ts";
import { WALLET_PASS_REGISTRATIONS_TABLE } from "@/lib/wallet-pass-updates.ts";
import { readAppleWalletCerts } from "@/lib/wallet-config.ts";

/**
 * Which of this device's passes have changed since it last asked.
 *
 * Unauthenticated on purpose: Apple's protocol sends no authenticationToken here,
 * because a token belongs to a single pass and this call spans all of them. What
 * comes back is therefore limited to serial numbers the caller already holds - it
 * reveals nothing a device did not register for itself.
 *
 * `passesUpdatedSince` is an opaque tag we chose the meaning of. Here it is
 * cards.updated_at as epoch milliseconds: monotonic, cheap to compare, and already
 * maintained by whatever saves a card.
 */
type Params = {
  params: Promise<{ deviceLibraryIdentifier: string; passTypeIdentifier: string }>;
};

export async function GET(request: Request, context: Params) {
  const { deviceLibraryIdentifier, passTypeIdentifier } = await context.params;
  const device = deviceLibraryIdentifier?.trim() ?? "";
  const passType = passTypeIdentifier?.trim() ?? "";
  if (!device || !passType) return new NextResponse(null, { status: 400 });

  const certs = readAppleWalletCerts();
  if (!certs || certs.passTypeId !== passType) return new NextResponse(null, { status: 204 });

  const supabase = createServiceSupabaseClient();
  // Without the service role these endpoints cannot function at all. 500 rather than
  // 401: the device's credential was fine, ours is not, and a 401 would make iOS drop
  // the registration over our own misconfiguration.
  if (!supabase) return new NextResponse(null, { status: 500 });
  const { data: registrations, error } = await supabase
    .from(WALLET_PASS_REGISTRATIONS_TABLE)
    .select("serial_number")
    .eq("device_library_identifier", device)
    .eq("pass_type_identifier", passType);
  if (error) return new NextResponse(null, { status: 500 });

  const serials = [...new Set((registrations ?? []).map((row) => (row as { serial_number: string }).serial_number))];
  // 204, not an empty list. Apple treats a body with no serials as a protocol error
  // and No Content as "nothing for you", which is what this is.
  if (!serials.length) return new NextResponse(null, { status: 204 });

  const { data: cards } = await supabase
    .from("cards")
    .select("slug, updated_at")
    .in("slug", serials);

  const since = Number(new URL(request.url).searchParams.get("passesUpdatedSince") ?? "");
  const rows = (cards ?? []) as Array<{ slug: string; updated_at: string | null }>;

  let lastUpdated = Number.isFinite(since) ? since : 0;
  const changed: string[] = [];
  for (const row of rows) {
    const updatedAt = row.updated_at ? Date.parse(row.updated_at) : 0;
    if (!Number.isFinite(updatedAt)) continue;
    if (updatedAt > lastUpdated) lastUpdated = updatedAt;
    // Strictly greater than, so the tag the device echoes back does not hand it the
    // same pass again on every poll.
    if (!Number.isFinite(since) || updatedAt > since) changed.push(row.slug);
  }

  if (!changed.length) return new NextResponse(null, { status: 204 });

  return NextResponse.json(
    { lastUpdated: String(lastUpdated), serialNumbers: changed },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
