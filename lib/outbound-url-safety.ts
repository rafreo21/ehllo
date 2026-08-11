import { isIP } from "node:net";

/**
 * Blocks loopback, private, link-local (including the 169.254.169.254
 * cloud metadata endpoint), and other non-public IPv4/IPv6 ranges. Used
 * before any server-side fetch of a user-pasted URL (see
 * lib/outbound-url-guard.ts and app/api/events/extract) so a pasted link
 * can't be used to reach internal services or cloud metadata from this
 * server. Pure and unit-tested directly — the async fetch wrapper that
 * calls this lives in outbound-url-guard.ts (server-only) instead.
 */
export function isBlockedOutboundAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split(".").map(Number);
    const [a, b] = octets;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
    if (a === 0) return true; // "this network"
    if (a >= 224) return true; // multicast/reserved
    return false;
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    if (normalized === "::1") return true; // loopback
    if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true; // link-local
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
    if (normalized.startsWith("::ffff:")) return isBlockedOutboundAddress(normalized.slice(7)); // IPv4-mapped
    return false;
  }
  return true; // unresolvable/unknown — fail closed
}
