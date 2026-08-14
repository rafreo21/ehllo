import { NextResponse } from "next/server";

import {
  createIntegrationState,
  resolveIntegrationUser,
  sanitizeMobileReturnTo,
  setIntegrationFlowCookie,
  setIntegrationStateCookie,
} from "../../_shared";
import { googleIntegrationConfigured, googleAuthorizeUrl } from "../../../../../lib/integrations/oauth";

export async function GET(request: Request) {
  const returnTo = sanitizeMobileReturnTo(new URL(request.url).searchParams.get("return_to"));
  const user = await resolveIntegrationUser(request);

  if (!user) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }
  if (user.id === "local-development-preview") {
    return NextResponse.redirect(new URL(returnTo || "/app/settings?integration=preview", request.url));
  }
  if (!googleIntegrationConfigured()) {
    if (returnTo) {
      const { appendIntegrationParam } = await import("../../_shared");
      return NextResponse.redirect(appendIntegrationParam(returnTo, "google-unconfigured"));
    }
    return NextResponse.redirect(new URL(returnTo || "/app/settings?integration=google-unconfigured", request.url));
  }

  const state = createIntegrationState("google");
  const response = NextResponse.redirect(googleAuthorizeUrl(request.url, state, user.email || undefined));
  setIntegrationStateCookie(response, state);
  if (returnTo) {
    setIntegrationFlowCookie(response, { state, user, returnTo });
  }
  return response;
}
