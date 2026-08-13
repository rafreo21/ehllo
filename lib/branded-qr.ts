import { readFile } from "node:fs/promises";
import { join } from "node:path";

import QRCode from "qrcode";

import { AFTERMEET_LOGO_PNG_BASE64 } from "./aftermeet-logo-base64.ts";
import { loadSharp, sharpAvailable } from "./sharp-runtime.ts";

import type { CardVcardInput } from "./vcard-export.ts";
import { buildContactQrPayload } from "./contact-qr.ts";

const QR_OPTIONS = {
  errorCorrectionLevel: "H" as const,
  margin: 1,
  color: { dark: "#163300", light: "#FFFFFF" },
};

const EMBEDDED_LOGO_BUFFER = Buffer.from(AFTERMEET_LOGO_PNG_BASE64, "base64");

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
  // at all — attempting the import crashes the sandbox itself, not a catchable JS
  // error — so we must skip the attempt entirely there and fall back to a plain QR.
  if (!sharpAvailable()) return qrBuffer;
  const sharp = await loadSharp();

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
 * what every current caller actually needs — an `<img>`/`<image>`-embeddable
 * data URI — and it works in every runtime, including the local dev sandbox
 * where sharp's native/wasm bindings can't load at all.
 */
export async function buildBrandedQrDataUri(payload: string, size = 1024) {
  const [qrSvg, logoBuffer] = await Promise.all([
    QRCode.toString(payload, { ...QR_OPTIONS, type: "svg", width: size }),
    loadEhlloLogoBuffer(),
  ]);
  const qrDataUri = `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}`;

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

export async function buildBrandedContactQrPngBuffer(input: CardVcardInput, size = 1024) {
  return buildBrandedQrPngBuffer(buildContactQrPayload(input), size);
}

export async function buildBrandedContactQrDataUri(input: CardVcardInput, size = 1024) {
  return buildBrandedQrDataUri(buildContactQrPayload(input), size);
}

export async function buildWalletLogoBuffers() {
  if (!sharpAvailable()) {
    throw new Error("Wallet pass images require sharp, which isn't available in this local dev sandbox. Test this against a Vercel preview instead.");
  }
  const sharp = await loadSharp();
  const logoBuffer = await loadEhlloLogoBuffer();
  const [icon, icon2x, logo, logo2x] = await Promise.all([
    sharp(logoBuffer).resize(29, 29, { fit: "contain", background: { r: 135, g: 234, b: 92, alpha: 1 } }).png().toBuffer(),
    sharp(logoBuffer).resize(58, 58, { fit: "contain", background: { r: 135, g: 234, b: 92, alpha: 1 } }).png().toBuffer(),
    sharp(logoBuffer).resize(160, 50, { fit: "contain", background: { r: 135, g: 234, b: 92, alpha: 0 } }).png().toBuffer(),
    sharp(logoBuffer).resize(320, 100, { fit: "contain", background: { r: 135, g: 234, b: 92, alpha: 0 } }).png().toBuffer(),
  ]);

  return {
    "icon.png": icon,
    "icon@2x.png": icon2x,
    "logo.png": logo,
    "logo@2x.png": logo2x,
  };
}
