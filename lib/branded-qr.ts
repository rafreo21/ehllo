import { readFile } from "node:fs/promises";
import { join } from "node:path";

import QRCode from "qrcode";

import { EHLLO_LOGO_PNG_BASE64 } from "./ehllo-logo-base64.ts";
import { EHLLO_MARK_SVG } from "./ehllo-mark-svg.ts";
import { loadSharp, sharpAvailable } from "./sharp-runtime.ts";

import type { CardVcardInput } from "./vcard-export.ts";
import { buildContactQrPayload } from "./contact-qr.ts";

const QR_OPTIONS = {
  errorCorrectionLevel: "H" as const,
  margin: 1,
  color: { dark: "#163300", light: "#FFFFFF" },
};

const EMBEDDED_LOGO_BUFFER = Buffer.from(EHLLO_LOGO_PNG_BASE64, "base64");

let logoBufferPromise: Promise<Buffer> | null = null;

async function loadEhlloLogoBuffer() {
  if (!logoBufferPromise) {
    logoBufferPromise = (async () => {
      const candidates = [
        join(process.cwd(), "public", "ehllo-mark.png"),
        join(process.cwd(), "mobile", "assets", "images", "splash-icon.png"),
      ];
      for (const path of candidates) {
        try {
          const buffer = await readFile(path);
          if (buffer.length > 0) return buffer;
        } catch {
          // try next candidate
        }
      }
      return EMBEDDED_LOGO_BUFFER;
    })();
  }
  return logoBufferPromise;
}

export async function buildBrandedQrPngBuffer(payload: string, size = 1024) {
  const qrBuffer = await QRCode.toBuffer(payload, {
    ...QR_OPTIONS,
    width: size,
  });

  // Cloudflare's local workerd dev sandbox can't load sharp's native/wasm bindings
  // at all - attempting the import crashes the sandbox itself, not a catchable JS
  // error - so we must skip the attempt entirely there and fall back to a plain QR.
  if (!sharpAvailable()) return qrBuffer;
  let sharp;
  try {
    sharp = await loadSharp();
  } catch (error) {
    // A readable QR is more important than the centre badge. Some server
    // bundlers deliberately externalize native modules; never turn sharing
    // into a 500 merely because the optional compositor is unavailable.
    //
    // Log it though. Swallowing this silently meant a deployed environment
    // could ship logo-less QR codes indefinitely and look completely healthy,
    // and it made a plain QR indistinguishable from sharp being switched off
    // by the availability guard - two very different faults.
    console.error("[branded-qr] sharp unavailable, falling back to a plain QR", {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
    });
    return qrBuffer;
  }

  const logoBuffer = await loadEhlloLogoBuffer();
  const logoSize = Math.round(size * 0.24);
  const badgePadding = Math.max(5, Math.round(size * 0.014));
  const badgeSize = logoSize + badgePadding * 2;
  const badgeRadius = Math.round(badgeSize * 0.22);
  const roundedMask = Buffer.from(
    `<svg width="${badgeSize}" height="${badgeSize}"><rect width="${badgeSize}" height="${badgeSize}" rx="${badgeRadius}" fill="#fff"/></svg>`,
  );
  const logoBadge = await sharp(logoBuffer)
    .resize(logoSize, logoSize, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .extend({
      top: badgePadding,
      bottom: badgePadding,
      left: badgePadding,
      right: badgePadding,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .composite([{ input: roundedMask, blend: "dest-in" }])
    .png()
    .toBuffer();

  const left = Math.round((size - badgeSize) / 2);
  const top = left;

  return sharp(qrBuffer)
    .composite([{ input: logoBadge, top, left }])
    .png()
    .toBuffer();
}

/**
 * Builds the branded QR as a self-contained SVG (QR modules + logo badge, all
 * drawn with markup) instead of compositing raster layers with sharp. This is
 * what every current caller actually needs - an `<img>`/`<image>`-embeddable
 * data URI - and it works in every runtime, including the local dev sandbox
 * where sharp's native/wasm bindings can't load at all.
 */
export async function buildBrandedQrDataUri(payload: string, size = 1024) {
  const [qrPng, logoBuffer] = await Promise.all([
    // A PNG rather than an SVG. resvg resolves one level of nested SVG but not
    // two, so keeping this layer raster means the composed document is only
    // ever one level deep. Email clients are unreliable with SVG as well, so
    // raster is the safer answer everywhere this data URI ends up.
    QRCode.toBuffer(payload, { ...QR_OPTIONS, width: size }),
    loadEhlloLogoBuffer(),
  ]);
  const qrDataUri = `data:image/png;base64,${qrPng.toString("base64")}`;

  const logoSize = Math.round(size * 0.24);
  const badgePadding = Math.max(5, Math.round(size * 0.014));
  const badgeSize = logoSize + badgePadding * 2;
  const left = Math.round((size - badgeSize) / 2);
  const top = left;
  const badgeRadius = Math.round(badgeSize * 0.22);
  const logoRadius = Math.round(logoSize * 0.22);

  const composed = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<defs><clipPath id="logo-clip"><rect x="${left + badgePadding}" y="${top + badgePadding}" width="${logoSize}" height="${logoSize}" rx="${logoRadius}"/></clipPath></defs>`,
    `<image href="${qrDataUri}" width="${size}" height="${size}"/>`,
    `<rect x="${left}" y="${top}" width="${badgeSize}" height="${badgeSize}" rx="${badgeRadius}" fill="#FFFFFF"/>`,
    `<image href="data:image/png;base64,${logoBuffer.toString("base64")}" x="${left + badgePadding}" y="${top + badgePadding}" width="${logoSize}" height="${logoSize}" clip-path="url(#logo-clip)"/>`,
    `</svg>`,
  ].join("");

  return `data:image/svg+xml;base64,${Buffer.from(composed).toString("base64")}`;
}

/**
 * The branded QR flattened into a single PNG data URI.
 *
 * buildBrandedQrDataUri returns an SVG that itself embeds images. resvg
 * resolves one level of that - an SVG data URI inside <image> renders fine -
 * but not two, so when the virtual background and watch face documents
 * embedded it, the QR modules and logo inside came back empty and every asset
 * shipped with a blank badge. Compositing to a single raster first leaves the
 * outer document only one level to resolve.
 */
export async function buildBrandedQrPngDataUri(payload: string, size = 1024) {
  const png = await buildBrandedQrPngBuffer(payload, size);
  return `data:image/png;base64,${png.toString("base64")}`;
}

export async function buildBrandedContactQrPngBuffer(input: CardVcardInput, size = 1024) {
  return buildBrandedQrPngBuffer(buildContactQrPayload(input), size);
}

export async function buildBrandedContactQrDataUri(input: CardVcardInput, size = 1024) {
  return buildBrandedQrDataUri(buildContactQrPayload(input), size);
}

/**
 * The brand mark for a pass, as the round badge it was designed to be.
 *
 * public/ehllo-logo.svg draws it as `<rect width="60" height="60" rx="30">` - on a
 * 60x60 box, rx=30 is a circle. public/ehllo-mark.png is a flattened square export
 * of that same mark with the green baked in as opaque pixels, and that is what the
 * pass was using: so `logo.png` came out as a small green *square* adrift in a
 * 160x50 transparent box, sitting on whatever colour the card happened to be. On a
 * coral card it read as a mismatched green tile rather than a logo.
 *
 * Rendering from the SVG keeps the circle and keeps the corners transparent, so the
 * badge sits on the card's own colour instead of punching a square hole in it.
 *
 * Sized square rather than padded to Apple's full 160x50 allowance: Apple
 * left-aligns the logo, so a 50x50 circle lands flush against the edge where it
 * belongs, and the padding was only ever pushing it away from it.
 */
export async function buildWalletLogoBuffers() {
  if (!sharpAvailable()) {
    throw new Error("Wallet pass images require sharp, which isn't available in this local dev sandbox. Test this against a Vercel preview instead.");
  }
  const sharp = await loadSharp();
  const markBuffer = loadEhlloMarkForWallet();
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
  const [icon, icon2x, logo, logo2x] = await Promise.all([
    sharp(markBuffer).resize(29, 29, { fit: "contain", background: transparent }).png().toBuffer(),
    sharp(markBuffer).resize(58, 58, { fit: "contain", background: transparent }).png().toBuffer(),
    sharp(markBuffer).resize(50, 50, { fit: "contain", background: transparent }).png().toBuffer(),
    sharp(markBuffer).resize(100, 100, { fit: "contain", background: transparent }).png().toBuffer(),
  ]);

  return {
    "icon.png": icon,
    "icon@2x.png": icon2x,
    "logo.png": logo,
    "logo@2x.png": logo2x,
  };
}

/**
 * Prefers the SVG, because it is the only source that still has the circle and
 * transparent corners. Falls back to the square PNG rather than failing the pass -
 * a square mark is worse-looking, not broken. Kept separate from
 * loadEhlloLogoBuffer so the QR centre mark, which is composited onto a white plate
 * and does not need transparency, keeps working exactly as it does now.
 */
/**
 * The inline SVG, not a file read. public/ is CDN-served and absent from the
 * serverless filesystem, so reading it there fails every time and falls through -
 * which is exactly how this shipped the square mark once already.
 */
function loadEhlloMarkForWallet() {
  return Buffer.from(EHLLO_MARK_SVG, "utf8");
}
