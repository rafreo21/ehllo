import { buildWhenWeMetNote } from "./card-share-links.ts";
import { contactMethodHref } from "./contact-methods.ts";
import { splitFullName } from "./contacts.ts";
import { loadSharp, sharpAvailable } from "./sharp-runtime.ts";

export type CardVcardMethod = {
  method_type: string;
  value: string;
  label?: string | null;
};

export type VcardEmbeddedImage = {
  base64: string;
  mimeType: string;
};

export type CardVcardInput = {
  fullName: string;
  jobTitle?: string | null;
  company?: string | null;
  bio?: string | null;
  cardUrl: string;
  methods: CardVcardMethod[];
  showCompanyDetails?: boolean;
  scannedAt?: Date;
  /** The card owner's currently-happening event, if any — an activator: omit it and the note is unchanged. */
  eventTitle?: string | null;
  profilePhoto?: VcardEmbeddedImage | null;
  companyLogoPhoto?: VcardEmbeddedImage | null;
  profilePhotoUrl?: string | null;
  companyLogoUrl?: string | null;
  coverPhotoUrl?: string | null;
};

const MAX_VCARD_IMAGE_BYTES = 280_000;

const METHOD_LABELS: Record<string, string> = {
  website: "Website",
  link: "Link",
  linkedin: "LinkedIn",
  x: "X",
  instagram: "Instagram",
  threads: "Threads",
  facebook: "Facebook",
  youtube: "YouTube",
  snapchat: "Snapchat",
  tiktok: "TikTok",
  twitch: "Twitch",
  yelp: "Yelp",
  whatsapp: "WhatsApp",
  signal: "Signal",
  discord: "Discord",
  skype: "Skype",
  telegram: "Telegram",
  github: "GitHub",
  calendly: "Calendly",
  paypal: "PayPal",
  venmo: "Venmo",
  cashapp: "Cash App",
};

export function escapeVcard(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function normalizeTel(value: string) {
  const normalized = value.trim().replace(/[^\d+]/g, "");
  return normalized.startsWith("+")
    ? `+${normalized.slice(1).replace(/\+/g, "")}`
    : normalized.replace(/\+/g, "");
}

function buildStructuredName(fullName: string) {
  const { firstName, lastName } = splitFullName(fullName);
  return `${escapeVcard(lastName)};${escapeVcard(firstName)};;;`;
}

function vcardFilename(fullName: string) {
  return fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ehllo-contact";
}

function methodLabel(method: CardVcardMethod) {
  const custom = method.label?.trim();
  if (custom) return custom;
  return METHOD_LABELS[method.method_type] || method.method_type;
}

function appendLabeledUrl(lines: string[], itemIndex: number, label: string, href: string) {
  lines.push(`item${itemIndex}.URL:${escapeVcard(href)}`);
  lines.push(`item${itemIndex}.X-ABLabel:${escapeVcard(label)}`);
}

function defaultMethodLabel(methodType: string) {
  return METHOD_LABELS[methodType] || methodType;
}

function hasCustomMethodLabel(method: CardVcardMethod) {
  const custom = method.label?.trim();
  if (!custom) return false;
  const defaults = new Set([
    defaultMethodLabel(method.method_type),
    method.method_type,
  ].map((entry) => entry.toLowerCase()));
  return !defaults.has(custom.toLowerCase());
}

function appendLabeledItemField(
  lines: string[],
  itemIndex: number,
  field: "EMAIL" | "TEL" | "URL",
  fieldParams: string,
  value: string,
  label: string,
) {
  lines.push(`item${itemIndex}.${field}${fieldParams}:${escapeVcard(value)}`);
  lines.push(`item${itemIndex}.X-ABLabel:${escapeVcard(label)}`);
}

export type VcardMethodAppendOptions = {
  /** Drop website methods when company details are hidden. */
  showCompanyDetails?: boolean;
  /** Name, one email, and one phone only. */
  minimal?: boolean;
  /** Drop address and trim labeled URLs for QR size. */
  compact?: boolean;
  /** Cap labeled URL count after primary website handling (offline QR). */
  maxLabeledUrls?: number;
};

function shouldIncludeVcardMethod(method: CardVcardMethod, options: VcardMethodAppendOptions) {
  if (options.minimal) {
    return method.method_type === "email" || method.method_type === "phone";
  }
  if (options.compact && method.method_type === "address") {
    return false;
  }
  if (!(options.showCompanyDetails ?? true) && method.method_type === "website") {
    return false;
  }
  return true;
}

function shouldIncludeVcardLabeledUrl(method: CardVcardMethod, options: VcardMethodAppendOptions) {
  if (options.minimal) return false;
  if (options.compact) {
    return method.method_type === "linkedin"
      || method.method_type === "website"
      || method.method_type === "link";
  }
  return true;
}

/** Append every card method to vCard lines; nothing with a value is silently dropped. */
export function appendVcardMethods(
  lines: string[],
  methods: CardVcardMethod[],
  options: VcardMethodAppendOptions = {},
): { itemIndex: number; noteExtras: string[] } {
  const labeledUrls: Array<{ label: string; href: string }> = [];
  const noteExtras: string[] = [];
  let primaryWebsite: string | null = null;
  let itemIndex = 1;
  let emailCount = 0;
  let phoneCount = 0;
  const phoneNumbers = new Set<string>();

  for (const method of methods) {
    const value = method.value.trim();
    if (!value || !shouldIncludeVcardMethod(method, options)) continue;

    const label = methodLabel(method);
    const href = contactMethodHref({ type: method.method_type, value });
    const customLabel = hasCustomMethodLabel(method);

    if (method.method_type === "email") {
      if (options.minimal && emailCount > 0) continue;
      if (customLabel || emailCount > 0) {
        appendLabeledItemField(lines, itemIndex, "EMAIL", ";TYPE=INTERNET", value, label);
        itemIndex += 1;
      } else {
        lines.push(`EMAIL;TYPE=INTERNET:${escapeVcard(value)}`);
      }
      emailCount += 1;
      continue;
    }

    if (method.method_type === "phone") {
      const tel = normalizeTel(value);
      if (tel.length < 5) {
        noteExtras.push(`${label}: ${value}`);
        continue;
      }
      if (options.minimal && phoneCount > 0) continue;
      if (customLabel || phoneCount > 0) {
        appendLabeledItemField(lines, itemIndex, "TEL", ";TYPE=CELL,VOICE", tel, label);
        itemIndex += 1;
      } else {
        lines.push(`TEL;TYPE=CELL,VOICE:${escapeVcard(tel)}`);
      }
      phoneNumbers.add(tel);
      phoneCount += 1;
      continue;
    }

    if (method.method_type === "whatsapp") {
      const tel = normalizeTel(value);
      if (tel.length >= 5 && !phoneNumbers.has(tel)) {
        if (customLabel || phoneCount > 0) {
          appendLabeledItemField(lines, itemIndex, "TEL", ";TYPE=CELL,VOICE", tel, label);
          itemIndex += 1;
        } else {
          lines.push(`TEL;TYPE=CELL,VOICE:${escapeVcard(tel)}`);
        }
        phoneNumbers.add(tel);
        phoneCount += 1;
      }
      if (href && shouldIncludeVcardLabeledUrl(method, options)) {
        labeledUrls.push({ label, href });
      } else if (!href) {
        noteExtras.push(`${label}: ${value}`);
      }
      continue;
    }

    if (method.method_type === "address") {
      lines.push(`ADR;TYPE=WORK:;;${escapeVcard(value)};;;;`);
      continue;
    }

    if (method.method_type === "website" || method.method_type === "link" || method.method_type === "calendly") {
      if (!href) {
        noteExtras.push(`${label}: ${value}`);
        continue;
      }
      const usePrimary = !primaryWebsite && !customLabel && href.startsWith("http");
      if (usePrimary) {
        primaryWebsite = href;
        continue;
      }
      if (shouldIncludeVcardLabeledUrl(method, options)) {
        labeledUrls.push({ label, href });
      }
      continue;
    }

    if (!href) {
      noteExtras.push(`${label}: ${value}`);
      continue;
    }

    if (!shouldIncludeVcardLabeledUrl(method, options)) continue;

    if (href.startsWith("http") || href.startsWith("skype:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      labeledUrls.push({ label, href });
      continue;
    }

    noteExtras.push(`${label}: ${value}`);
  }

  if (primaryWebsite) {
    lines.push(`URL:${escapeVcard(primaryWebsite)}`);
  }

  let urlsToWrite = labeledUrls;
  if (typeof options.maxLabeledUrls === "number") {
    urlsToWrite = labeledUrls.slice(0, options.maxLabeledUrls);
  } else if (options.compact) {
    urlsToWrite = labeledUrls.slice(0, 2);
  }

  for (const entry of urlsToWrite) {
    if (primaryWebsite && entry.href === primaryWebsite) continue;
    appendLabeledUrl(lines, itemIndex, entry.label, entry.href);
    itemIndex += 1;
  }

  return { itemIndex, noteExtras };
}

export type VcardImageFields = Pick<
  CardVcardInput,
  "profilePhoto" | "companyLogoPhoto" | "profilePhotoUrl" | "companyLogoUrl" | "coverPhotoUrl" | "showCompanyDetails"
>;

function vcardImageType(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("png")) return "PNG";
  if (normalized.includes("gif")) return "GIF";
  if (normalized.includes("webp")) return "WEBP";
  return "JPEG";
}

export function foldVcardLine(line: string) {
  const maxLength = 75;
  if (line.length <= maxLength) return line;
  const chunks = [line.slice(0, maxLength)];
  let index = maxLength;
  while (index < line.length) {
    chunks.push(` ${line.slice(index, index + maxLength - 1)}`);
    index += maxLength - 1;
  }
  return chunks.join("\r\n");
}

function appendEmbeddedImage(lines: string[], property: string, image: VcardEmbeddedImage) {
  const type = vcardImageType(image.mimeType);
  // RFC 2426 defines only "b" (RFC 2047 shorthand) as a valid ENCODING value for
  // vCard 3.0 — "ENCODING=BASE64" is not spec-valid syntax at all, which is why it
  // silently failed to decode on iOS Contacts.
  lines.push(foldVcardLine(`${property};ENCODING=b;TYPE=${type}:${image.base64}`));
}

function appendImageUri(lines: string[], property: string, url: string) {
  lines.push(foldVcardLine(`${property};VALUE=URI:${escapeVcard(url.trim())}`));
}

export function appendVcardImages(lines: string[], input: VcardImageFields) {
  if (input.profilePhoto) {
    appendEmbeddedImage(lines, "PHOTO", input.profilePhoto);
  } else if (input.profilePhotoUrl?.trim()) {
    appendImageUri(lines, "PHOTO", input.profilePhotoUrl);
  }

  if (input.showCompanyDetails ?? true) {
    if (input.companyLogoPhoto) {
      appendEmbeddedImage(lines, "LOGO", input.companyLogoPhoto);
    } else if (input.companyLogoUrl?.trim()) {
      appendImageUri(lines, "LOGO", input.companyLogoUrl);
    }
  }
}

export async function fetchVcardImage(url: string): Promise<VcardEmbeddedImage | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const response = await fetch(trimmed, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "image/*" },
    });
    if (!response.ok) return null;

    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    if (!mimeType.startsWith("image/")) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) return null;
    if (!sharpAvailable()) return null;

    // Re-encode through sharp: strips EXIF/ICC-profile metadata and any orientation
    // flag, and forces a plain baseline sRGB JPEG. iOS Contacts' PHOTO decoder has been
    // seen to silently drop images it can't handle (no error, just no photo shown) —
    // camera-original files carry metadata a stricter embedded decoder may choke on.
    const sharp = await loadSharp();
    const normalized = await sharp(buffer)
      .rotate()
      .resize(320, 320, { fit: "cover" })
      .jpeg({ quality: 82, progressive: false, mozjpeg: false })
      .toBuffer();
    if (!normalized.length || normalized.length > MAX_VCARD_IMAGE_BYTES) return null;

    return {
      base64: normalized.toString("base64"),
      mimeType: "image/jpeg",
    };
  } catch {
    return null;
  }
}

export function buildCardVcard(input: CardVcardInput) {
  const whenWeMetNote = buildWhenWeMetNote(input.cardUrl, input.scannedAt, input.eventTitle ?? undefined);
  const showCompany = input.showCompanyDetails ?? true;
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "PRODID:-//Ehllo//Contact Card//EN",
    `N:${buildStructuredName(input.fullName)}`,
    `FN:${escapeVcard(input.fullName.trim())}`,
  ];

  appendVcardImages(lines, input);

  if (input.jobTitle?.trim()) lines.push(`TITLE:${escapeVcard(input.jobTitle.trim())}`);
  if (showCompany && input.company?.trim()) lines.push(`ORG:${escapeVcard(input.company.trim())}`);

  const { itemIndex, noteExtras } = appendVcardMethods(lines, input.methods, {
    showCompanyDetails: showCompany,
  });

  let nextItemIndex = itemIndex;
  const cardPage = input.cardUrl.trim();
  if (cardPage) {
    const cardAlreadyLinked = lines.some((line) => line.includes(cardPage));
    if (!cardAlreadyLinked) {
      appendLabeledUrl(lines, nextItemIndex, "Ehllo card", cardPage);
      nextItemIndex += 1;
    }
  }

  if (input.coverPhotoUrl?.trim()) {
    appendLabeledUrl(lines, nextItemIndex, "Cover photo", input.coverPhotoUrl.trim());
  }

  const noteParts = [
    input.bio?.trim(),
    ...noteExtras,
    whenWeMetNote,
  ].filter(Boolean);
  lines.push(`NOTE:${escapeVcard(noteParts.join("\n\n"))}`);
  lines.push("END:VCARD");

  return {
    body: `${lines.join("\r\n")}\r\n`,
    filename: vcardFilename(input.fullName),
  };
}
