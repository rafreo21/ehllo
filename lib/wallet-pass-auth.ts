import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The authenticationToken a .pkpass carries so the device can talk to us later.
 *
 * Deliberately not the same thing as createWalletPassToken in wallet-pass-token.ts.
 * That one authorises a browser to download a pass once and expires in five minutes;
 * this one is written *into* the pass, stored on the device indefinitely, and sent
 * back on every web service call for the life of that pass. A five-minute token
 * would make every registered pass stop updating five minutes after it was added.
 *
 * Derived rather than stored: an HMAC of the serial under a server-only key. That
 * means no table to keep in step with the passes in the wild, and no way for a
 * caller to mint one. It also means a pass cannot be individually revoked - rotating
 * the key invalidates every pass at once - which is the trade accepted here, because
 * a pass only ever exposes what the published card already shows publicly.
 *
 * Apple requires at least 16 characters. A hex SHA-256 is 64.
 */
function signingKey() {
  // The same server-only secret wallet-pass-token.ts uses, for the same reason:
  // every environment that signs passes already has it, and one more required
  // variable is one more way for a deploy to come up broken.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  return key || null;
}

/** Namespaced so a token minted here can never be confused with any other HMAC over the same slug. */
function digest(serialNumber: string, key: string) {
  return createHmac("sha256", key).update(`applepass:v1:${serialNumber}`).digest("hex");
}

export function createPassAuthenticationToken(serialNumber: string): string | null {
  const key = signingKey();
  return key ? digest(serialNumber, key) : null;
}

/**
 * Constant-time comparison. A pass web service is an unauthenticated public
 * endpoint that answers "is this token right?", which is exactly the shape a timing
 * attack wants.
 */
export function verifyPassAuthenticationToken(serialNumber: string, provided: string | null | undefined): boolean {
  const key = signingKey();
  if (!key || !provided) return false;

  const expected = Buffer.from(digest(serialNumber, key), "hex");
  let candidate: Buffer;
  try {
    candidate = Buffer.from(provided.trim(), "hex");
  } catch {
    return false;
  }
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

/**
 * Pulls the token out of the header PassKit actually sends, which is
 * `Authorization: ApplePass <token>` - not Bearer. Case-insensitive on the scheme
 * because the header is written by someone else's client.
 */
export function passTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^ApplePass\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}
