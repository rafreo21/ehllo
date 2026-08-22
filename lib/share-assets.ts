import { buildBrandedQrDataUri, buildBrandedQrPngBuffer, buildBrandedQrPngDataUri } from "./branded-qr.ts";
import { resolveShareQrPayload } from "./contact-qr.ts";
import { loadSharp, sharpAvailable } from "./sharp-runtime.ts";
import { loadShareAssetFontsBase64, shareAssetFontStyles } from "./share-asset-fonts.ts";
import { normalizeThemeColor, themeGradientStops } from "./theme-contrast.ts";
import { buildVirtualBackgroundGradientPng } from "./virtual-background-gradient.ts";
import {
  buildVirtualBackgroundLayout,
  VIRTUAL_BG_PANEL,
} from "./virtual-background-layout.ts";
import { buildVirtualBackgroundPanelPng } from "./virtual-background-panel-image.ts";

export type ShareAssetProfile = {
  name: string;
  role: string;
  company: string;
  cardUrl: string;
  themeColor?: string;
  photoUrl?: string;
  companyLogoUrl?: string;
  coverPhotoUrl?: string;
  showCompany?: boolean;
  methods?: Array<{ method_type: string; value: string; label?: string | null }>;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function cardThemeBackgroundGradientMarkup(themeColor: string | undefined) {
  const [highlight, base, shadow] = themeGradientStops(normalizeThemeColor(themeColor));
  const width = VIRTUAL_BG_PANEL.canvasWidth;
  const height = VIRTUAL_BG_PANEL.canvasHeight;
  return [
    `<linearGradient id="cardThemeBg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${width}" y2="${height}">`,
    `<stop offset="0%" stop-color="${highlight}"/>`,
    `<stop offset="48%" stop-color="${base}"/>`,
    `<stop offset="100%" stop-color="${shadow}"/>`,
    `</linearGradient>`,
  ].join("");
}

/** @deprecated Use buildBrandedQrDataUri instead. */
export async function buildQrPngDataUri(cardUrl: string, size = 512) {
  return buildBrandedQrDataUri(cardUrl, size);
}

export async function buildBrandedQrAsset(cardUrl: string, renderSize = 1024) {
  return buildBrandedQrDataUri(cardUrl, renderSize);
}

async function buildVirtualBackgroundSvgDocument(profile: ShareAssetProfile, mirrored = false) {
  const name = escapeXml(profile.name.trim() || "Your name");
  const layout = buildVirtualBackgroundLayout(profile);
  const fonts = await loadShareAssetFontsBase64();
  const qrRenderSize = VIRTUAL_BG_PANEL.qrSize * 5;
  const qrDataUri = await buildBrandedQrPngDataUri(resolveShareQrPayload(profile), qrRenderSize);
  const width = VIRTUAL_BG_PANEL.canvasWidth;
  const height = VIRTUAL_BG_PANEL.canvasHeight;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>`,
    `<style>${shareAssetFontStyles(fonts.regular, fonts.bold)}</style>`,
    cardThemeBackgroundGradientMarkup(profile.themeColor),
    `</defs>`,
    `<rect width="${width}" height="${height}" fill="url(#cardThemeBg)"/>`,
    // Mirroring flips the entire canvas, panel included - see buildVirtualBackgroundJpeg for
    // why it has to be the whole frame rather than just the artwork.
    mirrored ? `<g transform="translate(${width},0) scale(-1,1)">` : "",
    `<rect x="${VIRTUAL_BG_PANEL.x}" y="${VIRTUAL_BG_PANEL.y}" width="${VIRTUAL_BG_PANEL.width}" height="${VIRTUAL_BG_PANEL.height}" rx="${VIRTUAL_BG_PANEL.radius}" fill="#FFFFFF" fill-opacity="0.94"/>`,
    `<text x="${layout.nameX}" y="${layout.nameY}" fill="#163300" font-family="Inter, Arial, sans-serif" font-size="${VIRTUAL_BG_PANEL.nameFontSize}" font-weight="700">${name}</text>`,
    layout.subtitle
      ? `<text x="${layout.nameX}" y="${layout.subtitleY}" fill="#53634D" font-family="Inter, Arial, sans-serif" font-size="${VIRTUAL_BG_PANEL.subtitleFontSize}" font-weight="400">${escapeXml(layout.subtitle)}</text>`
      : "",
    `<rect x="${layout.qrX - 4}" y="${layout.qrY - 4}" width="${VIRTUAL_BG_PANEL.qrSize + 8}" height="${VIRTUAL_BG_PANEL.qrSize + 8}" rx="12" fill="#FFFFFF"/>`,
    `<image href="${qrDataUri}" x="${layout.qrX}" y="${layout.qrY}" width="${VIRTUAL_BG_PANEL.qrSize}" height="${VIRTUAL_BG_PANEL.qrSize}" preserveAspectRatio="xMidYMid meet"/>`,
    `<text x="${layout.scanX}" y="${layout.scanY}" fill="#71806B" font-family="Inter, Arial, sans-serif" font-size="${VIRTUAL_BG_PANEL.scanFontSize}" font-weight="400">Scan to save my contact</text>`,
    mirrored ? `</g>` : "",
    `</svg>`,
  ].filter(Boolean).join("");
}

export async function buildVirtualBackgroundSvg(profile: ShareAssetProfile, mirrored = false) {
  return buildVirtualBackgroundSvgDocument(profile, mirrored);
}

/** JPG export for Zoom, Google Meet, and Teams. */
export async function buildVirtualBackgroundJpeg(profile: ShareAssetProfile, mirrored = false) {
  if (!sharpAvailable()) {
    throw new Error("Virtual backgrounds require sharp, which isn't available in this local dev sandbox. Test this against a Vercel preview instead.");
  }
  const sharp = await loadSharp();

  const [background, panelPngRaw] = await Promise.all([
    buildVirtualBackgroundGradientPng(profile.themeColor),
    buildVirtualBackgroundPanelPng(profile, 2),
  ]);

  const panelPng = await sharp(panelPngRaw)
    .resize(VIRTUAL_BG_PANEL.width, VIRTUAL_BG_PANEL.height)
    .png()
    .toBuffer();

  // Composited to its own buffer FIRST, then flipped in a second pass. sharp applies flip and
  // flop at a fixed point in its pipeline rather than in call order, and that point is BEFORE
  // composite - so chaining .composite(...).flop() mirrored the gradient and then pasted the
  // panel back at the same coordinates, leaving the panel exactly where it started. Verified
  // by tests/virtual-background-mirror.test.mjs, which measures which half the panel lands in.
  const composedPng = await sharp(background)
    .composite([{ input: panelPng, top: VIRTUAL_BG_PANEL.y, left: VIRTUAL_BG_PANEL.x }])
    .png()
    .toBuffer();

  const composed = sharp(composedPng);

  // Two exports, because one image cannot serve both views.
  //
  // Meet, Zoom and Teams mirror your SELF-VIEW; the stream participants receive is not
  // mirrored. The two are horizontal mirrors of each other, so any text reads correctly in
  // exactly one of them:
  //
  //   default (mirrored = false) - correct for everyone watching you, reversed in your own
  //     self-view. The QR scans. This is the one to upload if anybody is meant to scan it.
  //   mirrored = true            - correct in your own self-view, reversed for participants,
  //     and the QR will not scan for them because a mirrored QR is not a valid symbol.
  //
  // Flipping has to be the whole frame rather than just the panel: self-view shows
  // mirror(frame), so to make mirror(frame) look right the frame itself must be pre-mirrored,
  // panel and position together.
  const oriented = mirrored ? composed.flop() : composed;

  return oriented.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

export async function buildWatchFacePng(profile: ShareAssetProfile) {
  if (!sharpAvailable()) {
    throw new Error("Watch faces require sharp, which isn't available in this local dev sandbox. Test this against a Vercel preview instead.");
  }
  const sharp = await loadSharp();
  const name = escapeXml(profile.name.trim() || "My card");
  const size = 400;
  const qrDisplaySize = 240;
  const qrX = Math.round((size - qrDisplaySize) / 2);
  const qrY = 92;
  const fonts = await loadShareAssetFontsBase64();

  const backgroundSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`,
    `<style>${shareAssetFontStyles(fonts.regular, fonts.bold)}</style>`,
    `<rect width="${size}" height="${size}" rx="56" fill="#050505"/>`,
    `</svg>`,
  ].join("");

  const frameSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${qrDisplaySize + 16}" height="${qrDisplaySize + 16}">`,
    `<rect width="${qrDisplaySize + 16}" height="${qrDisplaySize + 16}" rx="22" fill="#FFFFFF"/>`,
    `</svg>`,
  ].join("");

  const textSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`,
    `<style>${shareAssetFontStyles(fonts.regular, fonts.bold)}</style>`,
    `<text x="200" y="54" fill="#FFFFFF" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="400" text-anchor="middle">Personal card</text>`,
    `<text x="200" y="372" fill="#D7D7D7" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="400" text-anchor="middle">${name}</text>`,
    `</svg>`,
  ].join("");

  const [background, frame, qrBuffer, textLayer] = await Promise.all([
    sharp(Buffer.from(backgroundSvg)).png().toBuffer(),
    sharp(Buffer.from(frameSvg)).png().toBuffer(),
    buildBrandedQrPngBuffer(resolveShareQrPayload(profile), qrDisplaySize * 4).then((buffer) =>
      sharp(buffer).resize(qrDisplaySize, qrDisplaySize, { kernel: sharp.kernel.nearest }).png().toBuffer(),
    ),
    sharp(Buffer.from(textSvg)).png().toBuffer(),
  ]);

  return sharp(background)
    .composite([
      { input: frame, top: qrY - 8, left: qrX - 8 },
      { input: qrBuffer, top: qrY, left: qrX },
      { input: textLayer, top: 0, left: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function buildWatchFaceSvg(profile: ShareAssetProfile) {
  const name = escapeXml(profile.name.trim() || "My card");
  const qrRenderSize = 960;
  const qrDisplaySize = 240;
  const qrX = Math.round((400 - qrDisplaySize) / 2);
  const qrY = 92;
  const fonts = await loadShareAssetFontsBase64();
  const qrDataUri = await buildBrandedQrPngDataUri(resolveShareQrPayload(profile), qrRenderSize);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">`,
    `<style>${shareAssetFontStyles(fonts.regular, fonts.bold)}</style>`,
    `<rect width="400" height="400" rx="56" fill="#050505"/>`,
    `<text x="200" y="54" fill="#FFFFFF" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="400" text-anchor="middle">Personal card</text>`,
    `<rect x="${qrX - 8}" y="${qrY - 8}" width="${qrDisplaySize + 16}" height="${qrDisplaySize + 16}" rx="22" fill="#FFFFFF"/>`,
    `<image href="${qrDataUri}" x="${qrX}" y="${qrY}" width="${qrDisplaySize}" height="${qrDisplaySize}" preserveAspectRatio="xMidYMid meet"/>`,
    `<text x="200" y="372" fill="#D7D7D7" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="400" text-anchor="middle">${name}</text>`,
    `</svg>`,
  ].join("");
}

export function shareAssetFilename(
  type: "virtual-background" | "watch-face",
  slug: string,
  format: "jpg" | "jpeg" | "png" | "svg" = type === "virtual-background" ? "jpg" : "png",
  mirrored = false,
) {
  const normalizedFormat = format === "jpeg" ? "jpg" : format;
  const suffix = mirrored ? "-mirrored" : "";
  return `ehllo-${type}-${slug}${suffix}.${normalizedFormat}`;
}

export function shareAssetMimeType(type: "virtual-background" | "watch-face") {
  return type === "virtual-background" ? "image/jpeg" : "image/png";
}

export { buildVirtualBackgroundLayout, VIRTUAL_BG_PANEL } from "./virtual-background-layout.ts";
