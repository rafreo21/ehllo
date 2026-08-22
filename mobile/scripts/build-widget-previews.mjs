// Builds the three PNGs the Android widget picker shows.
//
// These used to be drawn by a hand-rolled rasteriser (plugins/widget-preview-pngs.js) which had
// no font support, so every line of text was a grey rectangle. In the picker that reads as a
// broken skeleton rather than a preview of the product - which is exactly how it looked.
//
// This renders real SVG with the app's own Airbnb Cereal embedded, rasterised by sharp, and the
// output is committed so the Expo plugin only has to copy it. sharp is not a mobile dependency,
// which is why this is a one-off script rather than something the plugin runs at prebuild.
//
//   node scripts/build-widget-previews.mjs
//
// Keep these in step with mobile/widgets/*.tsx and plugins/withAndroidQuickShareWidget.js.
import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import QRCode from "qrcode";
import sharp from "../../node_modules/sharp/dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(here, "..");
const outDir = path.join(mobileRoot, "assets", "widget-previews");

// The palette the widgets actually use now.
const C = {
  canvas: "#000000",
  accent: "#87EA5C",
  text: "#FFFFFF",
  muted: "#BDBDBD",
  subtle: "#8F8F8F",
  chip: "#4E4E4E",
  avatar: "#5DC154",
  qrDark: "#163300",
};

function fontCss() {
  const regular = fs.readFileSync(path.join(mobileRoot, "assets/fonts/AirbnbCereal_W_Bk.otf")).toString("base64");
  const medium = fs.readFileSync(path.join(mobileRoot, "assets/fonts/AirbnbCereal_W_Md.otf")).toString("base64");
  return `
    @font-face { font-family: 'Cereal'; font-weight: 400;
      src: url(data:font/otf;base64,${regular}) format('opentype'); }
    @font-face { font-family: 'Cereal'; font-weight: 600;
      src: url(data:font/otf;base64,${medium}) format('opentype'); }
    text { font-family: 'Cereal', sans-serif; }
  `;
}

async function qrSvgPaths(size) {
  // A real code, so the preview shows the thing the widget shows.
  const matrix = QRCode.create("https://ehllo.io/c/demo", { errorCorrectionLevel: "Q" });
  const count = matrix.modules.size;
  const data = matrix.modules.data;
  const cell = size / count;
  let d = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!data[row * count + col]) continue;
      const x = (col * cell).toFixed(2);
      const y = (row * cell).toFixed(2);
      const s = Math.max(cell, 0.5).toFixed(2);
      d += `M${x},${y}h${s}v${s}h-${s}z`;
    }
  }
  return `<path d="${d}" fill="${C.qrDark}"/>`;
}

// A white card with the code inset by its quiet zone and the ringed logo in the middle -
// the same construction composeQrCard draws on the device.
async function qrCard(x, y, side) {
  const inset = Math.round(side * 0.054);
  const code = side - inset * 2;
  const logo = Math.round(code * 0.26);
  const ring = Math.round(logo * 1.34);
  const paths = await qrSvgPaths(code);
  return `
    <g transform="translate(${x},${y})">
      <rect width="${side}" height="${side}" rx="${(side * 0.055).toFixed(1)}" fill="#FFFFFF"/>
      <g transform="translate(${inset},${inset})">${paths}</g>
      <rect x="${(side - ring) / 2}" y="${(side - ring) / 2}" width="${ring}" height="${ring}"
            rx="${(ring * 0.22).toFixed(1)}" fill="#FFFFFF"/>
      <rect x="${(side - logo) / 2}" y="${(side - logo) / 2}" width="${logo}" height="${logo}"
            rx="${(logo * 0.22).toFixed(1)}" fill="${C.accent}"/>
    </g>`;
}

async function qrScanPreview() {
  // Transparent around the card, because that is what the widget looks like now.
  const size = 440;
  const side = Math.round(size * 0.82);
  const offset = Math.round((size - side) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${await qrCard(offset, offset, side)}
  </svg>`;
}

async function businessCardPreview() {
  const w = 1000;
  const h = 440;
  const pad = 32;
  const side = 340;
  const textX = pad + side + 44;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><style>${fontCss()}</style></defs>
    <rect x="0" y="${(h - (side + pad * 2)) / 2}" width="${w}" height="${side + pad * 2}" rx="72" fill="${C.canvas}"/>
    ${await qrCard(pad, (h - side) / 2, side)}
    <circle cx="${textX + 40}" cy="${h / 2 - 96}" r="40" fill="${C.avatar}"/>
    <text x="${textX}" y="${h / 2 + 4}" font-size="62" font-weight="600" fill="${C.text}">Alex Morgan</text>
    <text x="${textX}" y="${h / 2 + 74}" font-size="46" fill="${C.muted}">Product Designer</text>
    <text x="${textX}" y="${h / 2 + 138}" font-size="46" fill="${C.subtle}">ehllo</text>
  </svg>`;
}

function connectionRow(y, initial, name, when, withActions) {
  const avatar = 74;
  const x = 44;
  return `
    <circle cx="${x + avatar / 2}" cy="${y + avatar / 2}" r="${avatar / 2}" fill="${C.avatar}"/>
    <text x="${x + avatar / 2}" y="${y + avatar / 2 + 16}" font-size="38" font-weight="600"
          fill="${C.text}" text-anchor="middle">${initial}</text>
    <text x="${x + avatar + 26}" y="${y + 32}" font-size="46" font-weight="600" fill="${C.text}">${name}</text>
    <text x="${x + avatar + 26}" y="${y + 88}" font-size="38" fill="${C.muted}">${when}</text>
    ${withActions ? `
      <circle cx="${1000 - 44 - 150}" cy="${y + avatar / 2}" r="34" fill="${C.chip}"/>
      <circle cx="${1000 - 44 - 44}" cy="${y + avatar / 2}" r="34" fill="${C.chip}"/>` : ""}`;
}

async function connectionsPreview() {
  const w = 1000;
  const h = 440;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><style>${fontCss()}</style></defs>
    <rect x="0" y="34" width="${w}" height="${h - 68}" rx="72" fill="${C.canvas}"/>
    <text x="44" y="118" font-size="40" font-weight="600" fill="${C.accent}">Recent Connections</text>
    ${connectionRow(160, "A", "Alex Morgan", "Connected 2 mins ago", true)}
    ${connectionRow(280, "C", "Chris Bailey", "Connected 1 day ago", true)}
  </svg>`;
}

const targets = [
  ["aftermeet_widget_preview_qr_scan.png", await qrScanPreview()],
  ["aftermeet_widget_preview_business_card.png", await businessCardPreview()],
  ["aftermeet_widget_preview_connections.png", await connectionsPreview()],
];

fs.mkdirSync(outDir, { recursive: true });
for (const [name, svg] of targets) {
  const out = path.join(outDir, name);
  await sharp(Buffer.from(svg)).png().toFile(out);
  const meta = await sharp(out).metadata();
  console.log(`  ${name}  ${meta.width}x${meta.height}  ${fs.statSync(out).size} bytes`);
}
console.log(`written to ${path.relative(mobileRoot, outDir)}`);
