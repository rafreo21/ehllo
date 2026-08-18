import { buildWalletLogoBuffers } from "./branded-qr.ts";

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return "rgb(22, 51, 0)";
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

export async function walletIconBuffers() {
  return buildWalletLogoBuffers();
}

export function buildApplePassJson(card: {
  slug: string;
  fullName: string;
  role: string;
  company: string;
  bio: string;
  themeColor: string;
  cardUrl: string;
  companyLogoUrl?: string;
  showCompany?: boolean;
}, certs: { passTypeId: string; teamId: string }) {
  const companyVisible = card.showCompany !== false && card.company.trim();
  const subtitle = [card.role, companyVisible ? card.company : ""].filter(Boolean).join(" · ");

  return {
    formatVersion: 1,
    passTypeIdentifier: certs.passTypeId,
    teamIdentifier: certs.teamId,
    organizationName: "ehllo",
    description: `${card.fullName} · ehllo card`,
    serialNumber: `${card.slug}-${Date.now()}`,
    // The wordmark already sits beside the logo, so the old headerFields entry
    // ("CARD: ehllo") printed the brand a second time in the top-right corner
    // and squeezed the name. One brand mark is enough.
    logoText: "ehllo",
    foregroundColor: "rgb(255, 255, 255)",
    backgroundColor: hexToRgb(card.themeColor || "#9fe870"),
    labelColor: "rgba(255, 255, 255, 0.72)",
    // iOS lays a glossy highlight over the strip unless told not to. On a
    // photograph it reads as a dated sheen across someone's face.
    suppressStripShine: true,
    // storeCard rather than generic. generic renders the photo as a small
    // thumbnail crowded against the name; storeCard gives the strip image the
    // full width, which is the shape the Google pass gets right - person first,
    // then who they are, then the code.
    storeCard: {
      headerFields: [],
      primaryFields: [{ key: "name", label: "", value: card.fullName }],
      secondaryFields: subtitle
        ? [{ key: "subtitle", label: "", value: subtitle }]
        : [],
      auxiliaryFields: [],
      backFields: [
        { key: "bio", label: "About", value: card.bio || "Scan the QR code to open my ehllo card." },
        { key: "link", label: "Card link", value: card.cardUrl },
      ],
    },
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: card.cardUrl,
        messageEncoding: "iso-8859-1",
        altText: "Scan to connect",
      },
    ],
  };
}

