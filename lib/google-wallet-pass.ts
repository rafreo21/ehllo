import { createSign } from "node:crypto";

import type { GoogleWalletConfig, WalletCardPayload } from "./wallet-config";

/** Hostnames allowed to initiate save links (Google expects domain names, not full origins). */
export function walletJwtOrigins(cardUrl: string) {
  const origins = new Set<string>();
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();

  for (const raw of [configured, cardUrl]) {
    if (!raw?.trim()) continue;
    try {
      const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
      origins.add(url.hostname);
    } catch {
      // Ignore invalid URLs.
    }
  }

  return [...origins];
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function signJwt(payload: Record<string, unknown>, config: GoogleWalletConfig) {
  const header = { alg: "RS256", typ: "JWT" };
  const encoded = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(encoded);
  signer.end();
  return `${encoded}.${signer.sign(config.privateKey, "base64url")}`;
}

/** Pass list icon and header logo — profile first, then company mark, then hosted ehllo mark. */
export function resolveGoogleWalletLogoUrl(card: WalletCardPayload) {
  const profile = card.profileImageUrl?.trim();
  if (profile) return profile;

  const companyVisible = card.showCompany !== false && card.companyLogoUrl?.trim();
  if (companyVisible) return companyVisible;

  try {
    const origin = new URL(card.cardUrl).origin.replace(/\/+$/, "");
    return `${origin}/aftermeet-mark.png`;
  } catch {
    return "";
  }
}

function resolveAfterMeetMarkUrl(card: WalletCardPayload) {
  try {
    const origin = new URL(card.cardUrl).origin.replace(/\/+$/, "");
    return `${origin}/aftermeet-mark.png`;
  } catch {
    return "";
  }
}

function resolveBrandedQrImageUrl(card: WalletCardPayload) {
  try {
    const origin = new URL(card.cardUrl).origin.replace(/\/+$/, "");
    return `${origin}/api/public/branded-qr/${encodeURIComponent(card.slug)}?size=512`;
  } catch {
    return "";
  }
}

export function buildGoogleWalletSaveUrl(card: WalletCardPayload, config: GoogleWalletConfig) {
  const classId = `${config.issuerId}.${config.classSuffix}`;
  const objectId = `${config.issuerId}.${card.slug}`;
  const companyVisible = card.showCompany !== false && card.company.trim();
  const companyLabel = companyVisible || " ";
  const genericObject: Record<string, unknown> = {
    id: objectId,
    classId,
    state: "ACTIVE",
    hexBackgroundColor: card.themeColor.startsWith("#") ? card.themeColor : `#${card.themeColor}`,
    cardTitle: {
      defaultValue: { language: "en-US", value: card.fullName },
    },
    header: {
      defaultValue: { language: "en-US", value: "ehllo Card" },
    },
    subheader: {
      defaultValue: { language: "en-US", value: card.role || companyLabel.trim() || "Digital card" },
    },
    barcode: {
      type: "QR_CODE",
      value: card.cardUrl,
      alternateText: "Scan to connect",
    },
    textModulesData: [
      { id: "name", header: "NAME", body: card.fullName },
      { id: "role", header: "JOB TITLE", body: card.role || " " },
      { id: "company", header: "COMPANY", body: companyLabel },
      { id: "bio", header: "About", body: card.bio || "Tap to open my ehllo card." },
    ],
    linksModuleData: {
      uris: [
        {
          uri: card.cardUrl,
          description: "Open ehllo card",
          id: "card_link",
        },
      ],
    },
  };

  if (card.profileImageUrl?.trim()) {
    genericObject.heroImage = {
      sourceUri: { uri: card.profileImageUrl.trim() },
    };
  }

  const logoUrl = resolveGoogleWalletLogoUrl(card);
  if (logoUrl) {
    genericObject.logo = { sourceUri: { uri: logoUrl } };
  }

  const brandedQrUrl = resolveBrandedQrImageUrl(card);
  if (brandedQrUrl) {
    genericObject.imageModulesData = [
      {
        id: "aftermeet_qr",
        mainImage: {
          sourceUri: { uri: brandedQrUrl },
          contentDescription: {
            defaultValue: { language: "en-US", value: "ehllo branded QR code" },
          },
        },
      },
    ];
  }

  const afterMeetMarkUrl = resolveAfterMeetMarkUrl(card);
  const genericClass: Record<string, unknown> = {
    id: classId,
    classTemplateInfo: {
      cardTemplateOverride: {
        cardRowTemplateInfos: [
          {
            twoItems: {
              startItem: {
                firstValue: {
                  fields: [{ fieldPath: "object.textModulesData['role']" }],
                },
              },
              endItem: {
                firstValue: {
                  fields: [{ fieldPath: "object.textModulesData['company']" }],
                },
              },
            },
          },
        ],
      },
    },
  };

  if (afterMeetMarkUrl) {
    genericClass.logo = { sourceUri: { uri: afterMeetMarkUrl } };
  }

  const payload = {
    iss: config.serviceAccountEmail,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    origins: walletJwtOrigins(card.cardUrl),
    payload: {
      genericClasses: [genericClass],
      genericObjects: [genericObject],
    },
  };

  const token = signJwt(payload, config);
  return `https://pay.google.com/gp/v/save/${token}`;
}
