#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const extensionDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(extensionDir, "icons", "ehllo-logo.svg");
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const output = path.join(extensionDir, "icons", `icon-${size}.png`);
  const result = spawnSync(
    "npx",
    ["--yes", "sharp-cli", "resize", String(size), String(size), "--input", source, "--output", output],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("Extension icons rebuilt.");
