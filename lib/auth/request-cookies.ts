export type RequestCookie = {
  name: string;
  value: string;
};

function decodeCookieValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseCookieHeader(header: string | null): RequestCookie[] {
  if (!header) return [];

  return header.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 1) return [];
    const name = part.slice(0, separator).trim();
    if (!name) return [];
    return [{ name, value: decodeCookieValue(part.slice(separator + 1).trim()) }];
  });
}

/**
 * Vinext has previously returned an incomplete NextRequest cookie collection in
 * route handlers. Supabase OAuth PKCE keeps its verifier in that collection, so
 * losing one cookie turns a successful Google return into an invalid callback.
 * Merge the raw Cookie header as a standards-level fallback without changing
 * the normal Next/Supabase path.
 */
export function mergeRequestCookies(parsed: RequestCookie[], rawHeader: string | null) {
  const merged = new Map(parseCookieHeader(rawHeader).map((cookie) => [cookie.name, cookie]));
  parsed.forEach((cookie) => merged.set(cookie.name, { name: cookie.name, value: cookie.value }));
  return [...merged.values()];
}

export function hasPkceVerifier(cookies: RequestCookie[]) {
  return cookies.some((cookie) => cookie.name.includes("-code-verifier"));
}
