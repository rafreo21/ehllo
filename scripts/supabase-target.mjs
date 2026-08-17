// Shared environment selection for the Supabase Auth scripts.
//
// These scripts used to hard-code `PROJECT_REF = process.env.SUPABASE_PROJECT_REF
// ?? "<production ref>"` and read credentials from `.env.local`. Because that
// read never consulted an env file, a developer with staging values sitting in
// `.env.local` would still reconfigure and redeploy *production* — the exact
// inversion `docs/release-safeguards.md` exists to prevent. Selection now
// mirrors `scripts/run-web-dev.mjs`: staging by default, production only behind
// an explicit one-command opt-in, and the project ref is derived from the
// selected environment file rather than baked into the source.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const DEFAULT_SITE_URL = {
  staging: "https://staging.ehllo.io",
  production: "https://ehllo.io",
};

function projectRefFromUrl(url) {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url ?? "");
  return match ? match[1] : "";
}

export function selectSupabaseTarget(argv = process.argv) {
  const environment = argv.includes("--production") ? "production" : "staging";

  if (
    environment === "production"
    && process.env.EHLLO_ALLOW_PRODUCTION !== "1"
    && process.env.AFTERMEET_ALLOW_PRODUCTION !== "1"
  ) {
    console.error("Production access is locked. Set EHLLO_ALLOW_PRODUCTION=1 for this command only.");
    process.exit(1);
  }

  const filename = `.env.${environment}.local`;
  let values;
  try {
    values = parseEnv(readFileSync(resolve(process.cwd(), filename), "utf8"));
  } catch {
    console.error(`Missing ${filename}. Copy .env.${environment}.example and add the ${environment} values.`);
    process.exit(1);
  }

  const projectRef = values.SUPABASE_PROJECT_REF
    || projectRefFromUrl(values.NEXT_PUBLIC_SUPABASE_URL)
    || projectRefFromUrl(values.SUPABASE_URL);

  if (!projectRef) {
    console.error(`${filename} has no SUPABASE_PROJECT_REF and no usable NEXT_PUBLIC_SUPABASE_URL to derive one from.`);
    process.exit(1);
  }

  const siteUrl = (values.EHLLO_SITE_URL || values.AFTERMEET_SITE_URL || DEFAULT_SITE_URL[environment]).replace(/\/+$/, "");

  // Environment files are the source of truth; a real shell export still wins
  // so CI can inject secrets without writing them to disk.
  const read = (name) => (process.env[name]?.trim() || values[name] || "").trim();

  return { environment, projectRef, siteUrl, values, read };
}
