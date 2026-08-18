#!/usr/bin/env node
// vinext's Vercel build bundles app routes via Vite/Rolldown into the
// function's _ssr/*.mjs chunks; Nitro's own file-trace step never analyzes
// those (it only traces its own runtime/_libs graph), so native packages
// referenced only from those chunks - sharp, @resvg/resvg-js - never land
// in the deployed function's node_modules despite being marked `external`,
// causing "Cannot find package 'sharp'" at runtime. Trace and copy them by
// hand, using @vercel/nft so the real dependency graph (including whichever
// platform-specific native binary npm installed on this build machine) is
// what actually gets copied.
import { nodeFileTrace } from "@vercel/nft";
import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const functionDir = join(rootDir, ".vercel/output/functions/__server.func");

if (!existsSync(functionDir)) {
  console.log("No Vercel function output at .vercel/output - skipping native dep copy.");
  process.exit(0);
}

const packages = ["sharp", "@resvg/resvg-js"];
const entries = packages.map((pkg) => require.resolve(pkg));

const { fileList } = await nodeFileTrace(entries, { base: rootDir });

let copied = 0;
for (const file of fileList) {
  if (!file.startsWith("node_modules/")) continue;
  const src = join(rootDir, file);
  const dest = join(functionDir, file);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
  copied += 1;
}

console.log(`Copied ${copied} native dependency files (${packages.join(", ")}) into the deployed function.`);

const pkgJsonPath = join(functionDir, "package.json");
if (existsSync(pkgJsonPath)) {
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
  pkgJson.dependencies ??= {};
  for (const pkg of packages) {
    const installedPkgJson = join(rootDir, "node_modules", pkg, "package.json");
    pkgJson.dependencies[pkg] = JSON.parse(readFileSync(installedPkgJson, "utf8")).version;
  }
  writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2));
}
