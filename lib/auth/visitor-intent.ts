import { normalizeConnectionSource } from "../card-slug.ts";

export type VisitorIntent = {
  intent: "visitor";
  slug?: string;
  exchangeId?: string;
  shareToken?: string;
  eventInviteToken?: string;
  email?: string;
  /**
   * Which surface the card link came from, carried as `s` the whole way through the
   * funnel: card page, /auth, the OAuth callback, visitor onboarding. Without it, an
   * NFC tag tapped by somebody who does not have the app - who therefore lands in a
   * browser and signs up there - was indistinguishable from any other web arrival, and
   * the tap was the only interesting thing about it. Short name because it rides on a
   * QR-shortened URL.
   */
  source?: string;
};

export const VISITOR_DEFAULT_DESTINATION = "/app/people";

export function parseVisitorIntent(searchParams: URLSearchParams): VisitorIntent | null {
  if (searchParams.get("intent") !== "visitor") return null;
  return {
    intent: "visitor",
    slug: searchParams.get("slug")?.trim() || undefined,
    exchangeId: searchParams.get("exchangeId")?.trim() || undefined,
    shareToken: searchParams.get("shareToken")?.trim() || undefined,
    eventInviteToken: searchParams.get("eventInviteToken")?.trim() || undefined,
    email: searchParams.get("email")?.trim().toLowerCase() || undefined,
    // Validated here rather than carried raw, so an unrecognised value is dropped at the
    // edge instead of travelling three redirects to be rejected at the far end.
    source: normalizeConnectionSource(searchParams.get("s")) || undefined,
  };
}

export function buildAuthHref(intent: VisitorIntent | { slug?: string; exchangeId?: string; shareToken?: string; eventInviteToken?: string; email?: string; source?: string }) {
  const params = new URLSearchParams({
    intent: "visitor",
    next: VISITOR_DEFAULT_DESTINATION,
  });
  if (intent.slug) params.set("slug", intent.slug);
  if ("exchangeId" in intent && intent.exchangeId) params.set("exchangeId", intent.exchangeId);
  if ("shareToken" in intent && intent.shareToken) params.set("shareToken", intent.shareToken);
  if ("eventInviteToken" in intent && intent.eventInviteToken) params.set("eventInviteToken", intent.eventInviteToken);
  if ("email" in intent && intent.email) params.set("email", intent.email.trim().toLowerCase());
  if ("source" in intent && intent.source) params.set("s", intent.source);
  return `/auth?${params.toString()}`;
}

export function appendVisitorIntentToCallback(callback: URL, intent: VisitorIntent | null) {
  if (!intent) return;
  callback.searchParams.set("intent", intent.intent);
  if (intent.slug) callback.searchParams.set("slug", intent.slug);
  if (intent.exchangeId) callback.searchParams.set("exchangeId", intent.exchangeId);
  if (intent.shareToken) callback.searchParams.set("shareToken", intent.shareToken);
  if (intent.eventInviteToken) callback.searchParams.set("eventInviteToken", intent.eventInviteToken);
  if (intent.source) callback.searchParams.set("s", intent.source);
}

export function visitorOnboardingPath(intent: VisitorIntent | null) {
  const params = new URLSearchParams();
  if (intent?.slug) params.set("slug", intent.slug);
  if (intent?.exchangeId) params.set("exchangeId", intent.exchangeId);
  if (intent?.shareToken) params.set("shareToken", intent.shareToken);
  if (intent?.eventInviteToken) params.set("eventInviteToken", intent.eventInviteToken);
  if (intent?.source) params.set("s", intent.source);
  const query = params.toString();
  return query ? `/onboarding/visitor?${query}` : "/onboarding/visitor";
}
