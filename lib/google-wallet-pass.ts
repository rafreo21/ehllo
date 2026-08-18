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

/** Pass list icon and header logo - profile first, then company mark, then hosted ehllo mark. */
export function resolveGoogleWalletLogoUrl(card: WalletCardPayload) {
  const profile = card.profileImageUrl?.trim();
  if (profile) return profile;

  const companyVisible = card.showCompany !== false && card.companyLogoUrl?.trim();
  if (companyVisible) return companyVisible;

  try {
    const origin = new URL(card.cardUrl).origin.replace(/\/+$/, "");
    return `${origin}/ehllo-mark.png`;
  } catch {
    return "";
  }
}

export function buildGoogleWalletSaveUrl(card: WalletCardPayload, config: GoogleWalletConfig) {
  const classId = `${config.issuerId}.${config.classSuffix}`;
  const objectId = `${config.issuerId}.${card.slug}`;
  const payload = {
    iss: config.serviceAccountEmail,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    origins: walletJwtOrigins(card.cardUrl),
    payload: {
      // Google recommends a minimal id/classId pair when linking an object
      // that has already been created through the Wallet Objects API.
      genericObjects: [{ id: objectId, classId }],
    },
  };

  const token = signJwt(payload, config);
  return `https://pay.google.com/gp/v/save/${token}`;
}

async function googleWalletAccessToken(config: GoogleWalletConfig) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt({
    iss: config.serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }, config);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const result = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || "Google Wallet authorization failed.");
  }
  return result.access_token;
}

/** Create or refresh the object first, then return a reference-only save URL. */
export async function prepareGoogleWalletSaveUrl(card: WalletCardPayload, config: GoogleWalletConfig) {
  const classId = `${config.issuerId}.${config.classSuffix}`;
  const objectId = `${config.issuerId}.${card.slug}`;
  const companyVisible = card.showCompany !== false && card.company.trim();
  const companyLabel = companyVisible || " ";
  const genericObject: Record<string, unknown> = {
    id: objectId,
    classId,
    state: "ACTIVE",
    hexBackgroundColor: card.themeColor.startsWith("#") ? card.themeColor : `#${card.themeColor}`,
    cardTitle: { defaultValue: { language: "en-US", value: card.fullName } },
    header: { defaultValue: { language: "en-US", value: "ehllo Card" } },
    subheader: {
      defaultValue: { language: "en-US", value: card.role || companyLabel.trim() || "Digital card" },
    },
    barcode: { type: "QR_CODE", value: card.cardUrl, alternateText: "Scan to connect" },
    textModulesData: [
      { id: "name", header: "NAME", body: card.fullName },
      { id: "role", header: "JOB TITLE", body: card.role || " " },
      { id: "company", header: "COMPANY", body: companyLabel },
      { id: "bio", header: "About", body: card.bio || "Tap to open my ehllo card." },
    ],
    linksModuleData: {
      uris: [{ uri: card.cardUrl, description: "Open ehllo card", id: "card_link" }],
    },
  };
  if (card.profileImageUrl?.trim()) {
    genericObject.heroImage = { sourceUri: { uri: card.profileImageUrl.trim() } };
  }
  const logoUrl = resolveGoogleWalletLogoUrl(card);
  if (logoUrl) genericObject.logo = { sourceUri: { uri: logoUrl } };

  const token = await googleWalletAccessToken(config);
  const resourceUrl = `https://walletobjects.googleapis.com/walletobjects/v1/genericObject/${encodeURIComponent(objectId)}`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const current = await fetch(resourceUrl, { headers });
  const response = current.status === 404
    ? await fetch("https://walletobjects.googleapis.com/walletobjects/v1/genericObject", {
        method: "POST",
        headers,
        body: JSON.stringify(genericObject),
      })
    : await fetch(resourceUrl, {
        method: "PUT",
        headers,
        body: JSON.stringify(genericObject),
      });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(result?.error?.message || "Google Wallet could not prepare this pass.");
  }
  return buildGoogleWalletSaveUrl(card, config);
}
