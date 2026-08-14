import "server-only";

const PRODUCTION_APP_URL = "https://ehllo.io";

export function resolveAppUrl(requestUrl?: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (requestUrl) return new URL(requestUrl).origin;
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/+$/, "")}`;
  }
  return PRODUCTION_APP_URL;
}

export function resolveAppUrlFromHeaders(
  headers: Headers,
  fallbackRequestUrl = PRODUCTION_APP_URL,
) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;

  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (host) {
    const protocol = headers.get("x-forwarded-proto") ?? "https";
    return `${protocol}://${host.split(",")[0]?.trim()}`.replace(/\/+$/, "");
  }

  return resolveAppUrl(fallbackRequestUrl);
}
