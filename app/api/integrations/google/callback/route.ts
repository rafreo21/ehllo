import { NextResponse, type NextRequest } from "next/server";

import { getAppUser } from "../../../../../lib/auth/context";
import { connectProviderFromCode } from "../../../../../lib/integrations/connected-accounts";
import { createServiceSupabaseClient } from "../../../../../lib/supabase/service";
import {
  appendIntegrationParam,
  clearIntegrationStateCookie,
  readIntegrationFlow,
  readIntegrationState,
} from "../../_shared";

export async function GET(request: NextRequest) {
  const flow = readIntegrationFlow(request, "google");
  const user = (await getAppUser()) ?? flow?.user ?? null;
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");
  const successTarget = flow?.returnTo
    ? appendIntegrationParam(flow.returnTo, "google-connected")
    : new URL("/app/settings?integration=google-connected", request.url).toString();
  const errorTarget = flow?.returnTo
    ? appendIntegrationParam(flow.returnTo, "google-error")
    : new URL("/app/settings?integration=google-error", request.url).toString();

  if (!user || oauthError || !code || !readIntegrationState(request, "google")) {
    console.error("[google-callback] rejected before token exchange", {
      hasUser: Boolean(user),
      oauthError,
      hasCode: Boolean(code),
      stateValid: readIntegrationState(request, "google"),
    });
    const response = NextResponse.redirect(errorTarget);
    clearIntegrationStateCookie(response);
    return response;
  }

  try {
    // This request arrives from Google's redirect, not the user's own
    // authenticated app session, so there's no session-scoped Supabase
    // client available here — identity was already verified via the
    // signed, httpOnly flow cookie + matching state param above. Use the
    // service-role client so the write isn't blocked by RLS policies that
    // expect a live auth.uid().
    const serviceClient = createServiceSupabaseClient();
    await connectProviderFromCode(user, "google", request.url, code, serviceClient ?? undefined);
  } catch (caught) {
    console.error("[google-callback] connectProviderFromCode failed", caught);
    const response = NextResponse.redirect(errorTarget);
    clearIntegrationStateCookie(response);
    return response;
  }

  const response = NextResponse.redirect(successTarget);
  clearIntegrationStateCookie(response);
  return response;
}
