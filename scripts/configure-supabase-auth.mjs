#!/usr/bin/env node
/**
 * Configure Supabase Auth for ehllo (web + mobile OTP sign-in).
 *
 * Uses Supabase Send Email Hook + Resend (no Vercel integration required).
 *
 * 1. Create a free Resend account: https://resend.com/signup
 * 2. Create an API key: https://resend.com/api-keys
 * 3. Add to .env.local:
 *      SUPABASE_ACCESS_TOKEN=sbp_...
 *      RESEND_API_KEY=re_...
 *      RESEND_FROM_EMAIL=ehllo <onboarding@resend.dev>
 *    (Use a verified domain sender for production, e.g. auth@yourdomain.com)
 * 4. Run: npm run configure:supabase-auth
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "tgpzxgrvdmmwnodxrooh";
const PRODUCTION_URL = "https://aftermeet-beta.vercel.app";
const SITE_URL = (process.env.AFTERMEET_SITE_URL ?? PRODUCTION_URL).replace(/\/+$/, "");
const HOOK_FUNCTION = "send-auth-email";

function loadEnvFile() {
  try {
    return readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    return "";
  }
}

function readEnv(name) {
  if (process.env[name]?.trim()) return process.env[name].trim();
  const env = loadEnvFile();
  const match = env.match(new RegExp(`^${name}=(.+)$`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^["']|["']$/g, "");
}

const REDIRECT_URLS = [
  `${SITE_URL}/auth/callback`,
  `${SITE_URL}/auth/mobile-return`,
  `${SITE_URL}/**`,
  "http://localhost:3000/auth/callback",
  "http://localhost:3000/auth/mobile-return",
  "http://localhost:3000/**",
  "http://localhost:3001/auth/callback",
  "http://localhost:3001/auth/mobile-return",
  "http://localhost:3001/**",
  "aftermeet://auth/callback",
  "aftermeet://**",
  "aftermeet-staging://auth/callback",
  "aftermeet-staging://**",
  "exp://**",
  "https://aftermeet-*-rafreo21-8924s-projects.vercel.app/**",
  "https://aftermeet-rafreo21-8924s-projects.vercel.app/**",
].join(",");

async function api(token, path, { method = "GET", body } = {}) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase API ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function generateHookSecret() {
  const existing = readEnv("SEND_EMAIL_HOOK_SECRET");
  if (existing) return existing;
  return `v1,whsec_${randomBytes(32).toString("base64")}`;
}

async function setSecrets(token, secrets) {
  await api(token, "/secrets", {
    method: "POST",
    body: secrets.map(({ name, value }) => ({ name, value })),
  });
}

const OTP_MAGIC_LINK_SUBJECT = "Your ehllo sign-in code";
const OTP_MAGIC_LINK_CONTENT = `<h2>Your ehllo sign-in code</h2>
<p>Enter this 6-digit code in ehllo to sign in:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:20px 0">{{ .Token }}</p>
<p>This code expires shortly and can only be used once.</p>
<p>If you didn't request this, you can ignore this email.</p>`;

function otpTemplatePatch() {
  return {
    mailer_subjects_magic_link: OTP_MAGIC_LINK_SUBJECT,
    mailer_templates_magic_link_content: OTP_MAGIC_LINK_CONTENT,
  };
}

async function main() {
  const useSupabaseEmail = process.argv.includes("--supabase-email");
  const useResendSmtp = process.argv.includes("--resend-smtp");
  const accessToken = readEnv("SUPABASE_ACCESS_TOKEN");
  const resendApiKey = readEnv("RESEND_API_KEY");
  const resendFrom = readEnv("RESEND_FROM_EMAIL") || "ehllo <onboarding@resend.dev>";
  const hookSecret = generateHookSecret();
  const hookUri = `https://${PROJECT_REF}.supabase.co/functions/v1/${HOOK_FUNCTION}`;

  if (!accessToken) {
    console.error("Missing SUPABASE_ACCESS_TOKEN.");
    console.error("Create one at https://supabase.com/dashboard/account/tokens");
    process.exit(1);
  }

  if (!useSupabaseEmail && !resendApiKey) {
    console.error("Missing RESEND_API_KEY.");
    console.error("");
    console.error("Skip Vercel — set this up directly on Resend:");
    console.error("  1. Sign up: https://resend.com/signup");
    console.error("  2. Create API key: https://resend.com/api-keys");
    console.error("  3. Add to .env.local: RESEND_API_KEY=re_...");
    console.error("  4. Rerun: npm run configure:supabase-auth");
    console.error("");
    console.error("For testing, RESEND_FROM_EMAIL=ehllo <onboarding@resend.dev> only delivers");
    console.error("to the email you used on Resend. Add your domain in Resend for production.");
    console.error("");
    console.error("Temporary beta fallback (Supabase default email):");
    console.error("  npm run configure:supabase-auth -- --supabase-email");
    process.exit(1);
  }

  if (!useSupabaseEmail && resendFrom.includes("onboarding@resend.dev")) {
    console.warn("\nWarning: onboarding@resend.dev only delivers to your Resend account email.");
    console.warn("Visitors with other addresses (for example rafreo@icloud.com) cannot receive sign-in codes.");
    console.warn("Verify a domain in Resend, update RESEND_FROM_EMAIL, or rerun with --supabase-email.\n");
  }

  console.log(`Configuring Supabase Auth (${PROJECT_REF})...`);
  if (useSupabaseEmail) {
    console.log("  delivery: Supabase default email (temporary beta fallback)");
  } else if (useResendSmtp) {
    console.log("  delivery: Supabase custom SMTP → Resend");
    console.log("  from:", resendFrom);
  } else {
    console.log("  delivery: Send Email Hook → Resend (6-digit codes, no magic links)");
    console.log("  hook URL:", hookUri);
    console.log("  from:", resendFrom);
  }

  if (!useSupabaseEmail && !useResendSmtp) {
    console.log("\nSetting edge function secrets...");
    await setSecrets(accessToken, [
      { name: "RESEND_API_KEY", value: resendApiKey },
      { name: "SEND_EMAIL_HOOK_SECRET", value: hookSecret },
      { name: "RESEND_FROM_EMAIL", value: resendFrom },
    ]);
  }

  console.log("Updating auth config...");
  const authPatch = {
    site_url: SITE_URL,
    uri_allow_list: REDIRECT_URLS,
    external_email_enabled: true,
    mailer_secure_email_change_enabled: false,
    // A fresh project defaults to 8 — the client (and the email template
    // above) hard-codes an expectation of exactly 6 digits.
    mailer_otp_length: 6,
  };

  if (!useSupabaseEmail) {
    Object.assign(authPatch, otpTemplatePatch());
  }

  if (useSupabaseEmail) {
    Object.assign(authPatch, {
      hook_send_email_enabled: false,
    });
  } else if (useResendSmtp) {
    const fromMatch = /<?([^<>@\s]+@[^<>@\s]+)>?/.exec(resendFrom);
    const smtpAdminEmail = fromMatch?.[1] || resendFrom;
    Object.assign(authPatch, {
      hook_send_email_enabled: false,
      smtp_host: "smtp.resend.com",
      smtp_port: 465,
      smtp_user: "resend",
      smtp_pass: resendApiKey,
      smtp_admin_email: smtpAdminEmail,
      smtp_sender_name: "ehllo",
    });
  } else {
    Object.assign(authPatch, {
      hook_send_email_enabled: true,
      hook_send_email_uri: hookUri,
      hook_send_email_secrets: hookSecret,
      rate_limit_email_sent: 30,
    });
  }

  await api(accessToken, "/config/auth", {
    method: "PATCH",
    body: authPatch,
  });

  const current = await api(accessToken, "/config/auth");

  console.log("\nDone.");
  console.log("  site_url:", current.site_url);
  console.log("  send email hook:", current.hook_send_email_enabled ? "enabled" : "disabled");
  console.log("  email rate limit / hour:", current.rate_limit_email_sent ?? 30);
  console.log("");
  if (useSupabaseEmail) {
    console.log("Using Supabase default email with OTP template (6-digit codes, not magic links).");
    console.log("When aftermeet.app is verified in Resend, rerun without --supabase-email for Resend delivery.");
  } else if (useResendSmtp) {
    console.log("Using Resend SMTP through Supabase Auth.");
    console.log("Verify your sender domain in Resend before inviting external users.");
  } else {
    console.log("Next: deploy the edge function if you haven't yet:");
    console.log("  npm run deploy:send-auth-email");
    console.log("");
    console.log("Save this hook secret in .env.local if you generated a new one:");
    console.log(`  SEND_EMAIL_HOOK_SECRET=${hookSecret}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
