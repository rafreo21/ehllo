import { createServiceSupabaseClient } from "./supabase/service.ts";
import { pushPassUpdate } from "./wallet-pass-apns.ts";
import { readAppleWalletCerts } from "./wallet-config.ts";

export const WALLET_PASS_REGISTRATIONS_TABLE = "wallet_pass_registrations";

/**
 * Tells every device holding this card's pass to come and fetch it again.
 *
 * Best-effort in the same way push notification dispatch is: a card save must never
 * fail because a device could not be reached, and nothing here throws. The pass on
 * the device is stale, not wrong, and the next update or manual refresh will catch
 * it up.
 *
 * The serial number is the card slug - see the serialNumber comment in
 * apple-wallet-pass.ts. That equivalence is the only reason this function can find
 * registrations from a slug alone.
 */
export async function notifyWalletPassUpdated(slug: string): Promise<void> {
  try {
    const certs = readAppleWalletCerts();
    // No signing material means no passes were ever issued from this environment,
    // so there is nothing registered to notify.
    if (!certs) return;

    const normalized = slug.trim().toLowerCase();
    if (!normalized) return;

    const supabase = createServiceSupabaseClient();
    // No service role configured means no server-side database access, so there is
    // nothing to look up and nothing to notify.
    if (!supabase) return;

    const { data, error } = await supabase
      .from(WALLET_PASS_REGISTRATIONS_TABLE)
      .select("id, push_token")
      .eq("pass_type_identifier", certs.passTypeId)
      .eq("serial_number", normalized);
    if (error || !data?.length) return;

    const rows = data as Array<{ id: string; push_token: string }>;
    // Distinct tokens: two devices can legitimately share one push token, and
    // sending twice would be wasted work rather than a second notification.
    const byToken = new Map<string, string[]>();
    for (const row of rows) {
      const ids = byToken.get(row.push_token) ?? [];
      ids.push(row.id);
      byToken.set(row.push_token, ids);
    }

    const results = await pushPassUpdate([...byToken.keys()], certs);

    // Only 410 Gone gets cleaned up. A timeout or a 5xx is APNs having a bad
    // moment, and deleting a registration for that would silently unsubscribe
    // someone who is still holding the pass.
    const deadIds = results
      .filter((result) => result.expired)
      .flatMap((result) => byToken.get(result.pushToken) ?? []);
    if (deadIds.length) {
      await supabase.from(WALLET_PASS_REGISTRATIONS_TABLE).delete().in("id", deadIds);
    }
  } catch {
    // Deliberately silent - see the note above about never failing the save.
  }
}
