import { normalizeConnectionSource, type ConnectionSource } from "./card-slug.ts";

/**
 * Records which surface a connection came through.
 *
 * Three paths create connections and each one used to decide this for itself - or, on
 * the web, not at all. /api/people/connections wrote a source; the two browser paths
 * that redeem a visitor's card link (the auth callback and visitor onboarding) called
 * link_people_connection_from_scan directly and recorded nothing. So the surface that
 * matters most for the product question - somebody who followed a stranger's card and
 * signed up because of it - was the one surface with no attribution at all.
 *
 * One writer, so the rule holds in one place instead of three.
 *
 * Never overwrites: a row that already names a surface keeps it, so the column answers
 * "where did we meet" rather than "where did I last scan them". A null can still be
 * filled, because otherwise rows created before this column existed - and every row
 * created by the paths that never wrote one - stay blank forever with no way back.
 */
/**
 * Just the shape this needs, rather than a full client type. The three callers hold
 * three differently-parameterised Supabase clients - request-scoped, service, and the
 * auth callback's own - and naming any one of them here would only make the other two
 * cast at the call site.
 */
type ScanSourceUpdater = {
  from: (table: string) => {
    update: (values: { scan_source: string }) => {
      eq: (column: string, value: string) => {
        is: (column: string, value: null) => PromiseLike<{ error: { message: string } | null }>;
      };
    };
  };
};

export async function recordConnectionScanSource(
  supabase: ScanSourceUpdater,
  connectionId: string | null | undefined,
  source: ConnectionSource | string | null | undefined,
): Promise<void> {
  const normalized = normalizeConnectionSource(source);
  if (!connectionId || !normalized) return;

  const { error } = await supabase
    .from("people_connections")
    .update({ scan_source: normalized })
    .eq("id", connectionId)
    .is("scan_source", null);

  // Best effort by design - the connection itself is already made, and losing the
  // attribution must not fail a scan. But it says so, because the last version of this
  // failed silently and the column read as "nobody scans from there" rather than
  // "we never wrote it down".
  if (error) {
    console.error("[connection-scan-source] could not record the surface", {
      connectionId,
      source: normalized,
      message: error.message,
    });
  }
}

/**
 * The surface for a connection redeemed in a browser.
 *
 * Defaults to "web" because that is literally what happened - they completed it on the
 * website - while honouring an explicit marker when the link carried one. An NFC tag
 * tapped by somebody without the app installed lands in a browser, and calling that
 * "web" would lose the only interesting thing about it.
 */
export function browserConnectionSource(source: unknown): ConnectionSource {
  return normalizeConnectionSource(source) ?? "web";
}
