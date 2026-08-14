import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "@resvg/resvg-js"],
  outputFileTracingIncludes: {
    "/api/mobile/share-assets/[slug]": [
      "./public/ehllo-mark.png",
      "./lib/ehllo-logo-base64.ts",
      "./lib/share-asset-fonts-data.ts",
    ],
    "/api/cards/share-assets/[slug]": [
      "./public/ehllo-mark.png",
      "./lib/ehllo-logo-base64.ts",
      "./lib/share-asset-fonts-data.ts",
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  // Source maps upload only runs when SENTRY_AUTH_TOKEN is set — safe to
  // leave this wired even before that secret exists.
  widenClientFileUpload: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: true,
  },
});
