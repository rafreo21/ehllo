import "server-only";

import type { IntegrationProvider } from "./types";
import { GOOGLE_INTEGRATION_SCOPES, MICROSOFT_INTEGRATION_SCOPES } from "./types";

export function appBaseUrl(requestUrl: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return new URL(requestUrl).origin;
}

export function googleIntegrationConfigured() {
  return Boolean(process.env.GOOGLE_INTEGRATION_CLIENT_ID?.trim() && process.env.GOOGLE_INTEGRATION_CLIENT_SECRET?.trim());
}

export function microsoftIntegrationConfigured() {
  return Boolean(process.env.MICROSOFT_INTEGRATION_CLIENT_ID?.trim() && process.env.MICROSOFT_INTEGRATION_CLIENT_SECRET?.trim());
}

export function integrationRedirectUri(requestUrl: string, provider: IntegrationProvider) {
  return `${appBaseUrl(requestUrl)}/api/integrations/${provider}/callback`;
}

export function googleAuthorizeUrl(requestUrl: string, state: string, loginHint?: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_INTEGRATION_CLIENT_ID!.trim(),
    redirect_uri: integrationRedirectUri(requestUrl, "google"),
    response_type: "code",
    scope: GOOGLE_INTEGRATION_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "select_account consent",
    state,
  });
  // Pre-selects the account tied to this ehllo login - the user can still
  // pick a different Google account via the chooser, but this saves them
  // from Google silently defaulting to whichever account the device's
  // browser last used, which may not be the one they meant to connect.
  if (loginHint) params.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function microsoftAuthorizeUrl(requestUrl: string, state: string) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_INTEGRATION_CLIENT_ID!.trim(),
    redirect_uri: integrationRedirectUri(requestUrl, "microsoft"),
    response_type: "code",
    scope: MICROSOFT_INTEGRATION_SCOPES.join(" "),
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeGoogleCode(requestUrl: string, code: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_INTEGRATION_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_INTEGRATION_CLIENT_SECRET!.trim(),
      redirect_uri: integrationRedirectUri(requestUrl, "google"),
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error(`Google token exchange failed: ${response.status} ${await response.text()}`);
  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  }>;
}

export async function exchangeMicrosoftCode(requestUrl: string, code: string) {
  const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.MICROSOFT_INTEGRATION_CLIENT_ID!.trim(),
      client_secret: process.env.MICROSOFT_INTEGRATION_CLIENT_SECRET!.trim(),
      redirect_uri: integrationRedirectUri(requestUrl, "microsoft"),
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error("Microsoft token exchange failed.");
  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  }>;
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_INTEGRATION_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_INTEGRATION_CLIENT_SECRET!.trim(),
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error("Google token refresh failed.");
  return response.json() as Promise<{ access_token: string; expires_in?: number }>;
}

export async function refreshMicrosoftAccessToken(refreshToken: string) {
  const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.MICROSOFT_INTEGRATION_CLIENT_ID!.trim(),
      client_secret: process.env.MICROSOFT_INTEGRATION_CLIENT_SECRET!.trim(),
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error("Microsoft token refresh failed.");
  return response.json() as Promise<{ access_token: string; expires_in?: number; refresh_token?: string }>;
}

export async function fetchGoogleAccountEmail(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return "";
  const payload = await response.json() as { email?: string };
  return payload.email?.trim() ?? "";
}

export async function fetchMicrosoftAccountEmail(accessToken: string) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return "";
  const payload = await response.json() as { mail?: string; userPrincipalName?: string };
  return payload.mail?.trim() || payload.userPrincipalName?.trim() || "";
}

export function expiresAtFromNow(seconds?: number) {
  if (!seconds || seconds <= 0) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export { parseScopes } from "./email";
