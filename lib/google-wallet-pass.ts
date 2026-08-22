import { createSign } from "node:crypto";

import { shortenCardUrlForQr } from "./apple-wallet-pass.ts";
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

/**
 * The pass logo: the ehllo mark.
 *
 * This preferred the profile photo, and heroImage is the profile photo too - so the
 * same picture appeared as a small badge at the top and again full-width, and the
 * brand appeared nowhere on the pass. Google's own pattern for that row is a logo
 * plus the issuer name, so the mark belongs here and the photograph belongs in the
 * ehllo-mark-round.png is the SVG pre-rendered to a transparent-cornered circle and
 * committed, rather than rasterised by a route: Google fetches logos over the
 * network, so a static file cannot fail at request time, and ehllo-mark.png is the
 * square export with the green flattened in.
 */
export function resolveGoogleWalletLogoUrl(card: WalletCardPayload) {
  try {
    const origin = new URL(card.cardUrl).origin.replace(/\/+$/, "");
    return `${origin}/ehllo-mark-round.png`;
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

/**
 * The class, carrying the one thing the console cannot set: the card-face template.
 *
 * Apple shows occupation and company on the front of the card. Android showed them
 * only in the details view, behind a tap - not because we sent anything different,
 * but because textModulesData reaches a Google pass's face only through
 * classTemplateInfo.cardTemplateOverride. Same decision on both platforms - show what
 * the person entered - was producing two different experiences.
 *
 * The class is otherwise empty and the Wallet console offers no template editor, so
 * this is the only place it can be set. One row, one item: the role_company module,
 * which is the occupation labelling the company. A reference to an id the object does
 * not carry renders nothing, so a card with neither field simply shows no row.
 *
 * PATCH rather than PUT, so anything configured in the console that we do not model
 * here - smart tap, callbacks, holder policy - survives being touched.
 */
async function ensureGoogleWalletCardTemplate(config: GoogleWalletConfig, token: string) {
  const classId = `${config.issuerId}.${config.classSuffix}`;
  const classTemplateInfo = {
    cardTemplateOverride: {
      cardRowTemplateInfos: [
        {
          oneItem: {
            item: {
              firstValue: {
                fields: [{ fieldPath: "object.textModulesData['role_company']" }],
              },
            },
          },
        },
      ],
    },
  };

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const url = `https://walletobjects.googleapis.com/walletobjects/v1/genericClass/${encodeURIComponent(classId)}`;

  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ classTemplateInfo }),
    });
    // Best effort by design. Without the template the pass still saves and still
    // works - occupation and company just stay one tap away. A layout preference must
    // never be the reason somebody cannot add their card.
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      console.error("[google-wallet] card template not applied", {
        classId,
        status: response.status,
        message: result?.error?.message ?? "",
      });
    }
  } catch (caught) {
    console.error("[google-wallet] card template patch threw", {
      classId,
      message: caught instanceof Error ? caught.message : String(caught),
    });
  }
}

/** Occupation as the label, company as the value - collapsing sensibly when only one is set. */
function roleCompanyModule(role: string, company: string) {
  if (role && company) return [{ id: "role_company", header: role, body: company }];
  if (role) return [{ id: "role_company", header: "Occupation", body: role }];
  if (company) return [{ id: "role_company", header: "Company", body: company }];
  return [];
}

/** Create or refresh the object first, then return a reference-only save URL. */
export async function prepareGoogleWalletSaveUrl(card: WalletCardPayload, config: GoogleWalletConfig) {
  const classId = `${config.issuerId}.${config.classSuffix}`;
  const objectId = `${config.issuerId}.${card.slug}`;
  const company = card.showCompany !== false ? card.company.trim() : "";
  const role = card.role.trim();
  const localized = (value: string) => ({ defaultValue: { language: "en-US", value } });

  const genericObject: Record<string, unknown> = {
    id: objectId,
    classId,
    state: "ACTIVE",
    hexBackgroundColor: card.themeColor.startsWith("#") ? card.themeColor : `#${card.themeColor}`,
    // Google's pattern for the top row is a logo beside the issuer name, with
    // `header` carrying the value the pass is actually about. These were inverted:
    // "ehllo Card" sat in the large slot while the person's own name was shrunk into
    // cardTitle. The brand goes where the brand goes, the person goes in the header.
    cardTitle: localized("ehllo"),
    header: localized(card.fullName),
    // Google draws the subheader above the header as a label for it, and "Digital
    // Card" is what it says - the occupation is not a label for a person's name, it
    // belongs in the row below with the company.
    subheader: localized("Digital Card"),
    barcode: {
      type: "QR_CODE",
      // Five characters shorter, which takes the code from 33x33 to 29x29 - bigger
      // modules in a box the wallet sizes itself, so it scans from further away.
      // app/c/[slug] resolves both forms; the URL people see is unchanged.
      value: shortenCardUrlForQr(card.cardUrl),
      // No alternate text. Google prints it under the code, and "Scan to connect"
      // restates what a QR on a business card obviously is.
      alternateText: "",
    },
    // Sentence case, not shouted: these sat as NAME / JOB TITLE / COMPANY beside a
    // normally-cased "About", which read like three different authors.
    //
    // Each row is omitted when empty. Role and company used to fall back to a single
    // space, which is not nothing - it renders a labelled blank row in the details
    // view, so an incomplete card looked broken rather than incomplete.
    // One row carrying both: the occupation labels the company, which is Google's
    // header/body convention used the way it reads best - "Product Designer" over
    // "Studio Nine".
    //
    // The id stays "role_company" whatever the job title is. A class template
    // references a field by id, so deriving the id from the occupation would mean the
    // template resolved for one person and silently rendered nothing for everyone
    // else.
    //
    // When only one of the two exists there is no label/value pair to make, so the
    // field names itself rather than showing a header with nothing under it. Omitted
    // entirely when both are blank - never a labelled empty row.
    textModulesData: [
      ...roleCompanyModule(role, company),
      // Only if they wrote one. This fell back to "Tap to open my ehllo card." -
      // words the person never typed, shown as their own About.
      ...(card.bio.trim() ? [{ id: "bio", header: "About", body: card.bio.trim() }] : []),
    ],
    linksModuleData: {
      uris: [{ uri: card.cardUrl, description: "Open ehllo card", id: "card_link" }],
    },
  };
  // contentDescription is what a screen reader announces in place of the image, and
  // Google's own pass-builder example carries it on both. Without it the two images
  // on the pass are unlabelled, which on a pass whose whole purpose is identifying a
  // person is the wrong thing to leave silent.
  if (card.profileImageUrl?.trim()) {
    genericObject.heroImage = {
      sourceUri: { uri: card.profileImageUrl.trim() },
      contentDescription: localized(`${card.fullName}'s photo`),
    };
  }
  const logoUrl = resolveGoogleWalletLogoUrl(card);
  if (logoUrl) {
    genericObject.logo = {
      sourceUri: { uri: logoUrl },
      contentDescription: localized("ehllo"),
    };
  }

  const token = await googleWalletAccessToken(config);
  await ensureGoogleWalletCardTemplate(config, token);
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
