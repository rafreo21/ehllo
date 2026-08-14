import { NextResponse, type NextRequest } from "next/server";

import { getAppUser } from "../../../../../lib/auth/context";
import { connectProviderFromCode } from "../../../../../lib/integrations/connected-accounts";
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
    await connectProviderFromCode(user, "google", request.url, code);
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
