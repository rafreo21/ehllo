import type { NextConfig } from "next";

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

export default nextConfig;
