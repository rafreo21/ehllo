import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const projectLink = join(root, ".vercel", "project.json");
const localVercelCli = join(root, "node_modules", ".bin", "vercel");

if (process.env.OPENAI_API_KEY?.trim() || process.env.AI_GATEWAY_API_KEY?.trim()) {
  process.exit(0);
}

if (!existsSync(projectLink)) {
  console.warn("[ehllo] Skipping AI env refresh: set OPENAI_API_KEY in .env.local, or link with `npx vercel link`.");
  process.exit(0);
}

// Local development must not depend on downloading a CLI package. An expired
// OIDC token only disables AI-backed conveniences; it should never block the
// rest of ehllo from starting offline.
if (!existsSync(localVercelCli)) {
  console.warn("[ehllo] Skipping AI env refresh: Vercel CLI is not installed locally. Add OPENAI_API_KEY to .env.local for set-and-forget local AI.");
  process.exit(0);
}

const result = spawnSync(
  localVercelCli,
  ["env", "pull", ".env.local", "--environment=development", "--yes"],
  { cwd: root, stdio: "inherit", env: process.env },
);

if (result.status !== 0) {
  console.warn("[ehllo] Could not refresh VERCEL_OIDC_TOKEN. Add OPENAI_API_KEY to .env.local for set-and-forget local AI.");
}
