/**
 * Cloudflare's local workerd dev sandbox (used by `npm run dev`) cannot load
 * the image library's native or WASM bindings — production (Vercel, via Nitro)
 * runs real Node.js and is unaffected.
 */
export function sharpAvailable() {
  // `VERCEL=1` only reaches the runtime when the project opts into Vercel's
  // system environment variables, and `NITRO_PRESET` is build-time only. With
  // neither present every image path silently downgraded in a deployed
  // environment: branded QR codes dropped their logo without erroring, and
  // Wallet passes threw a message claiming to be about a "local dev sandbox".
  // EHLLO_SHARP is an explicit, deployment-controlled answer that does not
  // depend on either.
  const override = process.env.EHLLO_SHARP?.trim();
  if (override === "1") return true;
  if (override === "0") return false;
  if (process.env.VERCEL === "1" || process.env.NITRO_PRESET === "vercel") return true;

  // Neither of those fires on Vercel unless the project opts into exposing
  // system environment variables, and this project does not — so the checks
  // above were answering "no sharp" in production. Asking an operator to set
  // one more variable just moves the same fragility somewhere else.
  //
  // Invert it instead. Exactly one runtime has to be excluded: Cloudflare's
  // workerd sandbox behind `npm run dev`, where loading sharp's bindings takes
  // the sandbox down uncatchably. Detect that directly. workerd defines
  // WebSocketPair and identifies itself in navigator.userAgent; Node defines
  // neither, so anything reaching the end of this function is real Node.
  const runtime = globalThis as { WebSocketPair?: unknown; navigator?: { userAgent?: string } };
  if (typeof runtime.WebSocketPair !== "undefined") return false;
  if (runtime.navigator?.userAgent?.includes("Cloudflare-Workers")) return false;

  return Boolean(process.versions?.node);
}

type SharpInstance = {
  resize: (...args: unknown[]) => SharpInstance;
  extend: (...args: unknown[]) => SharpInstance;
  composite: (...args: unknown[]) => SharpInstance;
  flop: () => SharpInstance;
  rotate: () => SharpInstance;
  jpeg: (...args: unknown[]) => SharpInstance;
  png: (...args: unknown[]) => SharpInstance;
  toBuffer: () => Promise<Buffer>;
};

type SharpModule = ((input?: unknown) => SharpInstance) & {
  kernel: Record<string, unknown>;
};

export async function loadSharp(): Promise<SharpModule> {
  // Keep this lazy so workerd never evaluates sharp, but leave the module
  // specifier static so Vinext/Vite can include it in Vercel's server bundle.
  try {
    const mod = (await import("sharp")) as unknown as { default?: SharpModule };
    if (mod?.default) return mod.default;
  } catch {
    // Fall through to the CommonJS resolver below.
  }

  // In the deployed bundle that ESM import resolves to
  // sharp/dist/index.mjs — a file sharp does not publish; it ships
  // dist/index.cjs. The failure surfaced as "Cannot find module ... Did you
  // mean to import sharp/dist/index.cjs?" and was swallowed by the caller,
  // so every server-rendered QR quietly lost its logo and Wallet passes 500'd.
  //
  // Node's CommonJS resolver honours the package's own entry points, so ask
  // it instead. copy-native-server-deps.mjs guarantees the package is on disk
  // by this point. Imported dynamically so workerd never evaluates node:module.
  const { createRequire } = await import("node:module");
  const requireFromHere = createRequire(import.meta.url);
  const mod = requireFromHere("sharp") as SharpModule & { default?: SharpModule };
  return mod.default ?? mod;
}
