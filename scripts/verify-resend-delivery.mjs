#!/usr/bin/env node
/**
 * Checks whether the configured Resend sender can deliver to external inboxes.
 * The test sender onboarding@resend.dev only delivers to the Resend account email.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readEnv(name) {
  if (process.env[name]?.trim()) return process.env[name].trim();
  try {
    const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    const match = env.match(new RegExp(`^${name}=(.+)$`, "m"));
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    // ignore
  }
  return "";
}

async function main() {
  const resendApiKey = readEnv("RESEND_API_KEY");
  const from = readEnv("RESEND_FROM_EMAIL") || "ehllo <onboarding@resend.dev>";
  const probeTo = process.argv[2] || "visitor@example.com";

  if (!resendApiKey) {
    console.error("Missing RESEND_API_KEY in env or .env.local");
    process.exit(1);
  }

  if (!from.includes("onboarding@resend.dev")) {
    console.log(`Sender is ${from} (not the Resend test address). External delivery should work once the domain is verified in Resend.`);
    process.exit(0);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [probeTo],
      subject: "ehllo delivery probe",
      html: "<p>probe</p>",
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (response.ok) {
    console.log("Resend accepted a test send to an external address.");
    process.exit(0);
  }

  const message = payload.message || payload.error || `HTTP ${response.status}`;
  console.error("Resend cannot deliver sign-in codes to external recipients yet.");
  console.error(`Reason: ${message}`);
  console.error("");
  console.error("Fix:");
  console.error("  1. Verify ehllo.io at https://resend.com/domains");
  console.error("  2. Set RESEND_FROM_EMAIL=ehllo <product@ehllo.io> in .env.local");
  console.error("  3. Run npm run configure:supabase-auth");
  console.error("");
  console.error("Temporary beta workaround:");
  console.error("  npm run configure:supabase-auth -- --supabase-email");
  process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
