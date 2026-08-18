import { buildWalletLogoBuffers } from "./branded-qr.ts";
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
      headerFields: [{ key: "kind", label: "", value: "Digital card" }],
      // Deliberately empty. PassKit draws primaryFields *on top of* the strip, so
      // anything here sits over the person's face; leaving it empty hands the whole
      // band to the photograph and moves the identity down into the field rows,
      // where it has its own space instead of competing with the image.
      primaryFields: [],
      // Title and description, one per row. Wallet renders a secondary value larger
      // than an auxiliary one, so the name reads as the heading and the occupation
      // as the line under it - without either needing a label, which Wallet would
      // otherwise print small and capitalised above the value, inverting the two.
      //
      // One field per row on purpose: a lone field gets the full width of the card,
      // which is the only lever we have to keep each on a single line. Wallet
      // truncates rather than wraps, and it decides where - so the fewer things
      // sharing a row, the more of the name survives.
      secondaryFields: [{ key: "name", label: "", value: card.fullName }],
      // Whatever the person filled in appears, in fixed positions: occupation in
      // the first column, company in the second. Each is omitted when empty rather
      // than rendering a blank cell, so a card with only a role shows only a role
      // and the row does not collapse to something lopsided. The third column stays
      // free.
      auxiliaryFields: [
        ...(card.role.trim() ? [{ key: "role", label: "", value: card.role.trim() }] : []),
        ...(companyVisible ? [{ key: "company", label: "", value: card.company.trim() }] : []),
      ],
      backFields: [
        // Company is on the front now, so the back carries only what cannot go
        // there: a paragraph a column would truncate, and the URL the QR encodes.
        { key: "bio", label: "About", value: card.bio || "Scan the QR code to open my ehllo card." },
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

