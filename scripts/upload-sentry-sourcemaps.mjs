#!/usr/bin/env node
// vinext's Vercel build goes through Nitro/Rolldown, not webpack, so
// @sentry/nextjs's webpack plugin (which normally injects + uploads source
// maps automatically) never runs. This does the same two steps by hand,
// using debug-ID based matching so it doesn't depend on Sentry "release"
// tracking lining up with the SDK's init config.
//
// Scoped to the client bundle only (.vercel/output/static) — server-side
// Sentry is currently disabled (see sentry.server.config.ts removal), so
// there's nothing to match server-side maps against yet.

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const authToken = process.env.SENTRY_AUTH_TOKEN;
const org = process.env.SENTRY_ORG;
const project = process.env.SENTRY_PROJECT;

if (!authToken || !org || !project) {
  console.log("Sentry env vars not set — skipping source map upload.");
  process.exit(0);
}

const outDir = ".vercel/output/static";
if (!existsSync(outDir)) {
  console.log(`${outDir} not found — skipping source map upload.`);
  process.exit(0);
}

execSync(`npx sentry-cli sourcemaps inject ${outDir}`, { stdio: "inherit" });
execSync(
  `npx sentry-cli sourcemaps upload --org ${org} --project ${project} ${outDir}`,
  { stdio: "inherit" },
);
