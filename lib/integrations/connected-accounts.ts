import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "../auth/context";
import { createClient } from "../supabase/server";
import {
  exchangeGoogleCode,
  exchangeMicrosoftCode,
  expiresAtFromNow,
  fetchGoogleAccountEmail,
  fetchMicrosoftAccountEmail,
  parseScopes,
  refreshGoogleAccessToken,
  refreshMicrosoftAccessToken,
} from "./oauth";
import type { ConnectedAccountRow, ConnectedAccountStatus, IntegrationProvider } from "./types";
import { emptyConnectedAccountStatus } from "./types";

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now() + 60_000;
}

export async function listConnectedAccounts(user: AppUser, client?: SupabaseClient) {
  const supabase = client ?? await createClient();
  const { data, error } = await supabase
    .from("connected_accounts")
    .select("*")
    .eq("workspace_id", user.workspaceId)
    .eq("user_id", user.id);

  if (error) return [];
  return (data ?? []) as ConnectedAccountRow[];
}

export async function connectedAccountStatus(user: AppUser, client?: SupabaseClient): Promise<ConnectedAccountStatus> {
  const status = emptyConnectedAccountStatus();
  status.configured.google = Boolean(process.env.GOOGLE_INTEGRATION_CLIENT_ID && process.env.GOOGLE_INTEGRATION_CLIENT_SECRET);
  status.configured.microsoft = Boolean(process.env.MICROSOFT_INTEGRATION_CLIENT_ID && process.env.MICROSOFT_INTEGRATION_CLIENT_SECRET);

  for (const row of await listConnectedAccounts(user, client)) {
    if (row.provider === "google") {
      status.google = {
        connected: true,
        email: row.account_email,
        scopes: row.scopes,
        capabilities: {
          gmail: row.scopes.includes("https://www.googleapis.com/auth/gmail.send"),
          calendar: row.scopes.includes("https://www.googleapis.com/auth/calendar.events"),
          drive: row.scopes.includes("https://www.googleapis.com/auth/drive.file"),
        },
      };
    }
    if (row.provider === "microsoft") {
      status.microsoft = {
        connected: true,
        email: row.account_email,
        scopes: row.scopes,
        capabilities: {
          outlook: row.scopes.includes("Mail.Send"),
          calendar: row.scopes.includes("Calendars.ReadWrite"),
          onedrive: row.scopes.includes("Files.ReadWrite.AppFolder"),
        },
      };
    }
  }

  return status;
}

export async function saveConnectedAccount(
  user: AppUser,
  provider: IntegrationProvider,
  input: {
    accountEmail: string;
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: string | null;
    scopes: string[];
  },
  client?: SupabaseClient,
) {
  const supabase = client ?? await createClient();
  const { error } = await supabase.from("connected_accounts").upsert({
    workspace_id: user.workspaceId,
    user_id: user.id,
    provider,
    account_email: input.accountEmail,
    access_token: input.accessToken,
    refresh_token: input.refreshToken ?? null,
    expires_at: input.expiresAt ?? null,
    scopes: input.scopes,
    updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id,user_id,provider" });

  if (error) throw new Error("We couldn’t save this connected account.");
}

export async function deleteConnectedAccount(user: AppUser, provider: IntegrationProvider, client?: SupabaseClient) {
  const supabase = client ?? await createClient();
  await supabase
    .from("connected_accounts")
    .delete()
    .eq("workspace_id", user.workspaceId)
    .eq("user_id", user.id)
    .eq("provider", provider);
}

export async function connectProviderFromCode(
  user: AppUser,
  provider: IntegrationProvider,
  requestUrl: string,
  code: string,
) {
  if (provider === "google") {
    const token = await exchangeGoogleCode(requestUrl, code);
    const email = await fetchGoogleAccountEmail(token.access_token);
    await saveConnectedAccount(user, "google", {
      accountEmail: email,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: expiresAtFromNow(token.expires_in),
      scopes: parseScopes(token.scope),
    });
    return email;
  }

  const token = await exchangeMicrosoftCode(requestUrl, code);
  const email = await fetchMicrosoftAccountEmail(token.access_token);
  await saveConnectedAccount(user, "microsoft", {
    accountEmail: email,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: expiresAtFromNow(token.expires_in),
    scopes: parseScopes(token.scope),
  });
  return email;
}

/**
 * `client` lets a bearer-token (mobile) request pass its own
 * request-scoped Supabase client instead of the cookie-based default, which
 * has no session outside a web request and would silently see zero rows
 * under RLS. Every internal call (including the refresh-then-persist path)
 * threads the same client through, so a refreshed token actually persists
 * against the identity that requested it.
 */
export async function getConnectedAccountAccessToken(
  user: AppUser,
  provider: IntegrationProvider,
  client?: SupabaseClient,
) {
  const supabase = client ?? await createClient();
  const { data, error } = await supabase
    .from("connected_accounts")
    .select("*")
    .eq("workspace_id", user.workspaceId)
    .eq("user_id", user.id)
    .eq("provider", provider)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as ConnectedAccountRow;
  if (!isExpired(row.expires_at)) return row.access_token;

  if (!row.refresh_token) return null;

  if (provider === "google") {
    const refreshed = await refreshGoogleAccessToken(row.refresh_token);
    await saveConnectedAccount(user, "google", {
      accountEmail: row.account_email,
      accessToken: refreshed.access_token,
      refreshToken: row.refresh_token,
      expiresAt: expiresAtFromNow(refreshed.expires_in),
      scopes: row.scopes,
    }, supabase);
    return refreshed.access_token;
  }

  const refreshed = await refreshMicrosoftAccessToken(row.refresh_token);
  await saveConnectedAccount(user, "microsoft", {
    accountEmail: row.account_email,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? row.refresh_token,
    expiresAt: expiresAtFromNow(refreshed.expires_in),
    scopes: row.scopes,
  }, supabase);
  return refreshed.access_token;
}
