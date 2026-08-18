#!/usr/bin/env node
/**
 * Deploy send-auth-email edge function via Supabase Management API.
 *
 * Targets staging by default. Pass --production (with EHLLO_ALLOW_PRODUCTION=1)
 * to deploy production. Requires SUPABASE_ACCESS_TOKEN in the shell or in the
 * selected .env.<environment>.local file.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { selectSupabaseTarget } from "./supabase-target.mjs";

const { environment, projectRef: PROJECT_REF, read } = selectSupabaseTarget();
const FUNCTION_NAME = "send-auth-email";
const ENTRY = resolve(process.cwd(), "supabase/functions/send-auth-email/index.ts");

async function main() {
  const token = read("SUPABASE_ACCESS_TOKEN");
  if (!token) {
    console.error(`Missing SUPABASE_ACCESS_TOKEN (shell or .env.${environment}.local).`);
    process.exit(1);
  }

  const content = readFileSync(ENTRY, "utf8");
  console.log(`Deploying ${FUNCTION_NAME} to ${environment} (${PROJECT_REF})...`);

  // Updating an existing function is a PATCH. The former multi-file PUT now
  // answers "400 Duplicated function slug" against a slug that already exists,
  // which read as a name collision rather than a stale request shape.
  let response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${FUNCTION_NAME}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: FUNCTION_NAME,
      verify_jwt: false,
      body: content,
    }),
  });

  // A project that has never had this function deployed has nothing to PATCH
  // onto - creating it goes through the collection endpoint instead.
  if (response.status === 404) {
    response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        slug: FUNCTION_NAME,
        name: FUNCTION_NAME,
        verify_jwt: false,
        body: content,
      }),
    });
  }

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Deploy failed ${response.status}: ${body}`);
  }

  console.log("Deployed:", `https://${PROJECT_REF}.supabase.co/functions/v1/${FUNCTION_NAME}`);
  console.log(`Run npm run configure:supabase-auth${environment === "production" ? " -- --production" : ""} to wire the hook + Resend secrets.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
