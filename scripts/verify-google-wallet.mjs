import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env.local");

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function decodeJwtPayload(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("JWT is malformed.");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}

const env = { ...process.env, ...loadEnvFile(envFile) };
process.env.GOOGLE_WALLET_ISSUER_ID = env.GOOGLE_WALLET_ISSUER_ID;
process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON = env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON;
process.env.GOOGLE_WALLET_CLASS_SUFFIX = env.GOOGLE_WALLET_CLASS_SUFFIX;
process.env.NEXT_PUBLIC_APP_URL = env.NEXT_PUBLIC_APP_URL;

const { isGoogleWalletConfigured, readGoogleWalletConfig } = await import("../lib/wallet-config.ts");
const { buildGoogleWalletSaveUrl, walletJwtOrigins } = await import("../lib/google-wallet-pass.ts");

console.log("ehllo Google Wallet verification\n");

if (!env.GOOGLE_WALLET_ISSUER_ID?.trim()) {
  console.log("Missing GOOGLE_WALLET_ISSUER_ID in .env.local or the environment.");
}

if (!env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON?.trim()) {
  console.log("Missing GOOGLE_WALLET_SERVICE_ACCOUNT_JSON in .env.local or the environment.");
}

if (!isGoogleWalletConfigured()) {
  console.log("\nStatus: NOT CONFIGURED");
  console.log("\nNext steps:");
  console.log("1. Open https://pay.google.com/business/console and create or open your issuer.");
  console.log("2. Copy the Issuer ID into GOOGLE_WALLET_ISSUER_ID.");
  console.log("3. In Google Cloud Console, enable the Google Wallet API.");
  console.log("4. Create a service account, download JSON, and paste it into GOOGLE_WALLET_SERVICE_ACCOUNT_JSON.");
  console.log("5. In Wallet Console -> Users, invite the service account email as Developer.");
  console.log("6. Add the same vars on Vercel (Production + Preview), redeploy, then test on Android.");
  console.log("\nDocs: docs/mobile/WALLET_SETUP.md");
  process.exit(1);
}

const config = readGoogleWalletConfig();
const cardUrl = `${(env.NEXT_PUBLIC_APP_URL || "https://ehllo.io").replace(/\/+$/, "")}/c/verify-wallet`;
const saveUrl = buildGoogleWalletSaveUrl(
  {
    slug: "verify-wallet",
    fullName: "ehllo Test",
    role: "Founder",
    company: "ehllo",
    bio: "Verification pass from verify-google-wallet.mjs",
    themeColor: "#9fe870",
    cardUrl,
  },
  config,
);

const token = saveUrl.replace("https://pay.google.com/gp/v/save/", "");
const payload = decodeJwtPayload(token);

console.log("Status: CONFIGURED");
console.log(`Issuer ID: ${config.issuerId}`);
console.log(`Service account: ${config.serviceAccountEmail}`);
console.log(`Class suffix: ${config.classSuffix}`);
console.log(`Origins: ${walletJwtOrigins(cardUrl).join(", ") || "(none)"}`);
console.log(`Object ID: ${payload.payload?.genericObjects?.[0]?.id || "(missing)"}`);
console.log(`Save URL length: ${saveUrl.length} chars`);
console.log("\nLocal JWT generation works.");
console.log("Open this link on an Android phone while signed into Google:");
console.log(saveUrl);
console.log("\nIf Google rejects the pass:");
console.log("- Confirm the service account is invited in Wallet Console -> Users.");
console.log("- Confirm Google Wallet API is enabled on the GCP project.");
console.log("- Redeploy Vercel after adding env vars (mobile reads production API).");
