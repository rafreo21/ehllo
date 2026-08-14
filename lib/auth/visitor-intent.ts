export type VisitorIntent = {
  intent: "visitor";
  slug?: string;
  exchangeId?: string;
  shareToken?: string;
  eventInviteToken?: string;
  email?: string;
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
  };
}

export function buildAuthHref(intent: VisitorIntent | { slug?: string; exchangeId?: string; shareToken?: string; eventInviteToken?: string; email?: string }) {
  const params = new URLSearchParams({
    intent: "visitor",
    next: VISITOR_DEFAULT_DESTINATION,
  });
  if (intent.slug) params.set("slug", intent.slug);
  if ("exchangeId" in intent && intent.exchangeId) params.set("exchangeId", intent.exchangeId);
  if ("shareToken" in intent && intent.shareToken) params.set("shareToken", intent.shareToken);
  if ("eventInviteToken" in intent && intent.eventInviteToken) params.set("eventInviteToken", intent.eventInviteToken);
  if ("email" in intent && intent.email) params.set("email", intent.email.trim().toLowerCase());
  return `/auth?${params.toString()}`;
}

export function appendVisitorIntentToCallback(callback: URL, intent: VisitorIntent | null) {
  if (!intent) return;
  callback.searchParams.set("intent", intent.intent);
  if (intent.slug) callback.searchParams.set("slug", intent.slug);
  if (intent.exchangeId) callback.searchParams.set("exchangeId", intent.exchangeId);
  if (intent.shareToken) callback.searchParams.set("shareToken", intent.shareToken);
  if (intent.eventInviteToken) callback.searchParams.set("eventInviteToken", intent.eventInviteToken);
}

export function visitorOnboardingPath(intent: VisitorIntent | null) {
  const params = new URLSearchParams();
  if (intent?.slug) params.set("slug", intent.slug);
  if (intent?.exchangeId) params.set("exchangeId", intent.exchangeId);
  if (intent?.shareToken) params.set("shareToken", intent.shareToken);
  if (intent?.eventInviteToken) params.set("eventInviteToken", intent.eventInviteToken);
  const query = params.toString();
  return query ? `/onboarding/visitor?${query}` : "/onboarding/visitor";
}
