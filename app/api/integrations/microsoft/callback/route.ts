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
  const flow = readIntegrationFlow(request, "microsoft");
  const user = (await getAppUser()) ?? flow?.user ?? null;
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");
  const successTarget = flow?.returnTo
    ? appendIntegrationParam(flow.returnTo, "microsoft-connected")
    : new URL("/business/activate?integration=microsoft-connected", request.url).toString();
  const errorTarget = flow?.returnTo
    ? appendIntegrationParam(flow.returnTo, "microsoft-error")
    : new URL("/business/activate?integration=microsoft-error", request.url).toString();

  if (!user || oauthError || !code || !readIntegrationState(request, "microsoft")) {
    console.error("[microsoft-callback] rejected before token exchange", {
      hasUser: Boolean(user),
      oauthError,
      hasCode: Boolean(code),
      stateValid: readIntegrationState(request, "microsoft"),
    });
    const response = NextResponse.redirect(errorTarget);
    clearIntegrationStateCookie(response);
    return response;
  }

  try {
    // See the google callback for why a service-role client is needed here.
    const serviceClient = createServiceSupabaseClient();
    await connectProviderFromCode(user, "microsoft", request.url, code, serviceClient ?? undefined);
  } catch (caught) {
    console.error("[microsoft-callback] connectProviderFromCode failed", caught);
    const response = NextResponse.redirect(errorTarget);
    clearIntegrationStateCookie(response);
    return response;
  }

  const response = NextResponse.redirect(successTarget);
  clearIntegrationStateCookie(response);
  return response;
}
