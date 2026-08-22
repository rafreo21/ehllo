import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  parseVisitorIntent,
  VISITOR_DEFAULT_DESTINATION,
  visitorOnboardingPath,
} from "../../../lib/auth/visitor-intent";
import { sanitizeIntendedDestination } from "../../../lib/auth/redirect";
import { hasPkceVerifier, mergeRequestCookies } from "../../../lib/auth/request-cookies";
import { browserConnectionSource, recordConnectionScanSource } from "../../../lib/connection-scan-source";
import { requirePublicSupabaseConfig } from "../../../lib/supabase/env";

type ProvisionResult = {
  onboarding_status?: string;
};

function createClient(request: NextRequest, response: NextResponse) {
  const config = requirePublicSupabaseConfig();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => mergeRequestCookies(request.cookies.getAll(), request.headers.get("cookie")),
      setAll: (items) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });
}

function redirectWithSession(request: NextRequest, sessionResponse: NextResponse, target: string) {
  const redirect = NextResponse.redirect(new URL(target, request.url));
  redirect.headers.set("Cache-Control", "private, no-store");
  sessionResponse.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie);
  });
  return redirect;
}

function redirectToAuth(request: NextRequest, error: "oauth_provider" | "oauth_exchange" | "provisioning") {
  return NextResponse.redirect(new URL(`/auth?error=${error}`, request.url));
}

async function linkVisitorConnections(
  supabase: ReturnType<typeof createClient>,
  intent: ReturnType<typeof parseVisitorIntent>,
) {
  if (!intent) return;

  // Same defect the visitor onboarding route had: these were awaited and thrown
  // away, so a visitor who followed a card here and got no connection looked
  // exactly like one whose link worked. This is the primary sign-in path, so it
  // mattered more here. Sign-in itself must still succeed - the account is real
  // either way - but the reason has to be recoverable.
  const logLinkFailure = (name: string, error: { code?: string; message: string } | null) => {
    if (!error) return;
    console.error(`[auth-callback] ${name} failed`, { code: error.code, message: error.message });
  };

  if (intent.eventInviteToken) {
    const { error } = await supabase.rpc("claim_event_invitation", { p_token: intent.eventInviteToken });
    logLinkFailure("claim_event_invitation", error);
  }
  if (intent.exchangeId) {
    const { error } = await supabase.rpc("link_people_connection_from_exchange", { p_exchange_id: intent.exchangeId });
    logLinkFailure("link_people_connection_from_exchange", error);
  } else if (intent.slug) {
    const { data, error } = await supabase.rpc("link_people_connection_from_scan", { p_slug: intent.slug });
    logLinkFailure("link_people_connection_from_scan", error);
    // The surface, which this path never recorded. Somebody following a stranger's card
    // to a browser and signing up is the most valuable arrival in the product, and it
    // was the one with no attribution at all - so "which surface gets people
    // connecting" could not see it. Defaults to web; an NFC tap says nfc.
    if (!error) {
      const connectionId = (data as { connectionId?: string } | null)?.connectionId;
      await recordConnectionScanSource(supabase, connectionId, browserConnectionSource(intent.source));
    }
  }
}

async function readOnboardingStatus(supabase: ReturnType<typeof createClient>) {
  const { data: provisioned, error: provisionError } = await supabase
    .rpc("provision_personal_workspace")
    .single<ProvisionResult>();
  if (!provisionError && provisioned?.onboarding_status) {
    return provisioned.onboarding_status;
  }

  const { data: context, error: contextError } = await supabase.rpc("get_my_app_context").single<ProvisionResult>();
  if (!contextError && context?.onboarding_status) {
    return context.onboarding_status;
  }

  return null;
}

export async function GET(request: NextRequest) {
  const intent = parseVisitorIntent(request.nextUrl.searchParams);
  const next = sanitizeIntendedDestination(request.nextUrl.searchParams.get("next"))
    || (intent ? VISITOR_DEFAULT_DESTINATION : "/app");
  const sessionResponse = NextResponse.redirect(new URL(next, request.url));
  sessionResponse.headers.set("Cache-Control", "private, no-store");
  const supabase = createClient(request, sessionResponse);

  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError || !code) {
    console.error("[auth-callback] OAuth provider did not return a code", {
      error: oauthError,
      description: request.nextUrl.searchParams.get("error_description"),
    });
    return redirectToAuth(request, "oauth_provider");
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    const callbackCookies = mergeRequestCookies(request.cookies.getAll(), request.headers.get("cookie"));
    console.error("[auth-callback] OAuth code exchange failed", {
      code: exchangeError.code,
      message: exchangeError.message,
      hasPkceVerifier: hasPkceVerifier(callbackCookies),
      cookieCount: callbackCookies.length,
      origin: request.nextUrl.origin,
    });
    return redirectToAuth(request, "oauth_exchange");
  }

  const onboardingStatus = await readOnboardingStatus(supabase);
  if (!onboardingStatus) {
    await supabase.auth.signOut();
    return redirectToAuth(request, "provisioning");
  }

  const { error: backfillError } = await supabase.rpc("link_people_connections_for_email");
  // Meetings shared with this address, claimed the same way and at the same moment. Until
  // now this only ran during visitor onboarding, so a share to somebody who already had an
  // account was never attached to it and the meeting stayed invisible to them.
  const { error: encounterClaimError } = await supabase.rpc("claim_my_encounter_participants");
  if (encounterClaimError) {
    console.error("[auth-callback] claim_my_encounter_participants failed", {
      code: encounterClaimError.code, message: encounterClaimError.message,
    });
  }
  if (backfillError) {
    console.error("[auth-callback] link_people_connections_for_email failed", {
      code: backfillError.code, message: backfillError.message,
    });
  }

  if (onboardingStatus !== "completed") {
    const destination = intent ? visitorOnboardingPath(intent) : "/onboarding";
    return redirectWithSession(request, sessionResponse, destination);
  }

  if (intent) {
    await linkVisitorConnections(supabase, intent);
    return redirectWithSession(request, sessionResponse, VISITOR_DEFAULT_DESTINATION);
  }

  return redirectWithSession(request, sessionResponse, next);
}
