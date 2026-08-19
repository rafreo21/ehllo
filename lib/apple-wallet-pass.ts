import { buildWalletLogoBuffers } from "./branded-qr.ts";
import { createPassAuthenticationToken } from "./wallet-pass-auth.ts";
import {
  isDarkThemeColor,
  normalizeThemeColor,
  themeForegroundColor,
} from "./theme-contrast.ts";

function hexChannels(hex: string) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function hexToRgb(hex: string) {
  const channels = hexChannels(hex);
  if (!channels) return "rgb(22, 51, 0)";
  return `rgb(${channels.r}, ${channels.g}, ${channels.b})`;
}

/**
 * The label colour, already flattened against the card.
 *
 * pass.json takes rgb() values, so an alpha-based muted colour cannot be handed
 * over as-is - it has to be resolved against whatever the card sits on first.
 */
function labelRgbForTheme(themeHex: string) {
  const theme = hexChannels(normalizeThemeColor(themeHex)) ?? { r: 159, g: 232, b: 112 };
  if (!isDarkThemeColor(themeHex)) return hexToRgb("#53634D");
  const mix = (channel: number) => Math.round(channel * 0.22 + 255 * 0.78);
  return `rgb(${mix(theme.r)}, ${mix(theme.g)}, ${mix(theme.b)})`;
}

/**
 * Drops the generated "card-" prefix from a card URL's slug, leaving everything
 * else alone. A custom slug never carries the prefix, so it passes through
 * untouched.
 */
export function shortenCardUrlForQr(cardUrl: string) {
  return cardUrl.replace(/\/c\/card-([a-f0-9]{16})(?=$|[?#])/i, "/c/$1");
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
  showCompany?: boolean;
}, certs: { passTypeId: string; teamId: string }) {
  // Collapse runs of whitespace: a card in the wild already carries "Product  Designer"
  // with a double space, and a pass prints exactly what it is given.
  const tidy = (value: string) => value.replace(/\s+/g, " ").trim();
  const role = tidy(card.role);
  const company = tidy(card.company);
  const companyVisible = card.showCompany !== false && company;

  const authenticationToken = createPassAuthenticationToken(card.slug);
  let walletServiceUrl: string | null = null;
  try {
    walletServiceUrl = `${new URL(card.cardUrl).origin}/api/wallet`;
  } catch {
    // A card URL we cannot parse means we cannot name a service host either. The
    // pass is still valid without one.
    walletServiceUrl = null;
  }

  return {
    formatVersion: 1,
    passTypeIdentifier: certs.passTypeId,
    teamIdentifier: certs.teamId,
    organizationName: "ehllo",
    description: `${card.fullName} · ehllo card`,
    // The card's slug, and nothing else. This is the pass's identity: Wallet
    // treats two passes with the same passTypeIdentifier and serialNumber as the
    // same pass, so a stable value means re-adding a card updates the one already
    // in Wallet instead of stacking another copy beside it - and it is the
    // precondition for ever pushing an update to a pass at all.
    //
    // Safe as a global identity: cards.slug carries a UNIQUE index on the column
    // by itself, not merely per workspace, so two cards cannot share one.
    //
    // Passes handed out before this change carry a timestamped serial and are
    // orphaned by it - Wallet has no way to merge them, so anyone holding one
    // keeps a stale pass until they add the card again.
    serialNumber: card.slug,
    // Update service. Present only as a pair: a webServiceURL without a token, or a
    // token without a URL, is a pass iOS rejects outright - so if the signing secret
    // that derives the token is absent, both are omitted and the pass stays a
    // one-shot copy rather than a broken one.
    //
    // The origin comes off cardUrl instead of an environment variable so it always
    // matches the host that actually served the pass; staging passes then talk to
    // staging and production to production with nothing to keep in step by hand.
    // Apple appends /v1/... to whatever is given here, which is why this stops at
    // /api/wallet.
    ...(walletServiceUrl && authenticationToken
      ? { webServiceURL: walletServiceUrl, authenticationToken }
      : {}),
    // The wordmark already sits beside the logo, so the old headerFields entry
    // ("CARD: ehllo") printed the brand a second time in the top-right corner
    // and squeezed the name. One brand mark is enough.
    logoText: "ehllo",
    // The colour the person picked when they made the card, and text that stays
    // readable on it. These were hardcoded to white, which only works on a dark
    // theme: ehllo's own default (#9FE870) and every other light choice rendered
    // white text on a light card. themeForegroundColor is the same luminance test
    // the rest of the app already uses, so the pass now agrees with the card.
    foregroundColor: hexToRgb(themeForegroundColor(card.themeColor || "#9FE870")),
    backgroundColor: hexToRgb(normalizeThemeColor(card.themeColor)),
    labelColor: labelRgbForTheme(card.themeColor || "#9FE870"),
    // iOS lays a glossy highlight over the strip unless told not to. On a
    // photograph it reads as a dated sheen across someone's face.
    suppressStripShine: true,
    // storeCard rather than generic. generic renders the photo as a small
    // thumbnail crowded against the name; storeCard gives the strip image the
    // full width, which is the shape the Google pass gets right - person first,
    // then who they are, then the code.
    storeCard: {
      // Top-right. Says what the pass is, which nothing else on the front does.
      // A value, not a label, because those are the only two sizes Wallet offers
      // here and the value is the one that sits beside the wordmark rather than
      // above it. Measured on an iPhone 17 Pro at 3x: as a value the cap height is
      // 44px on a baseline of 717, against the wordmark's 40px ascender on 704 -
      // near enough the same optical size, near enough the same line. As a label it
      // dropped to a 24px cap on a baseline of 657, which read as small print
      // floating above the brand rather than sitting with it.
      //
      // There is no third size and no per-field colour, so this cannot be tuned
      // further from pass.json. If it still carries too much weight, the lever is
      // the wording - a shorter string occupies less of the row at the same size.
      headerFields: [{ key: "kind", label: "", value: "Digital card" }],
      // The name, as the one hero value - the shape Apple's own storeCard example
      // uses, where primaryFields holds the thing the card is about and
      // secondaryFields is left out entirely.
      //
      // This is the only tier that renders large and on a line of its own. That
      // matters because secondaryFields and auxiliaryFields do NOT stack: measured
      // on an iPhone 17 Pro, Wallet packs them onto a single row whenever they
      // fit, so name-in-secondary plus role-and-company-in-auxiliary came out as
      // three items abreast at one size, with no hierarchy at all. Two separate
      // arrangements were tried and both collapsed the same way.
      //
      // PassKit draws primaryFields over the strip, so the name lands on the
      // photograph and the strip carries a scrim behind it - see the composite in
      // apple-wallet-pack.
      primaryFields: [{ key: "name", label: "", value: card.fullName }],
      // Occupation then company, on the row beneath the strip. Each is dropped
      // when blank rather than rendering an empty cell, so a card with only a role
      // shows only a role instead of a lopsided gap.
      //
      // No labels. Apple's example labels every field because "10" means nothing
      // without "Rewards Value"; an occupation and a company name say what they
      // are, and "OCCUPATION" stamped above each one is noise on a business card.
      auxiliaryFields: [
        ...(role ? [{ key: "role", label: "", value: role }] : []),
        ...(companyVisible ? [{ key: "company", label: "", value: company }] : []),
      ],
      backFields: [
        // Company is on the front now, so the back carries only what cannot go
        // there: a paragraph a column would truncate, and the URL the QR encodes.
        //
        // About appears only if the person wrote one. It used to fall back to
        // "Scan the QR code to open my ehllo card." - words they never typed,
        // printed under their name as though they had. The pass shows what the card
        // editor holds and nothing else.
        ...(card.bio.trim() ? [{ key: "bio", label: "About", value: card.bio.trim() }] : []),
        { key: "link", label: "Card link", value: card.cardUrl },
      ],
    },
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        // The short form: same URL with "card-" dropped from the slug. Those five
        // characters are the whole difference between a 33x33 code and a 29x29 one,
        // and a 29x29 has visibly chunkier modules in the box iOS draws - which is
        // the only lever there is, since the format has no size key. app/c/[slug]
        // resolves both forms, and the card URL people see is unchanged.
        message: shortenCardUrlForQr(card.cardUrl),
        messageEncoding: "iso-8859-1",
        altText: "Scan to connect",
      },
    ],
  };
}

