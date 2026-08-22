import test from "node:test";
import assert from "node:assert/strict";

import { nfcManufacturerPayload, nfcUriRecord, normalizeCardUrl } from "../lib/nfc-ndef.ts";
import { isAppleWalletConfigured, isGoogleWalletConfigured } from "../lib/wallet-config.ts";

test("normalizeCardUrl adds https when missing", () => {
  assert.equal(normalizeCardUrl("aftermeet.app/c/alex-morgan"), "https://aftermeet.app/c/alex-morgan");
});

test("nfcUriRecord returns a URL record for Web NFC", () => {
  assert.deepEqual(nfcUriRecord("https://aftermeet.app/c/alex-morgan"), {
    recordType: "url",
    data: "https://aftermeet.app/c/alex-morgan",
  });
});

test("nfcManufacturerPayload documents offline vCard plus URL fallback", () => {
  const payload = nfcManufacturerPayload("https://aftermeet.app/c/alex-morgan", "BEGIN:VCARD");
  assert.equal(payload.records[1].url, "https://aftermeet.app/c/alex-morgan");
  assert.equal(payload.records[0].mimeType, "text/vcard");
});

test("wallet config flags are false without env vars", () => {
  assert.equal(isAppleWalletConfigured(), false);
  assert.equal(isGoogleWalletConfigured(), false);
});

test("google wallet jwt origins use hostnames", async () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://aftermeet-beta.vercel.app";
  const { walletJwtOrigins, resolveGoogleWalletLogoUrl } = await import("../lib/google-wallet-pass.ts");

  assert.deepEqual(walletJwtOrigins("https://aftermeet-beta.vercel.app/c/demo"), [
    "aftermeet-beta.vercel.app",
  ]);

  assert.equal(
    resolveGoogleWalletLogoUrl({
      slug: "demo",
      fullName: "Alex Morgan",
      role: "Designer",
      company: "ehllo",
      bio: "",
      themeColor: "#9fe870",
      cardUrl: "https://aftermeet-beta.vercel.app/c/demo",
      profileImageUrl: "https://cdn.example.com/profile.png",
      companyLogoUrl: "",
    }),
    // The brand mark, even though a profile photo is present and this used to prefer
    // it. heroImage is already the photo, so preferring it here put the same picture
    // on the pass twice and left the brand off it entirely. The round variant is a
    // committed file rather than a rendered route, so it cannot 404 at request time.
    "https://aftermeet-beta.vercel.app/ehllo-mark-round.png",
  );

  process.env.NEXT_PUBLIC_APP_URL = previous;
});

test("wallet card URLs never leak a local development origin into a deployed request", async () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  const { cardUrlForSlug } = await import("../lib/wallet-card-loader.ts");

  assert.equal(
    cardUrlForSlug("demo", new Request("https://aftermeet-staging.vercel.app/api/mobile/wallet/google/demo")),
    "https://aftermeet-staging.vercel.app/c/demo",
  );

  process.env.NEXT_PUBLIC_APP_URL = previous;
});

test("html email signature includes structured layout and card link", async () => {
  const { buildHtmlSignature } = await import("../lib/email-signature.ts");
  const html = buildHtmlSignature({
    name: "Alex Morgan",
    role: "Product designer",
    company: "ehllo",
    cardUrl: "https://aftermeet.app/c/alex-morgan",
    email: "alex@aftermeet.app",
    phone: "+1 555 0100",
    themeColor: "#9FE870",
    qrDataUri: "data:image/png;base64,abc",
  });
  assert.match(html, /View my card/);
  assert.match(html, /alex@aftermeet.app/);
  assert.match(html, /Product designer/);
  assert.match(html, /ehllo email signature/);
  assert.match(html, /data:image\/png;base64,abc/);
});

test("virtual background svg uses card theme gradient and side-by-side layout", async () => {
  const { buildVirtualBackgroundSvg } = await import("../lib/share-assets.ts");
  const { themeGradientStops } = await import("../lib/theme-contrast.ts");
  const [highlight, base, shadow] = themeGradientStops("#5146E5");
  const svg = await buildVirtualBackgroundSvg({
    name: "Alex Morgan",
    role: "Consultant",
    company: "Northstar",
    cardUrl: "https://aftermeet.app/c/alex-morgan",
    themeColor: "#5146E5",
  });
  assert.match(svg, /Alex Morgan/);
  assert.match(svg, /font-family="Inter/);
  assert.match(svg, /Scan to save my contact/);
  assert.match(svg, /width="120"/);
  // The QR must be embedded as a flattened raster. It used to be an SVG that
  // itself embedded images, leaving the code two levels deep inside this
  // document - resvg resolves one level but not two, so the rasterised
  // background shipped with a blank badge where the code should be.
  assert.match(svg, /<image href="data:image\/png;base64,/);
  assert.doesNotMatch(svg, /<image href="data:image\/svg\+xml;base64,/);
  assert.match(svg, new RegExp(`stop-color="${highlight}"`));
  assert.match(svg, new RegExp(`stop-color="${base}"`));
  assert.match(svg, new RegExp(`stop-color="${shadow}"`));
  assert.match(svg, /x2="1920" y2="1080"/);
});

test("virtual background jpeg export uses card theme gradient and video-app panel layout", async () => {
  const { sharpAvailable } = await import("../lib/sharp-runtime.ts");
  if (!sharpAvailable()) return;
  const { buildVirtualBackgroundJpeg } = await import("../lib/share-assets.ts");
  const { themeGradientStops } = await import("../lib/theme-contrast.ts");
  const { VIRTUAL_BG_PANEL } = await import("../lib/virtual-background-layout.ts");
  const profile = {
    name: "Alex Morgan",
    role: "Consultant",
    company: "Northstar",
    cardUrl: "https://aftermeet.app/c/alex-morgan",
    themeColor: "#5146E5",
  };

  const jpeg = await buildVirtualBackgroundJpeg(profile);
  assert.ok(jpeg.length > 10_000);
  assert.equal(jpeg[0], 0xff);
  assert.equal(jpeg[1], 0xd8);

  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const [highlight] = themeGradientStops("#5146E5");
  const highlightRgb = [
    Number.parseInt(highlight.slice(1, 3), 16),
    Number.parseInt(highlight.slice(3, 5), 16),
    Number.parseInt(highlight.slice(5, 7), 16),
  ];

  function px(x, y) {
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  }

  const topLeft = px(20, 20);
  assert.ok(
    Math.abs(topLeft[0] - highlightRgb[0]) < 24
      && Math.abs(topLeft[1] - highlightRgb[1]) < 24
      && Math.abs(topLeft[2] - highlightRgb[2]) < 24,
    `expected theme gradient near ${highlight}, got rgb(${topLeft.join(",")})`,
  );

  // On the right, and not mirrored. This asserted the left side, because the export used to
  // be flipped on the theory that Meet and Zoom mirror your video - they mirror the self-view
  // only, so that reversed the name for every participant and left a QR no scanner would read.
  const panelSample = px(VIRTUAL_BG_PANEL.x + 20, 80);
  assert.ok(
    panelSample.every((channel) => channel > 230),
    `expected the white card panel on the right side of the export, got rgb(${panelSample.join(",")})`,
  );

  // And the QR is actually drawn. It was not: the panel is composed with satori, which
  // renders <img> by decoding a raster and silently yields an empty box for the SVG data URI
  // it was being handed - so this shipped with a blank white square where the code belongs.
  // A QR is mostly dark modules, so a region with no dark pixels is a missing QR.
  const qrLeft = VIRTUAL_BG_PANEL.x + VIRTUAL_BG_PANEL.width - VIRTUAL_BG_PANEL.pad - VIRTUAL_BG_PANEL.qrSize;
  const qrTop = VIRTUAL_BG_PANEL.y + Math.round((VIRTUAL_BG_PANEL.height - VIRTUAL_BG_PANEL.qrSize) / 2);
  let darkModulePixels = 0;
  for (let dy = 10; dy < VIRTUAL_BG_PANEL.qrSize - 10; dy += 4) {
    for (let dx = 10; dx < VIRTUAL_BG_PANEL.qrSize - 10; dx += 4) {
      const [r, g, b] = px(qrLeft + dx, qrTop + dy);
      if (r < 120 && g < 120 && b < 120) darkModulePixels += 1;
    }
  }
  assert.ok(
    darkModulePixels > 40,
    `expected QR modules inside the panel, found ${darkModulePixels} dark pixels - the QR is missing`,
  );
});

test("watch face svg includes personal card label", async () => {
  const { buildWatchFaceSvg } = await import("../lib/share-assets.ts");
  const svg = await buildWatchFaceSvg({
    name: "Alex Morgan",
    role: "Consultant",
    company: "Northstar",
    cardUrl: "https://aftermeet.app/c/alex-morgan",
  });
  assert.match(svg, /Personal card/);
  assert.match(svg, /Alex Morgan/);
});

test("publicCardImageUrl rejects device-local URIs", async () => {
  const { publicCardImageUrl, needsCardImageUpload } = await import("../lib/card-assets.ts");
  assert.equal(publicCardImageUrl("file:///var/mobile/photo.jpg"), null);
  assert.equal(publicCardImageUrl("content://media/external/images/1"), null);
  assert.equal(publicCardImageUrl("https://cdn.example.com/profile.jpg"), "https://cdn.example.com/profile.jpg");
  assert.equal(needsCardImageUpload("file:///photo.jpg"), true);
  assert.equal(needsCardImageUpload("https://cdn.example.com/profile.jpg"), false);
});
