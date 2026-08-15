import vinext from "vinext";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Vercel and Supabase integrations commonly create unprefixed variables.
  // Only the public URL and publishable key are intentionally exposed.
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= process.env.SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??=
    process.env.SUPABASE_PUBLISHABLE_KEY;

  const isVercel =
    process.env.VERCEL === "1" || process.env.NITRO_PRESET === "vercel";
  const nativeServerPackages = ["@resvg/resvg-js", "sharp"];

  if (isVercel) {
    const { nitro } = await import("nitro/vite");
    return {
      plugins: [
        vinext(),
        tailwindcss(),
        nitro({
          preset: "vercel",
        }),
      ],
      // Sentry stack traces need these — this build goes through Nitro/Rolldown,
      // not webpack, so @sentry/nextjs's webpack plugin never runs. A manual
      // sentry-cli inject+upload step in build:vercel (package.json) reads
      // whatever .map files land in .vercel/output/** after this build.
      build: { sourcemap: true, rolldownOptions: { external: nativeServerPackages } },
    };
  }

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    optimizeDeps: {
      // Deep CSR icon imports churn often during development and can stale the dep cache.
      exclude: ["@phosphor-icons/react", ...nativeServerPackages],
    },
    ssr: {
      external: nativeServerPackages,
    },
    build: { rolldownOptions: { external: nativeServerPackages } },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
