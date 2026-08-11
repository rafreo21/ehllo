import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { isBlockedOutboundAddress } from "./outbound-url-safety.ts";

export class UnsafeOutboundUrlError extends Error {}

/**
 * Validates a user-supplied URL is http(s) and does not resolve to a
 * blocked address (see isBlockedOutboundAddress), then fetches it.
 * Redirects are followed by the underlying fetch() without re-validating
 * each hop's target — acceptable for this use case (a best-effort metadata
 * read, not a security boundary around authenticated internal traffic) but
 * not a substitute for network-level egress restrictions if this pattern
 * is reused for something more sensitive later.
 */
export async function fetchExternalUrlSafely(rawUrl: string, init?: RequestInit): Promise<Response> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeOutboundUrlError("That doesn't look like a valid link.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeOutboundUrlError("Only http/https links are supported.");
  }

  const directIpVersion = isIP(parsed.hostname);
  const resolved = directIpVersion
    ? [parsed.hostname]
    : (await lookup(parsed.hostname, { all: true }).catch(() => [])).map((entry) => entry.address);
  // Some runtimes' dns.lookup(..., { all: true }) mixes CNAME chain hostnames
  // in with the resolved IPs (e.g. CDN-fronted domains). Only the actual IP
  // entries are meaningful for this check — a hostname string isn't itself
  // routable, so it's neither safe nor unsafe on its own.
  const addresses = resolved.filter((address) => isIP(address) !== 0);

  if (!addresses.length || addresses.some((address) => isBlockedOutboundAddress(address))) {
    throw new UnsafeOutboundUrlError("This link can't be reached.");
  }

  return fetch(parsed.toString(), init);
}
