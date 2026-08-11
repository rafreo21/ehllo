import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import type { AppUser } from "../../../lib/auth/context";

const INTEGRATION_STATE_COOKIE = "aftermeet-integration-state";
const INTEGRATION_FLOW_COOKIE = "aftermeet-integration-flow";

export type IntegrationFlowContext = {
  state: string;
  user: AppUser;
  returnTo: string;
};

export function createIntegrationState(provider: string) {
  return `${provider}:${randomBytes(16).toString("hex")}`;
}

export function readIntegrationState(request: NextRequest, provider: string) {
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const cookie = request.cookies.get(INTEGRATION_STATE_COOKIE)?.value ?? "";
  return state && cookie === state && state.startsWith(`${provider}:`);
}

export function setIntegrationStateCookie(response: NextResponse, state: string) {
  response.cookies.set(INTEGRATION_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
}

export function clearIntegrationStateCookie(response: NextResponse) {
  response.cookies.set(INTEGRATION_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(INTEGRATION_FLOW_COOKIE, "", { path: "/", maxAge: 0 });
}

export function sanitizeMobileReturnTo(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (/^aftermeet(-[a-z0-9]+)?:\/\//i.test(trimmed) || trimmed.startsWith("/app")) return trimmed;
  return "";
}

export function appendIntegrationParam(returnTo: string, integration: string) {
  try {
    const target = new URL(returnTo);
    target.searchParams.set("integration", integration);
    return target.toString();
  } catch {
    const separator = returnTo.includes("?") ? "&" : "?";
    return `${returnTo}${separator}integration=${encodeURIComponent(integration)}`;
  }
}

export function setIntegrationFlowCookie(response: NextResponse, context: IntegrationFlowContext) {
  const payload = Buffer.from(JSON.stringify(context)).toString("base64url");
  response.cookies.set(INTEGRATION_FLOW_COOKIE, payload, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
}

export function readIntegrationFlow(request: NextRequest, provider: string): IntegrationFlowContext | null {
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const raw = request.cookies.get(INTEGRATION_FLOW_COOKIE)?.value;
  if (!raw || !state || !state.startsWith(`${provider}:`)) return null;

  try {
    const context = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as IntegrationFlowContext;
    if (context.state !== state) return null;
    return context;
  } catch {
    return null;
  }
}

export async function resolveIntegrationUser(request: Request) {
  const { resolveApiUser } = await import("../../../lib/auth/api-request");
  const { getAppUserFromRequest } = await import("../../../lib/auth/mobile-api-auth");

  const user = await resolveApiUser(request);
  if (user) return user;

  const url = new URL(request.url);
  const token = url.searchParams.get("access_token")?.trim();
  if (!token) return null;

  return getAppUserFromRequest(new Request(request.url, {
    headers: { Authorization: `Bearer ${token}` },
  }));
}
