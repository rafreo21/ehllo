import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived tokens that let a .pkpass be fetched by a plain GET.
 *
 * iOS only shows its native "Add to Apple Wallet" sheet when it fetches a
 * pass itself and sees application/vnd.apple.pkpass. Downloading the file
 * inside the app and handing it to the share sheet - what we did before -
 * makes Wallet one option in a list of many, which is not what anyone means by
 * "add to Wallet". Safari cannot send an Authorization header, so the pass
 * endpoint needs a credential it can carry in the URL instead.
 *
 * The token authorises one card's pass for a few minutes. That is deliberately
 * narrow: a pass only ever contains what the published card already shows
 * publicly, so the blast radius of a leaked link is one public card for five
 * minutes, and it cannot be used to reach anything else.
 */
const TOKEN_TTL_MS = 5 * 60 * 1000;

function signingKey() {
  // Server-only and always present wherever passes are signed. A dedicated
  // secret would be tidier, but every environment already has this one and an
  // extra required variable is its own source of outages.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  return key || null;
}

function digest(slug: string, expiresAt: number, key: string) {
  return createHmac("sha256", key).update(`${slug}:${expiresAt}`).digest("hex");
}

export function createWalletPassToken(slug: string): { token: string; expiresAt: number } | null {
  const key = signingKey();
  if (!key) return null;
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  return { token: `${expiresAt}.${digest(slug, expiresAt, key)}`, expiresAt };
}

export function verifyWalletPassToken(slug: string, token: string): boolean {
  const key = signingKey();
  if (!key || !token) return false;

  const [rawExpiry, provided] = token.split(".");
  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || !provided) return false;
  if (Date.now() > expiresAt) return false;

  const expected = digest(slug, expiresAt, key);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(provided, "hex");
  // Length must match before timingSafeEqual, which throws on a mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}
