import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

const [rootPackageText, mobilePackageText, appConfig, easText] = await Promise.all([
  read("package.json"),
  read("mobile/package.json"),
  read("mobile/app.config.js"),
  read("mobile/eas.json"),
]);

const rootPackage = JSON.parse(rootPackageText);
const mobilePackage = JSON.parse(mobilePackageText);
const eas = JSON.parse(easText);
const failures = [];
const warnings = [];

function requireCondition(condition, message) {
  if (!condition) failures.push(message);
}

requireCondition(rootPackage.scripts?.dev === "npm run dev:staging", "Root `npm run dev` must default to staging.");
requireCondition(rootPackage.scripts?.["dev:production"]?.includes("run-web-dev.mjs production"), "Production web development must use the guarded environment runner.");

for (const command of ["start", "ios", "android"]) {
  requireCondition(mobilePackage.scripts?.[command]?.includes("APP_VARIANT=staging"), `Mobile \`${command}\` must default to staging.`);
}
for (const command of ["start:production", "ios:production", "android:production"]) {
  requireCondition(mobilePackage.scripts?.[command]?.includes("APP_VARIANT=production"), `Mobile \`${command}\` must explicitly select production.`);
}

requireCondition(
  /process\.env\.APP_VARIANT\s*\?\?\s*["']staging["']/.test(appConfig),
  "Mobile app configuration must default APP_VARIANT to staging.",
);
requireCondition(
  /const\s+bundleId\s*=\s*IS_STAGING\s*\?\s*`\$\{BASE_BUNDLE_ID\}\.staging`\s*:\s*BASE_BUNDLE_ID/.test(appConfig)
    && /bundleIdentifier:\s*bundleId/.test(appConfig),
  "iOS staging and production bundle identifiers must remain distinct.",
);
requireCondition(
  /const\s+bundleId\s*=\s*IS_STAGING\s*\?\s*`\$\{BASE_BUNDLE_ID\}\.staging`\s*:\s*BASE_BUNDLE_ID/.test(appConfig)
    && /package:\s*bundleId/.test(appConfig),
  "Android staging and production package identifiers must remain distinct.",
);

const supabaseRefs = [...appConfig.matchAll(/https:\/\/([a-z]+)\.supabase\.co/g)].map((match) => match[1]);
requireCondition(new Set(supabaseRefs).size >= 2, "Mobile app configuration must contain distinct staging and production Supabase projects.");

for (const profile of ["development", "staging", "staging-simulator"]) {
  requireCondition(eas.build?.[profile]?.env?.APP_VARIANT === "staging", `EAS \`${profile}\` must target staging.`);
}
requireCondition(eas.build?.production?.env?.APP_VARIANT === "production", "EAS `production` must explicitly target production.");

const easProjectIds = [...appConfig.matchAll(/projectId:\s*["']([0-9a-f-]{36})["']/g)].map((match) => match[1]);
requireCondition(
  new Set(easProjectIds).size === 2,
  "Mobile app configuration must contain distinct staging and production EAS project IDs.",
);

if (failures.length > 0) {
  console.error("Release-readiness safeguards failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Release environment safeguards passed.");
for (const warning of warnings) console.warn(`Warning: ${warning}`);
