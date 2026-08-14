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
    "https://cdn.example.com/profile.png",
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
  assert.match(svg, /data:image\/svg\+xml;base64,/);
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
  const { virtualBackgroundPanelLeftForVideoApps } = await import("../lib/virtual-background-layout.ts");
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

  const panelLeft = virtualBackgroundPanelLeftForVideoApps();
  const panelSample = px(panelLeft + 20, 80);
  assert.ok(panelSample.every((channel) => channel > 230), `expected white card panel on the left side of export, got rgb(${panelSample.join(",")})`);
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
