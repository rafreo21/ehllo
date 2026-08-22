import { NextResponse } from "next/server";

import { createServiceSupabaseClient } from "@/lib/supabase/service.ts";
import { passTokenFromRequest, verifyPassAuthenticationToken } from "@/lib/wallet-pass-auth.ts";
import { WALLET_PASS_REGISTRATIONS_TABLE } from "@/lib/wallet-pass-updates.ts";
import { readAppleWalletCerts } from "@/lib/wallet-config.ts";

/**
 * PassKit registration, both directions.
 *
 * Called by the device itself, never by our app, so there is no session here. The
 * only credential is the authenticationToken baked into the pass, which is why every
 * path below checks it before touching a row: these URLs are public and the device
 * identifier in them is guessable.
 *
 * Status codes are Apple's, not ours - the device changes behaviour based on them.
 * A 401 in particular makes iOS stop retrying and drop the registration, so it is
 * reserved for a genuinely bad token rather than used for any failure.
 */
type Params = {
  params: Promise<{
    deviceLibraryIdentifier: string;
    passTypeIdentifier: string;
    serialNumber: string;
  }>;
};

function unauthorized() {
  return new NextResponse(null, { status: 401 });
}

async function resolve(context: Params, request: Request) {
  const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } = await context.params;
  const serial = serialNumber?.trim().toLowerCase() ?? "";
  const device = deviceLibraryIdentifier?.trim() ?? "";
  const passType = passTypeIdentifier?.trim() ?? "";

  if (!serial || !device || !passType) return null;
  if (!verifyPassAuthenticationToken(serial, passTokenFromRequest(request))) return null;

  // A token that verifies still has to be for the pass type this environment
  // actually signs, or a staging device could register against production serials.
  const certs = readAppleWalletCerts();
  if (!certs || certs.passTypeId !== passType) return null;

  return { device, passType, serial };
}

export async function POST(request: Request, context: Params) {
  const resolved = await resolve(context, request);
  if (!resolved) return unauthorized();

  let pushToken = "";
  try {
    const body = await request.json() as { pushToken?: unknown };
    pushToken = typeof body?.pushToken === "string" ? body.pushToken.trim() : "";
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!pushToken) return new NextResponse(null, { status: 400 });

  const supabase = createServiceSupabaseClient();
  // Without the service role these endpoints cannot function at all. 500 rather than
  // 401: the device's credential was fine, ours is not, and a 401 would make iOS drop
  // the registration over our own misconfiguration.
  if (!supabase) return new NextResponse(null, { status: 500 });
  const { data: existing } = await supabase
    .from(WALLET_PASS_REGISTRATIONS_TABLE)
    .select("id, push_token")
    .eq("device_library_identifier", resolved.device)
    .eq("pass_type_identifier", resolved.passType)
    .eq("serial_number", resolved.serial)
    .maybeSingle();

  // Apple distinguishes these: 201 means "you are now registered", 200 means "you
  // already were". Returning 201 every time makes the device re-register in a loop.
  if (existing) {
    const row = existing as { id: string; push_token: string };
    if (row.push_token !== pushToken) {
      await supabase
        .from(WALLET_PASS_REGISTRATIONS_TABLE)
        .update({ push_token: pushToken, updated_at: new Date().toISOString() })
        .eq("id", row.id);
    }
    return new NextResponse(null, { status: 200 });
  }

  const { error } = await supabase.from(WALLET_PASS_REGISTRATIONS_TABLE).insert({
    device_library_identifier: resolved.device,
    pass_type_identifier: resolved.passType,
    serial_number: resolved.serial,
    push_token: pushToken,
  });
  // A unique-constraint race with a concurrent registration of the same pass is the
  // 200 case, not a failure.
  if (error) return new NextResponse(null, { status: error.code === "23505" ? 200 : 500 });

  return new NextResponse(null, { status: 201 });
}

export async function DELETE(request: Request, context: Params) {
  const resolved = await resolve(context, request);
  if (!resolved) return unauthorized();

  const supabase = createServiceSupabaseClient();
  if (!supabase) return new NextResponse(null, { status: 500 });

  await supabase
    .from(WALLET_PASS_REGISTRATIONS_TABLE)
    .delete()
    .eq("device_library_identifier", resolved.device)
    .eq("pass_type_identifier", resolved.passType)
    .eq("serial_number", resolved.serial);

  // 200 whether or not a row was there. The device's intent is "stop sending me
  // this", and an already-absent registration satisfies that.
  return new NextResponse(null, { status: 200 });
}
