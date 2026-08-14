#!/usr/bin/env node
/**
 * Enable Google, LinkedIn (OIDC), and X OAuth in Supabase via Management API.
 *
 * Prerequisites:
 * 1. Create OAuth apps at Google, LinkedIn, and X (see docs/engineering/03-oauth-provider-setup.md)
 * 2. Create a Supabase personal access token: https://supabase.com/dashboard/account/tokens
 *
 * Usage:
 *   export SUPABASE_ACCESS_TOKEN="sbp_..."
 *   export GOOGLE_CLIENT_ID="..."
 *   export GOOGLE_CLIENT_SECRET="..."
 *   export LINKEDIN_CLIENT_ID="..."
 *   export LINKEDIN_CLIENT_SECRET="..."
 *   export X_CLIENT_ID="..."
 *   export X_CLIENT_SECRET="..."
 *   node scripts/configure-oauth-providers.mjs
 *
 * Optional:
 *   SUPABASE_PROJECT_REF=tgpzxgrvdmmwnodxrooh
 *   EHLLO_SITE_URL=http://localhost:3000
 *   AFTERMEET_REDIRECT_URLS=http://localhost:3000/auth/callback,http://localhost:3001/auth/callback
 */

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "tgpzxgrvdmmwnodxrooh";
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const PRODUCTION_URL = "https://ehllo.io";
const SITE_URL = (process.env.EHLLO_SITE_URL ?? process.env.AFTERMEET_SITE_URL ?? PRODUCTION_URL).replace(/\/+$/, "");
const REDIRECT_URLS =
  process.env.AFTERMEET_REDIRECT_URLS ??
  [
    `${PRODUCTION_URL}/auth/callback`,
    "http://localhost:3000/auth/callback",
    "http://localhost:3001/auth/callback",
  ].join(",");

const providers = [
  {
    label: "Google",
    enabledKey: "external_google_enabled",
    clientIdKey: "external_google_client_id",
    secretKey: "external_google_secret",
    clientId: process.env.GOOGLE_CLIENT_ID?.trim(),
    secret: process.env.GOOGLE_CLIENT_SECRET?.trim(),
  },
  {
    label: "LinkedIn (OIDC)",
    enabledKey: "external_linkedin_oidc_enabled",
    clientIdKey: "external_linkedin_oidc_client_id",
    secretKey: "external_linkedin_oidc_secret",
    clientId: process.env.LINKEDIN_CLIENT_ID?.trim(),
    secret: process.env.LINKEDIN_CLIENT_SECRET?.trim(),
  },
  {
    label: "X (OAuth 2.0)",
    enabledKey: "external_x_enabled",
    clientIdKey: "external_x_client_id",
    secretKey: "external_x_secret",
    clientId: process.env.X_CLIENT_ID?.trim(),
    secret: process.env.X_CLIENT_SECRET?.trim(),
  },
];

function requireAccessToken() {
  if (!ACCESS_TOKEN) {
    console.error("Missing SUPABASE_ACCESS_TOKEN.");
    console.error("Create one at https://supabase.com/dashboard/account/tokens");
    process.exit(1);
  }
}

function buildPayload() {
  const payload = {
    site_url: SITE_URL,
    uri_allow_list: REDIRECT_URLS,
  };

  const missing = [];

  for (const provider of providers) {
    if (provider.clientId && provider.secret) {
      payload[provider.enabledKey] = true;
      payload[provider.clientIdKey] = provider.clientId;
      payload[provider.secretKey] = provider.secret;
      continue;
    }
    if (provider.clientId || provider.secret) {
      missing.push(`${provider.label}: provide both client ID and secret`);
    }
  }

  if (missing.length) {
    console.error("Incomplete provider credentials:");
    missing.forEach((line) => console.error(`  - ${line}`));
    process.exit(1);
  }

  const configured = providers.filter((provider) => provider.clientId && provider.secret);
  if (!configured.length) {
    console.error("No provider credentials found.");
    console.error("Set GOOGLE_*, LINKEDIN_*, and/or X_* env vars before running.");
    process.exit(1);
  }

  return { payload, configured };
}

async function patchAuthConfig(payload) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase API ${response.status}: ${body}`);
  }

  return body ? JSON.parse(body) : null;
}

async function verifyProviders() {
  const response = await fetch(`https://${PROJECT_REF}.supabase.co/auth/v1/settings`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "" },
  });
  if (!response.ok) return null;
  return response.json();
}

async function main() {
  requireAccessToken();
  const { payload, configured } = buildPayload();

  console.log(`Updating Supabase auth config for project ${PROJECT_REF}...`);
  console.log(`  site_url: ${payload.site_url}`);
  console.log(`  uri_allow_list: ${payload.uri_allow_list}`);
  configured.forEach((provider) => console.log(`  enabling ${provider.label}`));

  await patchAuthConfig(payload);

  const settings = await verifyProviders();
  if (settings?.external) {
    console.log("\nProvider availability:");
    console.log(`  google: ${settings.external.google ? "enabled" : "disabled"}`);
    console.log(`  linkedin_oidc: ${settings.external.linkedin_oidc ? "enabled" : "disabled"}`);
    console.log(`  x: ${settings.external.x ?? settings.external.twitter ? "enabled" : "disabled"}`);
  }

  console.log("\nDone. Open /auth and confirm buttons no longer show Soon.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
