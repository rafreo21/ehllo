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
  return {
    formatVersion: 1,
    passTypeIdentifier: certs.passTypeId,
    teamIdentifier: certs.teamId,
    organizationName: "ehllo",
    description: `${card.fullName} · ehllo card`,
    serialNumber: `${card.slug}-${Date.now()}`,
    logoText: companyVisible ? card.company : "ehllo",
    foregroundColor: "rgb(255, 255, 255)",
    backgroundColor: hexToRgb(card.themeColor || "#9fe870"),
    labelColor: "rgb(22, 51, 0)",
    generic: {
      headerFields: [
        {
          key: "card_type",
          label: "CARD",
          value: "ehllo",
        },
      ],
      primaryFields: [{ key: "name", label: "NAME", value: card.fullName }],
      secondaryFields: card.role
        ? [{ key: "role", label: "JOB TITLE", value: card.role }]
        : [],
      auxiliaryFields: companyVisible
        ? [{ key: "company", label: "COMPANY", value: card.company }]
        : [],
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
