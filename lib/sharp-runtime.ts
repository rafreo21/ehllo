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
  return process.env.VERCEL === "1" || process.env.NITRO_PRESET === "vercel";
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
  const mod = (await import("sharp")) as unknown as { default: SharpModule };
  return mod.default;
}
